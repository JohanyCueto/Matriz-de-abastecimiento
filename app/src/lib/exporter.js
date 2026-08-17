import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'
import { EXPORT_COLUMNS } from './schema'

// Supabase devuelve las columnas "date" como "2026-02-07" pero las
// "timestamptz" como "2026-02-07T00:00:00+00:00". Si no se distinguen bien
// se puede armar una fecha invalida (NaN), y eso corrompe el Excel entero.
function aFecha(v) {
  const s = String(v)
  const d = s.includes('T') ? new Date(s) : new Date(s + 'T00:00:00')
  return isNaN(d) ? null : d
}

export async function exportarExcel() {
  const { data, error } = await supabase.from('programacion_oc').select('*').order('oc')
  if (error) throw error

  const filas = data.map(r => {
    const out = {}
    for (const { header, field, type } of EXPORT_COLUMNS) {
      const v = r[field]
      out[header] = (type === 'date' && v) ? aFecha(v) : v
    }
    return out
  })

  const ws = XLSX.utils.json_to_sheet(filas, { header: EXPORT_COLUMNS.map(c => c.header) })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ProgramacionOC')

  const hoy = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `seguimiento-materiales-${hoy}.xlsx`)
}
