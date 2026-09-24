import * as XLSX from 'xlsx'
import { fetchAll, upsertInBatches } from './importer'

// Igual que isoDate en importer.js: si la fecha viene como texto
// "26/08/2026" (dia/mes/año) en vez de fecha real, new Date() de JS no lo
// entiende bien y falla, asi que se parsea a mano.
function isoDate(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) {
    if (isNaN(v)) return null
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) {
    const [, d, mo, y] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const d = new Date(v)
  if (isNaN(d)) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toNumero(v) {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/,/g, ''))
  return isNaN(n) ? null : n
}

// El cuadro de Johany trae varias hojas (una por mes), y cada una tiene un
// bloque de titulo arriba de tamaño distinto (algunas empiezan la tabla en
// la fila 1, otras en la 16). En vez de asumir una fila fija, se busca la
// fila que dice "CODIGO" en la primera columna.
function filasDeHoja(hoja) {
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null, raw: false })
  const idxHeader = filas.findIndex(f => String(f[0] || '').trim().toUpperCase().startsWith('CÓDIGO') || String(f[0] || '').trim().toUpperCase().startsWith('CODIGO'))
  if (idxHeader === -1) return []
  return filas.slice(idxHeader + 1)
    .filter(f => f[0] != null && f[0] !== '')
    .map(f => ({
      sku: String(f[0]).trim(),
      cantidad: toNumero(f[3] ?? f[2]),
      fechaAlmacen: isoDate(f[5]),
      proveedor: f[6] || null,
    }))
    .filter(f => f.fechaAlmacen)
}

// Carga el cuadro que Johany ya le mando a almacen (el Excel real, con las
// fechas que ya se comunicaron), y con eso pone al dia fecha_comunicada_almacen
// en las entregas que coincidan, para no tener que marcarlas una por una a
// mano en "Comunicar a almacen". El cruce es por SKU + cantidad programada
// (el archivo de almacen no trae numero de OC), y solo se aplica cuando
// encuentra una sola entrega candidata: si hay mas de una o ninguna, se deja
// en la lista para que Johany la revise, en vez de adivinar.
export async function importarComunicacionAlmacen(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })

  // "Empaque Envase" es una hoja maestra/de referencia, no un envio real a
  // almacen: se deja fuera para no cruzarla dos veces contra la misma
  // entrega que ya viene en su hoja del mes correspondiente.
  const filasArchivo = []
  for (const nombre of wb.SheetNames) {
    if (nombre.trim().toLowerCase() === 'empaque envase') continue
    filasArchivo.push(...filasDeHoja(wb.Sheets[nombre]))
  }
  if (!filasArchivo.length) {
    throw new Error('No se encontro ninguna fila con columna "CODIGO" en el archivo.')
  }

  const candidatas = await fetchAll('programacion_oc',
    'id_entrega,sku,oc,proveedor,cant_programada,fecha_comunicada_almacen')
  const sinComunicar = candidatas.filter(r => !r.fecha_comunicada_almacen)
  const porSku = new Map()
  for (const r of sinComunicar) {
    if (!porSku.has(r.sku)) porSku.set(r.sku, [])
    porSku.get(r.sku).push(r)
  }
  const existeSku = new Set(candidatas.map(r => r.sku))

  const marcadas = []
  const sinEncontrar = []
  const ambiguas = []

  for (const fila of filasArchivo) {
    const opciones = porSku.get(fila.sku) || []
    const porCantidad = fila.cantidad != null ? opciones.filter(o => o.cant_programada === fila.cantidad) : []
    const elegidas = porCantidad.length ? porCantidad : opciones

    if (elegidas.length === 1) {
      marcadas.push({ ...elegidas[0], fechaAlmacen: fila.fechaAlmacen })
      // Se saca de la lista de candidatas para que otra fila del archivo
      // (de otra hoja, o repetida) no vuelva a cruzar con esta misma
      // entrega ya asignada.
      const lista = porSku.get(fila.sku)
      lista.splice(lista.indexOf(elegidas[0]), 1)
    } else if (elegidas.length === 0) {
      if (existeSku.has(fila.sku)) continue // ya estaba comunicada, no hace falta avisar
      sinEncontrar.push(fila)
    } else {
      ambiguas.push({ fila, opciones: elegidas })
    }
  }

  // En lotes, no fila por fila: con cientos de coincidencias, actualizar
  // una por una tardaba minutos por la ida y vuelta de cada pedido. "oc" y
  // "sku" van igual aunque no cambien: Postgres exige las columnas NOT
  // NULL presentes al armar la fila del upsert.
  const actualizaciones = marcadas.map(m => ({
    id_entrega: m.id_entrega,
    oc: m.oc,
    sku: m.sku,
    fecha_comunicada_almacen: m.fechaAlmacen,
  }))
  await upsertInBatches('programacion_oc', actualizaciones, 'id_entrega')

  return { marcadas, sinEncontrar, ambiguas }
}
