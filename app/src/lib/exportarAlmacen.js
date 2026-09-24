import ExcelJS from 'exceljs'
import { fetchAll } from './importer'

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

// "2026-09" para el mes actual. Se fija el dia en 1 antes de sumar meses:
// si hoy es 31 y no se hace esto, Date puede saltarse un mes entero (ej. de
// 31 de agosto a 31 de setiembre, que no existe, salta a octubre).
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

// El cuadro que Johany sube a la carpeta compartida de SharePoint para
// almacen, un archivo por mes (como ella ya los organiza: "SETIEMBRE ME",
// etc.). Formato acordado con almacen:
// - "Fecha ingreso almacen" es la fecha que se les comunico la primera vez
//   y no se toca despues (queda igual aunque la entrega se reprograme).
// - "Nueva fecha programada" solo se llena si la entrega de verdad se
//   reprogramo desde la app (eso es lo que guarda el historial); si nunca
//   se toco, queda vacia.
// - "Status" es Ingreso si ya se registro una fecha real de llegada,
//   Pendiente si todavia no llega nada.
// - "Observaciones" anota la fecha real en que llego, para que quede el
//   registro aunque el status ya diga "Ingreso".
// Se filtra por el mes de la fecha ORIGINAL (cuando se le aviso a almacen
// por primera vez), no por la fecha vigente, para que una entrega no se
// "mueva" de mes en el archivo solo porque se reprogramo.
export async function exportarCuadroAlmacen(mesClave) {
  const data = await fetchAll('programacion_oc',
    'sku,descripcion,cant_programada,fecha_programada_ingreso,proveedor,fecha_real_ingreso,historial')

  const conOrigen = data.map(r => {
    const hist = Array.isArray(r.historial) ? r.historial : []
    const origen = hist.length ? hist[0].de : r.fecha_programada_ingreso
    const reprogramada = hist.length ? r.fecha_programada_ingreso : null
    return { ...r, origen, reprogramada }
  })

  const delMes = conOrigen
    .filter(r => r.origen && r.origen.slice(0, 7) === mesClave)
    .sort((a, b) => a.origen.localeCompare(b.origen))

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(nombreMes(mesClave).slice(0, 31))

  ws.mergeCells('A1:J1')
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
  const columnas = ['CODIGO', 'PRODUCTO', 'CANTIDAD OC', 'CANTIDAD PROGRAMADO', 'UM', 'FECHA INGRESO ALMACEN', 'PROVEEDOR', 'NUEVA FECHA PROGRAMADA', 'STATUS', 'OBSERVACIONES']
  const headerRow = ws.getRow(filaHeader)
  columnas.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = c
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }
  })

  delMes.forEach((r, i) => {
    const row = ws.getRow(filaHeader + 1 + i)
    row.values = [
      r.sku,
      r.descripcion,
      r.cant_programada,
      r.cant_programada,
      'UNIDAD',
      r.origen ? new Date(r.origen + 'T00:00:00') : null,
      r.proveedor,
      r.reprogramada ? new Date(r.reprogramada + 'T00:00:00') : null,
      r.fecha_real_ingreso ? 'Ingreso' : 'Pendiente',
      r.fecha_real_ingreso ? `Fecha que ingreso: ${fdate(r.fecha_real_ingreso)}` : null,
    ]
  })

  ws.columns = [
    { width: 16 }, { width: 42 }, { width: 14 }, { width: 18 }, { width: 10 },
    { width: 20 }, { width: 26 }, { width: 20 }, { width: 12 }, { width: 30 },
  ]
  ws.getColumn(6).numFmt = 'dd/mm/yyyy'
  ws.getColumn(8).numFmt = 'dd/mm/yyyy'
  ws.views = [{ state: 'frozen', ySplit: filaHeader }]

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  descargarBlob(blob, `cuadro-ingresos-${mesClave}.xlsx`)
}
