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

const headerDe = field => EXPORT_COLUMNS.find(c => c.field === field).header
// Referencia estructurada de tabla a la misma fila, ej. [@[Cant. Programada]]
const ref = field => `[@[${headerDe(field)}]]`

export async function exportarExcel() {
  const { data, error } = await supabase.from('programacion_oc').select('*').order('oc')
  if (error) throw error

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('ProgramacionOC')

  // Columnas que son un simple calculo se dejan como formula de Excel, para
  // que sigan funcionando si alguien edita a mano un valor en el archivo.
  // Las demas (Estado ingreso, Estado gestion...) dependen de logica que
  // cruza contra los ingresos reales, y esa cuenta ya la hizo la nube al
  // importar, asi que se quedan con el valor ya calculado.
  const rows = data.map(r => EXPORT_COLUMNS.map(({ field, type }) => {
    switch (field) {
      case 'id_entrega': return { formula: `${ref('oc')}&"-"&${ref('sku')}&"-"&${ref('n_entrega')}` }
      case 'orden_entrega': return { formula: `VALUE(MID(${ref('n_entrega')},2,10))` }
      case 'semana_ingreso': return { formula: `ISOWEEKNUM(${ref('fecha_programada_ingreso')})` }
      case 'mes_consumo': return { formula: `PROPER(TEXT(${ref('fecha_programada_ingreso')},"mmmm"))` }
      case 'programado_anterior': return {
        formula: `SUMIFS([${headerDe('cant_programada')}],[${headerDe('oc')}],${ref('oc')},[${headerDe('sku')}],${ref('sku')},[${headerDe('orden_entrega')}],"<"&${ref('orden_entrega')})`,
      }
      case 'valor_entrega': return { formula: `${ref('precio_unitario')}*${ref('cant_programada')}` }
      case 'saldo_pendiente': return { formula: `${ref('cant_programada')}-${ref('cant_ingresada')}` }
      case 'pct_ingreso': return { formula: `IF(${ref('cant_programada')}=0,0,ROUND(${ref('cant_ingresada')}/${ref('cant_programada')}*1000,0)/10)` }
      case 'dias_atraso': return { formula: `IF(${ref('fecha_real_ingreso')}="","",MAX(0,${ref('fecha_real_ingreso')}-${ref('fecha_programada_ingreso')}))` }
      case 'valor_ingresado': return { formula: `${ref('precio_unitario')}*${ref('cant_ingresada')}` }
      case 'valor_pendiente': return { formula: `${ref('precio_unitario')}*${ref('saldo_pendiente')}` }
      case 'estado_ingreso':
        // No se confia en el texto guardado (puede quedar un "Parcial"
        // viejo de antes de fusionar ese estado con Pendiente): se calcula
        // de si la linea sigue abierta, igual que en la app. Si ya se
        // cerro (aunque sea con tolerancia y le falte un poco), ya no
        // cuenta como pendiente.
        return ((r.saldo_pendiente || 0) > 0 && r.estado_gestion !== 'Cerrado') ? 'Pendiente' : 'Completo'
      case 'estado_gestion': {
        // Misma correccion que en la app: si ya no hay saldo (o ya esta
        // cerrada), se ve Cerrado; si se paso la fecha, Atrasado.
        const abierto = (r.saldo_pendiente || 0) > 0 && r.estado_gestion !== 'Cerrado'
        if (!abierto) return 'Cerrado'
        if (r.fecha_programada_ingreso) {
          const dd = Math.round((new Date(r.fecha_programada_ingreso + 'T00:00:00') - new Date()) / 864e5)
          if (dd < 0) return 'Atrasado'
        }
        return r.estado_gestion || 'En seguimiento'
      }
      default: {
        const v = r[field]
        return (type === 'date' && v) ? aFecha(v) : v
      }
    }
  }))

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
