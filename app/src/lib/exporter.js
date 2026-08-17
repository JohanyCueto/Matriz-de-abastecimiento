import ExcelJS from 'exceljs'
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

function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportarExcel() {
  const { data, error } = await supabase.from('programacion_oc').select('*').order('oc')
  if (error) throw error

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('ProgramacionOC')

  ws.columns = EXPORT_COLUMNS.map(c => ({ header: c.header, key: c.field, width: 16 }))

  for (const r of data) {
    const fila = {}
    for (const { field, type } of EXPORT_COLUMNS) {
      const v = r[field]
      fila[field] = (type === 'date' && v) ? aFecha(v) : v
    }
    ws.addRow(fila)
  }

  const headerRow = ws.getRow(1)
  EXPORT_COLUMNS.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.font = { bold: true, color: { argb: c.color ? 'FFFFFFFF' : 'FF000000' } }
    if (c.color) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c.color } }
  })

  EXPORT_COLUMNS.forEach((c, i) => {
    if (c.type === 'date') ws.getColumn(i + 1).numFmt = 'dd/mm/yyyy'
  })

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } }
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const hoy = new Date().toISOString().slice(0, 10)
  descargarBlob(blob, `seguimiento-materiales-${hoy}.xlsx`)
}
