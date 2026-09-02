import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'
import { insertInBatches } from './importer'

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

// Posiciones de columna en la hoja "explosion" (0-based, A=0). Se lee por
// posicion y no por nombre de encabezado porque el nombre trae el año y
// cambia cada ciclo. Si Roxfarma reordena su plantilla, hay que ajustar
// estos indices.
const COL = {
  tipo: 0,
  codigo: 1,
  descripcion: 2,
  disponible: 3,
  cuarentena: 4,
  stock: 5,
  proyectadoInicio: 7,  // H:L, 5 meses de consumo proyectado
  cliente: 31,          // AF
  firmeInicio: 32,      // AG:AK, 5 meses de consumo en firme
  version1: 42,         // AQ
  version2: 43,         // AR
  version3: 44,         // AS
  grupo: 45,             // AT
}
const MESES_COUNT = 5

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

  const mesFechas = []
  for (let i = 0; i < MESES_COUNT; i++) {
    const fecha = parseMesHeader(header[COL.firmeInicio + i])
    if (!fecha) {
      throw new Error(`No se pudo leer el mes de la columna de consumo en firme #${i + 1} (encabezado: "${header[COL.firmeInicio + i]}"). Puede que la plantilla haya cambiado de columnas.`)
    }
    mesFechas.push(fecha)
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
      cliente: cleanText(row[COL.cliente]),
      grupo: row[COL.grupo] != null ? (parseInt(row[COL.grupo], 10) || null) : null,
      stock: toNum(row[COL.stock]),
      disponible: toNum(row[COL.disponible]),
      cuarentena: toNum(row[COL.cuarentena]),
      version1: cleanText(row[COL.version1]),
      version2: cleanText(row[COL.version2]),
      version3: cleanText(row[COL.version3]),
      mes_fabricacion_proximo: mesFabricacionProximo ? fechaStr(mesFabricacionProximo) : null,
      fecha_requerida_ingreso: mesFabricacionProximo ? fechaStr(fechaRequeridaDesdeFabricacion(mesFabricacionProximo)) : null,
    }
    for (let i = 0; i < MESES_COUNT; i++) {
      materiales.push({
        ...base,
        mes: mesFechas[i],
        consumo_proyectado: toNum(row[COL.proyectadoInicio + i]),
        consumo_firme: toNum(row[COL.firmeInicio + i]),
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
  const { data, error } = await supabase
    .from('explosion_materiales')
    .select('*')
    .eq('snapshot_id', snapshotId)
  if (error) throw error
  return data
}

// Para cada codigo, suma el saldo pendiente de todas sus entregas en
// programacion_oc (sin importar el estado de gestion -- una entrega
// atrasada igual sigue siendo material que va a llegar) y guarda la fecha
// programada mas proxima entre las que todavia tienen saldo.
export async function obtenerOcPorSku(codigos) {
  const m = new Map()
  if (!codigos.length) return m
  const { data, error } = await supabase
    .from('programacion_oc')
    .select('sku,saldo_pendiente,fecha_programada_ingreso')
    .in('sku', codigos)
  if (error) throw error
  for (const row of data) {
    if (!m.has(row.sku)) m.set(row.sku, { saldoPendiente: 0, fechaProgramada: null })
    const acc = m.get(row.sku)
    acc.saldoPendiente += row.saldo_pendiente || 0
    if ((row.saldo_pendiente || 0) > 0 && row.fecha_programada_ingreso) {
      if (!acc.fechaProgramada || row.fecha_programada_ingreso < acc.fechaProgramada) {
        acc.fechaProgramada = row.fecha_programada_ingreso
      }
    }
  }
  return m
}
