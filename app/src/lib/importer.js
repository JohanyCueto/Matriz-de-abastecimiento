import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'
import { PROGRAMACION_COLUMNS, EDITABLE_ON_APP, INGRESOS_COLUMNS, INGRESOS_RAW_COLUMNS } from './schema'

const cleanText = v => {
  if (v == null) return null
  const s = String(v).replace(/_x000[dD]_/g, '').replace(/_x000[aA]_/g, ' ').trim()
  return s === '' ? null : s
}
const isoDate = v => {
  if (v == null || v === '') return null
  const d = v instanceof Date ? v : new Date(v)
  if (isNaN(d)) return null
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const toNumber = v => (v == null || v === '') ? null : Number(v)
const toInt = v => (v == null || v === '') ? null : parseInt(v, 10)
// El archivo de ingresos a veces trae el numero de OC como "OC2500003055"
// en vez de 2500003055. Se le quita cualquier letra pegada adelante.
const toOc = v => {
  if (v == null || v === '') return null
  const s = String(v).replace(/^\D+/, '').trim()
  return s === '' ? null : parseInt(s, 10)
}

function convertCell(type, value) {
  if (type === 'date') return isoDate(value)
  if (type === 'number') return toNumber(value)
  if (type === 'int') return toInt(value)
  if (type === 'oc') return toOc(value)
  return cleanText(value)
}

export function mapRow(rawRow, columns) {
  const out = {}
  for (const { header, field, type } of columns) out[field] = convertCell(type, rawRow[header])
  return out
}

async function fetchAll(table, select) {
  const pageSize = 1000
  let from = 0
  let all = []
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1)
    if (error) throw error
    all = all.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function upsertInBatches(table, rows, onConflict, size = 200) {
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size)
    const { error } = await supabase.from(table).upsert(batch, { onConflict })
    if (error) throw error
  }
}

async function registrarImportacion(tipo, archivo, filas) {
  const { error } = await supabase.from('importaciones').insert({ tipo, archivo, filas })
  if (error) throw error
}

async function insertInBatches(table, rows, size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size)
    if (!batch.length) continue
    const { error } = await supabase.from(table).insert(batch)
    if (error) throw error
  }
}

// Reparte los ingresos de una OC+SKU entre sus entregas en orden (E01 antes
// que E02), y marca en que fecha se completo cada una. Asi lo hace hoy el
// Excel de Johany: el proveedor entrega la E01 completa antes de mandar la E02.
export function calcularIngresos(entregas, eventos) {
  entregas.sort((a, b) => (a.orden_entrega || 0) - (b.orden_entrega || 0))
  eventos.sort((a, b) => (a.fecha_ingreso || '').localeCompare(b.fecha_ingreso || ''))

  let entregaIdx = 0
  let acumuladoEnEntrega = 0
  for (const ev of eventos) {
    let restante = ev.cantidad_ingresada || 0
    while (restante > 0 && entregaIdx < entregas.length) {
      const e = entregas[entregaIdx]
      const falta = (e.cant_programada || 0) - acumuladoEnEntrega
      const usar = Math.min(restante, Math.max(falta, 0))
      acumuladoEnEntrega += usar
      restante -= usar
      if (acumuladoEnEntrega >= (e.cant_programada || 0)) {
        e._fechaCompleta = ev.fecha_ingreso
        entregaIdx++
        acumuladoEnEntrega = 0
      }
    }
  }
  const totalIngresado = eventos.reduce((a, e) => a + (e.cantidad_ingresada || 0), 0)
  let restanteGlobal = totalIngresado
  for (const e of entregas) {
    const fill = Math.min(restanteGlobal, e.cant_programada || 0)
    restanteGlobal -= fill
    const saldo = (e.cant_programada || 0) - fill
    e.cant_ingresada = fill
    e.saldo_pendiente = saldo
    e.pct_ingreso = e.cant_programada ? Math.round((fill / e.cant_programada) * 1000) / 10 : 0
    e.estado_ingreso = fill <= 0 ? 'Pendiente' : (saldo > 0 ? 'Parcial' : 'Completo')
    e.fecha_real_ingreso = e._fechaCompleta || null
    e.dias_atraso = (e.fecha_real_ingreso && e.fecha_programada_ingreso)
      ? Math.max(0, Math.round((new Date(e.fecha_real_ingreso) - new Date(e.fecha_programada_ingreso)) / 864e5))
      : null
    e.valor_ingresado = e.precio_unitario != null ? Math.round(e.precio_unitario * fill * 100) / 100 : null
    e.valor_pendiente = e.precio_unitario != null ? Math.round(e.precio_unitario * saldo * 100) / 100 : null
    delete e._fechaCompleta
  }
}

// Junta entregas y eventos de ingreso por OC+SKU, y llama a calcularIngresos
// en cada grupo. Lo usan tanto el importador del Excel combinado como el
// del archivo de ingresos aparte.
function recalcularGrupos(entregas, eventos) {
  const eventosPorGrupo = new Map()
  for (const ev of eventos) {
    const k = `${ev.oc}|${ev.codigo}`
    if (!eventosPorGrupo.has(k)) eventosPorGrupo.set(k, [])
    eventosPorGrupo.get(k).push(ev)
  }
  const entregasPorGrupo = new Map()
  for (const e of entregas) {
    const k = `${e.oc}|${e.sku}`
    if (!entregasPorGrupo.has(k)) entregasPorGrupo.set(k, [])
    entregasPorGrupo.get(k).push(e)
  }
  for (const [k, grupo] of entregasPorGrupo) calcularIngresos(grupo, eventosPorGrupo.get(k) || [])
}

export async function importarExcel(file, onStep) {
  onStep?.('Leyendo el archivo...')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })

  const shProg = wb.Sheets['ProgramacionOC']
  const shIng = wb.Sheets['IngresosSistema']
  if (!shProg || !shIng) {
    throw new Error('El archivo no tiene las hojas "ProgramacionOC" e "IngresosSistema" esperadas.')
  }
  const rawProg = XLSX.utils.sheet_to_json(shProg, { defval: null })
  const rawIng = XLSX.utils.sheet_to_json(shIng, { defval: null })

  onStep?.('Revisando lo que ya tienes guardado...')
  const existentesProg = await fetchAll('programacion_oc',
    'id_entrega,fecha_programada_ingreso,estado_gestion,motivo_demora,responsable_accion,criticidad,observaciones,cierre_manual,motivo_cierre,reabierta,historial')
  const existentesPorId = new Map(existentesProg.map(r => [r.id_entrega, r]))

  const existentesIng = await fetchAll('ingresos_sistema', 'numero_analisis,oc,codigo,cantidad_ingresada,fecha_ingreso')
  const numerosExistentes = new Set(existentesIng.map(r => r.numero_analisis))

  onStep?.('Preparando las entregas...')
  const entregas = rawProg.map(raw => {
    const base = mapRow(raw, PROGRAMACION_COLUMNS)
    const prev = existentesPorId.get(base.id_entrega)
    const editable = {}
    for (const col of EDITABLE_ON_APP) {
      editable[col.field] = prev ? prev[col.field] : convertCell(col.type, raw[col.header])
    }
    return {
      ...base,
      ...editable,
      // Una vez que la fila existe, la fecha programada solo cambia
      // reprogramando desde la app (que deja historial). Si no, una
      // resubida del Excel podria pisar una reprogramacion ya hecha.
      fecha_programada_ingreso: prev ? prev.fecha_programada_ingreso : base.fecha_programada_ingreso,
      reabierta: prev ? prev.reabierta : false,
      historial: prev ? prev.historial : [],
    }
  }).filter(e => e.id_entrega && e.sku)

  // A veces el Excel trae la misma entrega repetida dos veces (mismo OC,
  // SKU y numero de entrega, cargada desde dos archivos de origen distintos).
  // Nos quedamos con una sola copia para no duplicar cantidades.
  const entregasUnicas = [...new Map(entregas.map(e => [e.id_entrega, e])).values()]

  onStep?.('Sumando los ingresos nuevos...')
  const ingresosNuevosRaw = rawIng
    .map(raw => mapRow(raw, INGRESOS_COLUMNS))
    .filter(e => e.numero_analisis && !numerosExistentes.has(e.numero_analisis))
  // Igual que con las entregas, el Excel puede traer el mismo ingreso
  // repetido dos veces si viene de dos archivos de origen distintos.
  const ingresosNuevos = [...new Map(ingresosNuevosRaw.map(e => [e.numero_analisis, e])).values()]

  onStep?.('Calculando avance de cada entrega...')
  recalcularGrupos(entregasUnicas, [...existentesIng, ...ingresosNuevos])

  onStep?.('Guardando en la base de datos...')
  await upsertInBatches('programacion_oc', entregasUnicas, 'id_entrega')
  await insertInBatches('ingresos_sistema', ingresosNuevos)
  await registrarImportacion('programacion', file.name, entregasUnicas.length)

  return {
    entregas: entregasUnicas.length,
    ingresosNuevos: ingresosNuevos.length,
  }
}

// El archivo que Johany descarga aparte del sistema, con lo que entro
// realmente a almacen. No trae la programacion de OC, asi que aqui solo se
// agregan los ingresos nuevos y se recalculan las entregas ya guardadas.
export async function importarIngresos(file, onStep) {
  onStep?.('Leyendo el archivo...')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const hoja = wb.Sheets[wb.SheetNames[0]]
  if (!hoja) throw new Error('No se pudo leer el archivo.')
  const rawIng = XLSX.utils.sheet_to_json(hoja, { defval: null })

  onStep?.('Revisando lo que ya tienes guardado...')
  const existentesIng = await fetchAll('ingresos_sistema', 'numero_analisis,oc,codigo,cantidad_ingresada,fecha_ingreso')
  const numerosExistentes = new Set(existentesIng.map(r => r.numero_analisis))

  onStep?.('Sumando los ingresos nuevos...')
  const ingresosNuevosRaw = rawIng
    .map(raw => ({ ...mapRow(raw, INGRESOS_RAW_COLUMNS), archivo_origen_ingreso: file.name }))
    .filter(e => e.numero_analisis && !numerosExistentes.has(e.numero_analisis))
  const ingresosNuevos = [...new Map(ingresosNuevosRaw.map(e => [e.numero_analisis, e])).values()]
    .map(e => ({ ...e, ingreso_acumulado: e.cantidad_ingresada }))

  onStep?.('Calculando avance de cada entrega...')
  const entregas = await fetchAll('programacion_oc',
    'id_entrega,oc,sku,orden_entrega,cant_programada,precio_unitario,fecha_programada_ingreso')
  recalcularGrupos(entregas, [...existentesIng, ...ingresosNuevos])

  onStep?.('Guardando en la base de datos...')
  await insertInBatches('ingresos_sistema', ingresosNuevos)
  const actualizaciones = entregas.map(e => ({
    id_entrega: e.id_entrega,
    // oc y sku son obligatorias en la tabla: aunque no cambien, Postgres
    // las exige presentes al construir la fila del upsert.
    oc: e.oc,
    sku: e.sku,
    cant_ingresada: e.cant_ingresada,
    saldo_pendiente: e.saldo_pendiente,
    pct_ingreso: e.pct_ingreso,
    estado_ingreso: e.estado_ingreso,
    fecha_real_ingreso: e.fecha_real_ingreso,
    dias_atraso: e.dias_atraso,
    valor_ingresado: e.valor_ingresado,
    valor_pendiente: e.valor_pendiente,
  }))
  await upsertInBatches('programacion_oc', actualizaciones, 'id_entrega')
  await registrarImportacion('ingresos', file.name, ingresosNuevos.length)

  return {
    ingresosNuevos: ingresosNuevos.length,
    entregasActualizadas: entregas.length,
  }
}
