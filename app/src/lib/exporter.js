import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'
import { EXPORT_COLUMNS } from './schema'

export async function exportarExcel() {
  const { data, error } = await supabase.from('programacion_oc').select('*').order('oc')
  if (error) throw error

  const filas = data.map(r => {
    const out = {}
    for (const { header, field, type } of EXPORT_COLUMNS) {
      const v = r[field]
      out[header] = (type === 'date' && v) ? new Date(v + 'T00:00:00') : v
    }
    return out
  })

  const ws = XLSX.utils.json_to_sheet(filas, { header: EXPORT_COLUMNS.map(c => c.header) })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ProgramacionOC')

  const hoy = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `seguimiento-materiales-${hoy}.xlsx`)
}
