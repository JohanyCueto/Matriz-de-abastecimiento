import ExcelJS from 'exceljs'
import { fetchAll } from './importer'
import { CERRADAS } from './derive'

function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

const fdate = s => {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

export function claveMes(offset = 0) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function nombreMes(clave) {
  const [y, m] = clave.split('-')
  const nombre = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-PE', { month: 'long' })
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${y}`
}

export async function exportarCuadroAlmacen(mesClave) {
  const data = await fetchAll('programacion_oc',
    'sku,descripcion,cant_programada,cant_ingresada,ajuste_cantidad,fecha_programada_ingreso,proveedor,fecha_real_ingreso,estado_gestion')

  const pendientes = data
    .filter(r => {
      if (!r.fecha_programada_ingreso) return false
      if (r.fecha_programada_ingreso.slice(0, 7) !== mesClave) return false
      const prog = (r.cant_programada || 0) + (r.ajuste_cantidad || 0)
      const saldo = Math.max(0, prog - (r.cant_ingresada || 0))
      if (saldo <= 0) return false
      if (CERRADAS.includes(r.estado_gestion)) return false
      return true
    })
    .map(r => {
      const prog = (r.cant_programada || 0) + (r.ajuste_cantidad || 0)
      const saldo = Math.max(0, prog - (r.cant_ingresada || 0))
      return { ...r, saldo, progEfectivo: prog }
    })
    .sort((a, b) => (a.fecha_programada_ingreso || '').localeCompare(b.fecha_programada_ingreso || ''))

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(nombreMes(mesClave).slice(0, 31))

  ws.mergeCells('A1:I1')
  ws.getCell('A1').value = 'CUADRO DE INGRESOS DE MATERIAL DE EMPAQUE Y ENVASE'
  ws.getCell('A1').font = { bold: true, size: 13 }

  ws.getCell('A3').value = 'Fecha de actualizacion'
  ws.getCell('A3').font = { bold: true }
  ws.getCell('C3').value = new Date()
  ws.getCell('C3').numFmt = 'dd/mm/yyyy'
  ws.getCell('A4').value = 'Responsable'
  ws.getCell('A4').font = { bold: true }
  ws.getCell('C4').value = 'Johany Cueto Malpartida'

  const filaHeader = 6
  const columnas = ['CODIGO', 'PRODUCTO', 'CANTIDAD PROGRAMADA', 'INGRESADO', 'SALDO PENDIENTE', 'UM', 'FECHA PROGRAMADA INGRESO', 'PROVEEDOR', 'OBSERVACIONES']
  const headerRow = ws.getRow(filaHeader)
  columnas.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = c
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }
  })

  pendientes.forEach((r, i) => {
    const row = ws.getRow(filaHeader + 1 + i)
    row.values = [
      r.sku,
      r.descripcion,
      r.progEfectivo,
      r.cant_ingresada || 0,
      r.saldo,
      'UNIDAD',
      r.fecha_programada_ingreso ? new Date(r.fecha_programada_ingreso + 'T00:00:00') : null,
      r.proveedor,
      r.fecha_real_ingreso ? `Ingreso parcial: ${fdate(r.fecha_real_ingreso)}` : null,
    ]
  })

  ws.columns = [
    { width: 16 }, { width: 42 }, { width: 20 }, { width: 14 }, { width: 18 },
    { width: 10 }, { width: 22 }, { width: 26 }, { width: 30 },
  ]
  ws.getColumn(7).numFmt = 'dd/mm/yyyy'
  ws.views = [{ state: 'frozen', ySplit: filaHeader }]

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  descargarBlob(blob, `cuadro-ingresos-${mesClave}.xlsx`)
}
