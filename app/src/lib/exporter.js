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

// Convierte una posicion de columna (1, 2, 3...) en su letra de Excel (A, B, C...).
function colLetra(n) {
  let s = ''
  while (n > 0) {
    const resto = (n - 1) % 26
    s = String.fromCharCode(65 + resto) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

const col = field => colLetra(EXPORT_COLUMNS.findIndex(c => c.field === field) + 1)

export async function exportarExcel() {
  const { data, error } = await supabase.from('programacion_oc').select('*').order('oc')
  if (error) throw error

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('ProgramacionOC')

  // Columnas que son un simple calculo se dejan como formula de Excel, para
  // que sigan funcionando si alguien edita a mano un valor en el archivo.
  // Las demas (Estado ingreso, Estado gestion...) dependen de logica que
  // cruza varias filas, asi que se quedan con el valor ya calculado.
  const B = col('oc'), J = col('sku'), O = col('n_entrega')
  const L = col('precio_unitario'), M = col('cant_programada'), W = col('cant_ingresada')
  const X = col('saldo_pendiente'), Q = col('fecha_programada_ingreso'), AC = col('fecha_real_ingreso')

  const rows = data.map((r, i) => {
    const n = i + 2
    return EXPORT_COLUMNS.map(({ field, type }) => {
      if (field === 'id_entrega') return { formula: `${B}${n}&"-"&${J}${n}&"-"&${O}${n}` }
      if (field === 'valor_entrega') return { formula: `${L}${n}*${M}${n}` }
      if (field === 'saldo_pendiente') return { formula: `${M}${n}-${W}${n}` }
      if (field === 'pct_ingreso') return { formula: `IF(${M}${n}=0,0,ROUND(${W}${n}/${M}${n}*1000,0)/10)` }
      if (field === 'dias_atraso') return { formula: `IF(${AC}${n}="","",MAX(0,${AC}${n}-${Q}${n}))` }
      if (field === 'valor_ingresado') return { formula: `${L}${n}*${W}${n}` }
      if (field === 'valor_pendiente') return { formula: `${L}${n}*${X}${n}` }
      const v = r[field]
      return (type === 'date' && v) ? aFecha(v) : v
    })
  })

  // Se arma como tabla de Excel de verdad (no solo celdas con filtro), para
  // que aparezca como tabla al abrirla, igual que el Excel original.
  ws.addTable({
    name: 'ProgramacionOC',
    ref: 'A1',
    headerRow: true,
    totalsRow: false,
    style: { theme: null, showRowStripes: false },
    columns: EXPORT_COLUMNS.map(c => ({ name: c.header, filterButton: true })),
    rows,
  })

  ws.columns.forEach(c => { c.width = 16 })

  const headerRow = ws.getRow(1)
  EXPORT_COLUMNS.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.font = { bold: true, color: { argb: c.color ? 'FFFFFFFF' : 'FF000000' } }
    if (c.color) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c.color } }
  })

  EXPORT_COLUMNS.forEach((c, i) => {
    if (c.type === 'date') ws.getColumn(i + 1).numFmt = 'dd/mm/yyyy'
  })

  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const hoy = new Date().toISOString().slice(0, 10)
  descargarBlob(blob, `seguimiento-materiales-${hoy}.xlsx`)
}
