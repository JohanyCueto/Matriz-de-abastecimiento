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
  grupo: 45,             // AT
}
const MESES_COUNT = 5

const toNum = v => (v == null || v === '') ? null : Number(v)
const cleanText = v => {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

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

  onStep?.('Preparando los materiales...')
  const materiales = []
  for (const row of dataRows) {
    if (!row || row[COL.tipo] !== 'ME') continue
    const codigo = cleanText(row[COL.codigo])
    if (!codigo) continue
    const base = {
      codigo,
      descripcion: cleanText(row[COL.descripcion]),
      cliente: cleanText(row[COL.cliente]),
      grupo: row[COL.grupo] != null ? (parseInt(row[COL.grupo], 10) || null) : null,
      stock: toNum(row[COL.stock]),
      disponible: toNum(row[COL.disponible]),
      cuarentena: toNum(row[COL.cuarentena]),
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
    .insert({ archivo: file.name })
    .select('id')
    .single()
  if (errSnap) throw errSnap

  const conSnapshot = materiales.map(m => ({ ...m, snapshot_id: snap.id }))
  onStep?.('Guardando los materiales...')
  await insertInBatches('explosion_materiales', conSnapshot)

  return {
    materiales: new Set(materiales.map(m => m.codigo)).size,
    filas: conSnapshot.length,
    snapshotId: snap.id,
  }
}

export async function obtenerUltimosSnapshots(n = 2) {
  const { data, error } = await supabase
    .from('explosion_snapshots')
    .select('id,archivo,creado_en')
    .order('creado_en', { ascending: false })
    .limit(n)
  if (error) throw error
  return data
}

export async function obtenerMaterialesDeSnapshot(snapshotId) {
  const { data, error } = await supabase
    .from('explosion_materiales')
    .select('*')
    .eq('snapshot_id', snapshotId)
  if (error) throw error
  return data
}
