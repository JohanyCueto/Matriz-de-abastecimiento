import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'
import { insertInBatches, fetchAll } from './importer'
import { CERRADAS } from './derive'

// El texto de los encabezados de mes trae el año y cambia cada ciclo (ej.
// "AGO.2026" o "AGOSTO 2026"), pero las tres primeras letras alcanzan para
// identificar el mes en ambos estilos.
const MES3 = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, SEP: 9, OCT: 10, NOV: 11, DIC: 12 }

function parseMesHeader(v) {
  const s = String(v || '').toUpperCase().trim()
  const m = s.match(/([A-Z]{3,})\D*?(\d{4})/)
  if (!m) return null
  const mes = MES3[m[1].slice(0, 3)]
  const anio = parseInt(m[2], 10)
  if (!mes || !anio) return null
  return `${anio}-${String(mes).padStart(2, '0')}-01`
}

// Las primeras columnas de la hoja "explosion" (0-based, A=0) son fijas.
// Las que vienen despues se mueven cada ciclo -- cada mes que pasa,
// Roxfarma le saca la columna del mes que ya quedo atras (antes
// Ago-Dic, ahora Set-Dic), y de vez en cuando agrega columnas nuevas
// (ej. "OC EN TRANSITO", "OC 1"..."OC 4") que corren todo lo que viene
// despues. Por eso las columnas desde "Cliente" en adelante se ubican por
// el texto del encabezado, no por una posicion fija.
const COL = {
  tipo: 0,
  codigo: 1,
  descripcion: 2,
  disponible: 3,
  cuarentena: 4,
  stock: 5,
}

const normalizarHeader = v => String(v || '').trim().toLowerCase()

// Ubica por texto las columnas que se mueven de ciclo en ciclo, y cuenta
// cuantos meses trae de verdad el bloque de consumo en firme (antes eran
// siempre 5, ahora pueden ser menos) en vez de asumir un numero fijo.
function detectarColumnasVariables(header) {
  const unidadIdx = header.findIndex(h => normalizarHeader(h) === 'unidad')
  if (unidadIdx === -1) {
    throw new Error('No se encontró la columna "unidad" en la hoja "explosion". Puede que la plantilla haya cambiado de columnas.')
  }
  const clienteIdx = header.findIndex(h => normalizarHeader(h) === 'cliente')
  if (clienteIdx === -1) {
    throw new Error('No se encontró la columna "Cliente" en la hoja "explosion". Puede que la plantilla haya cambiado de columnas.')
  }
  const grupo = header.findIndex(h => /^grupos?$/.test(normalizarHeader(h)))
  if (grupo === -1) {
    throw new Error('No se encontró la columna "Grupos" en la hoja "explosion". Puede que la plantilla haya cambiado de columnas.')
  }

  const proyectadoInicio = unidadIdx + 1
  const firmeInicio = clienteIdx + 1
  let mesesCount = 0
  while (parseMesHeader(header[firmeInicio + mesesCount])) mesesCount++
  if (mesesCount === 0) {
    throw new Error(`No se pudo leer ningún mes de consumo en firme despues de la columna "Cliente" (encabezado: "${header[firmeInicio]}"). Puede que la plantilla haya cambiado de columnas.`)
  }

  const versionCols = []
  header.forEach((h, i) => { if (normalizarHeader(h).startsWith('version')) versionCols.push(i) })

  return { proyectadoInicio, cliente: clienteIdx, firmeInicio, mesesCount, version1: versionCols[0], version2: versionCols[1], version3: versionCols[2], grupo }
}

// Posiciones en la hoja "explosion_detallada." (ojo el punto final en el
// nombre). Solo se usan para calcular el mes de fabricacion mas proximo
// por material -- no se guardan las ~11,200 filas crudas.
const DETALLE_COL = { codigo: 0, fechaFabricacion: 10 }

// El nombre del archivo trae la fecha de corte real (ej.
// "Explosion_Analisis__2026.08.27.xlsx"). Se usa para ordenar "anterior
// vs. actual" en vez de la fecha en que se subio -- asi, si algun dia hay
// que volver a subir un archivo viejo (ej. para corregir una carga que
// fallo a la mitad), el orden no se invierte solo porque se subio despues.
function fechaCorteDesdeNombre(nombreArchivo) {
  const m = String(nombreArchivo || '').match(/(\d{4})\.(\d{2})\.(\d{2})/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

const toNum = v => (v == null || v === '') ? null : Number(v)
const cleanText = v => {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function toDateOnly(v) {
  if (v == null || v === '') return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d) ? null : d
}
const fechaStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const primerDiaMes = d => new Date(d.getFullYear(), d.getMonth(), 1)
// Regla de anticipacion: el material debe ingresar ~el dia 10 del mes
// anterior al de fabricacion (fabricacion octubre -> requerido ~10 de
// setiembre).
const fechaRequeridaDesdeFabricacion = mesFabricacion => new Date(mesFabricacion.getFullYear(), mesFabricacion.getMonth() - 1, 10)

// Lee la hoja "explosion" del archivo que Johany sube periodicamente,
// guarda un snapshot nuevo con solo los materiales ME (uno por mes), para
// poder compararlo despues contra el snapshot anterior.
export async function importarExplosion(file, onStep) {
  onStep?.('Leyendo el archivo...')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sh = wb.Sheets['explosion']
  if (!sh) throw new Error('El archivo no tiene la hoja "explosion" esperada.')
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null })
  const header = rows[0] || []
  const dataRows = rows.slice(1)

  const V = detectarColumnasVariables(header)
  const mesFechas = []
  for (let i = 0; i < V.mesesCount; i++) {
    mesFechas.push(parseMesHeader(header[V.firmeInicio + i]))
  }

  onStep?.('Buscando el mes de fabricación...')
  // El mes de fabricacion mas proximo sale de "explosion_detallada.", no
  // de la hoja principal. Se calcula el resumen (minimo por codigo) aqui
  // y no se guardan las filas crudas del detalle.
  const fabricacionPorCodigo = new Map()
  const shDet = wb.Sheets['explosion_detallada.']
  if (shDet) {
    const detRows = XLSX.utils.sheet_to_json(shDet, { header: 1, defval: null })
    for (const row of detRows.slice(1)) {
      if (!row) continue
      const codigo = cleanText(row[DETALLE_COL.codigo])
      const fecha = toDateOnly(row[DETALLE_COL.fechaFabricacion])
      if (!codigo || !fecha) continue
      const actual = fabricacionPorCodigo.get(codigo)
      if (!actual || fecha < actual) fabricacionPorCodigo.set(codigo, fecha)
    }
  }

  onStep?.('Preparando los materiales...')
  const materiales = []
  for (const row of dataRows) {
    if (!row || row[COL.tipo] !== 'ME') continue
    const codigo = cleanText(row[COL.codigo])
    if (!codigo) continue
    const fechaFabricacion = fabricacionPorCodigo.get(codigo)
    const mesFabricacionProximo = fechaFabricacion ? primerDiaMes(fechaFabricacion) : null
    const base = {
      codigo,
      descripcion: cleanText(row[COL.descripcion]),
      cliente: cleanText(row[V.cliente]),
      grupo: row[V.grupo] != null ? (parseInt(row[V.grupo], 10) || null) : null,
      stock: toNum(row[COL.stock]),
      disponible: toNum(row[COL.disponible]),
      cuarentena: toNum(row[COL.cuarentena]),
      version1: cleanText(row[V.version1]),
      version2: cleanText(row[V.version2]),
      version3: cleanText(row[V.version3]),
      mes_fabricacion_proximo: mesFabricacionProximo ? fechaStr(mesFabricacionProximo) : null,
      fecha_requerida_ingreso: mesFabricacionProximo ? fechaStr(fechaRequeridaDesdeFabricacion(mesFabricacionProximo)) : null,
    }
    for (let i = 0; i < V.mesesCount; i++) {
      materiales.push({
        ...base,
        mes: mesFechas[i],
        consumo_proyectado: toNum(row[V.proyectadoInicio + i]),
        consumo_firme: toNum(row[V.firmeInicio + i]),
      })
    }
  }

  onStep?.('Guardando el snapshot...')
  const { data: snap, error: errSnap } = await supabase
    .from('explosion_snapshots')
    .insert({ archivo: file.name, fecha_corte: fechaCorteDesdeNombre(file.name) })
    .select('id')
    .single()
  if (errSnap) throw errSnap

  const conSnapshot = materiales.map(m => ({ ...m, snapshot_id: snap.id }))
  onStep?.('Guardando los materiales...')
  await insertInBatches('explosion_materiales', conSnapshot)

  // Verificacion de integridad: si algun lote fallo a la mitad sin lanzar
  // error (ej. se corto la conexion), es mejor avisar claro que dejar un
  // snapshot incompleto que despues se compara como si estuviera bien.
  const { count, error: errCount } = await supabase
    .from('explosion_materiales')
    .select('id', { count: 'exact', head: true })
    .eq('snapshot_id', snap.id)
  if (errCount) throw errCount
  if (count !== conSnapshot.length) {
    throw new Error(`Se guardaron ${count} de ${conSnapshot.length} filas esperadas. El snapshot quedó incompleto -- borra este snapshot (archivo "${file.name}") en Supabase y vuelve a intentar.`)
  }

  return {
    materiales: new Set(materiales.map(m => m.codigo)).size,
    filas: conSnapshot.length,
    snapshotId: snap.id,
  }
}

export async function obtenerUltimosSnapshots(n = 2) {
  // Se trae un colchón de snapshots recientes (por fecha de carga) y se
  // reordena por fecha_corte (la fecha real del archivo) del lado del
  // cliente, para que "anterior vs. actual" siga la fecha del archivo y
  // no el orden en que se subieron.
  const { data, error } = await supabase
    .from('explosion_snapshots')
    .select('id,archivo,creado_en,fecha_corte')
    .order('creado_en', { ascending: false })
    .limit(Math.max(n, 10))
  if (error) throw error
  const ordenados = [...data].sort((a, b) => {
    const fa = a.fecha_corte || a.creado_en
    const fb = b.fecha_corte || b.creado_en
    return fb.localeCompare(fa)
  })
  return ordenados.slice(0, n)
}

export async function obtenerMaterialesDeSnapshot(snapshotId) {
  // Un snapshot completo son ~5 filas por material (una por mes): con mas
  // de 200 materiales ya se pasa de las 1000 filas que Supabase devuelve
  // como maximo en un solo select. Sin paginar, se perdian materiales en
  // silencio y aparecian como "Nuevo" o "Ya no aparece" sin serlo -- por
  // eso salian ~113 materiales nuevos cuando en realidad eran ~9.
  return fetchAll('explosion_materiales', '*', q => q.eq('snapshot_id', snapshotId))
}

// Para cada codigo, suma el saldo pendiente de todas sus entregas
// realmente abiertas en programacion_oc (Pendiente, En seguimiento,
// Reprogramado o Atrasado -- una entrega atrasada igual sigue siendo
// material que va a llegar) y guarda la fecha programada mas proxima entre
// esas. Una entrega que Johany ya cerro a mano (estado "Cerrado"), aunque
// le haya quedado saldo por tolerancia, no cuenta como pendiente: ya no va
// a llegar mas -- es la misma regla que decide "abierto" en Seguimiento OC
// (ver CERRADAS en lib/derive.js). Tambien se guarda el detalle de OC por
// entrega, para poder mostrar en pantalla cual OC exactamente cubre el
// consumo, no solo el total.
export async function obtenerOcPorSku(codigos) {
  const m = new Map()
  if (!codigos.length) return m
  const data = await fetchAll('programacion_oc', 'oc,sku,saldo_pendiente,fecha_programada_ingreso,estado_gestion', q => q.in('sku', codigos))
  for (const row of data) {
    if (!m.has(row.sku)) m.set(row.sku, { saldoPendiente: 0, fechaProgramada: null, entregas: [] })
    const acc = m.get(row.sku)
    const saldo = row.saldo_pendiente || 0
    if (saldo <= 0 || CERRADAS.includes(row.estado_gestion)) continue
    acc.saldoPendiente += saldo
    acc.entregas.push({ oc: row.oc, saldo, fecha: row.fecha_programada_ingreso })
    if (row.fecha_programada_ingreso) {
      if (!acc.fechaProgramada || row.fecha_programada_ingreso < acc.fechaProgramada) {
        acc.fechaProgramada = row.fecha_programada_ingreso
      }
    }
  }
  return m
}

// El stock que trae la explosion es una foto fija del dia que se armo el
// archivo (fecha_corte). Un ingreso que llega despues de esa fecha ya deja
// de contar como "OC pendiente" (obtenerOcPorSku), pero el stock del
// archivo todavia no lo tiene -- sin esto, esas unidades parecian
// esfumarse hasta que Johany suba una explosion mas nueva. Se suma por
// separado desde ingresos_sistema, que si se actualiza con cada Excel que
// ella sube.
export async function obtenerIngresosPosterioresA(codigos, fechaCorte) {
  const m = new Map()
  if (!codigos.length || !fechaCorte) return m
  const data = await fetchAll('ingresos_sistema', 'codigo,cantidad_ingresada,fecha_ingreso',
    q => q.in('codigo', codigos).gt('fecha_ingreso', fechaCorte))
  for (const row of data) {
    m.set(row.codigo, (m.get(row.codigo) || 0) + (row.cantidad_ingresada || 0))
  }
  return m
}
