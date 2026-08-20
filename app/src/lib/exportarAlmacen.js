import ExcelJS from 'exceljs'
import { supabase } from './supabaseClient'

function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

// El cuadro que Johany sube a la carpeta compartida de SharePoint para
// almacen, con las fechas de entrega que estan por llegar. Columnas fijas,
// igual al archivo que ya usa almacen (CUADRO DE INGRESOS). "Cantidad OC" y
// "Cantidad programada" son el mismo numero repetido en dos columnas (asi
// las pide almacen), y la unidad de medida se deja fija en "UNIDAD" porque
// hoy todo lo que se maneja se cuenta asi.
export async function exportarCuadroAlmacen() {
  const { data, error } = await supabase.from('programacion_oc')
    .select('sku,descripcion,cant_programada,fecha_programada_ingreso,proveedor,saldo_pendiente,estado_gestion')
  if (error) throw error

  const pendientes = data
    .filter(r => (r.saldo_pendiente || 0) > 0 && r.estado_gestion !== 'Cerrado')
    .sort((a, b) => (a.fecha_programada_ingreso || '').localeCompare(b.fecha_programada_ingreso || ''))

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Ingresos')

  const columnas = ['CODIGO', 'PRODUCTO', 'CANTIDAD OC', 'CANTIDAD PROGRAMADA', 'UM', 'FECHA INGRESO ALMACEN', 'PROVEEDOR']
  ws.addRow(columnas)
  const header = ws.getRow(1)
  header.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }
  })

  for (const r of pendientes) {
    ws.addRow([
      r.sku,
      r.descripcion,
      r.cant_programada,
      r.cant_programada,
      'UNIDAD',
      r.fecha_programada_ingreso ? new Date(r.fecha_programada_ingreso + 'T00:00:00') : null,
      r.proveedor,
    ])
  }

  ws.columns = [{ width: 16 }, { width: 42 }, { width: 14 }, { width: 18 }, { width: 10 }, { width: 20 }, { width: 26 }]
  ws.getColumn(6).numFmt = 'dd/mm/yyyy'
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const hoy = new Date().toISOString().slice(0, 10)
  descargarBlob(blob, `cuadro-ingresos-almacen-${hoy}.xlsx`)
}
