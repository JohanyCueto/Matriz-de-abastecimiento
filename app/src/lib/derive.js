// Formato de numeros y fechas al estilo peruano, igual que en el prototipo.
export const fmt = n => n == null ? '' : new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 }).format(n)
export const fmtM = (n, m) => n == null ? '' : (m === 'DOLARES AMERICANOS' ? 'US$ ' : 'S/ ') +
  new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
export const fdate = s => {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

export const days = s => s ? Math.round((new Date(s + 'T00:00:00') - new Date()) / 864e5) : null

export const CERRADAS = ['Cerrado']

export const SEM = {
  atrasado: { c: 'var(--red)', t: 't-red', l: 'Atrasado' },
  porllegar: { c: 'var(--amb)', t: 't-amb', l: 'Por llegar' },
  enfecha: { c: 'var(--blu)', t: 't-blu', l: 'En fecha' },
  tolerancia: { c: 'var(--grn)', t: 't-grn', l: 'Cerrada dentro de tolerancia' },
  cerrado: { c: 'var(--gry)', t: 't-gry', l: 'Cerrado' },
}
export const EST_TAG = { Completo: 't-grn', Parcial: 't-amb', Pendiente: 't-blu' }
export const GES_TAG = { 'En seguimiento': 't-blu', Reprogramado: 't-amb', Atrasado: 't-red', Cerrado: 't-gry' }

export const MOTIVOS = ['', 'Falta de stock proveedor', 'Demora producción proveedor', 'Demora logística / despacho', 'Ingreso parcial', 'Reprogramación interna']
export const RESP = ['', 'Compras', 'Proveedor', 'Planeamiento', 'Almacén', 'Calidad']
export const G_ACT = ['En seguimiento', 'Reprogramado', 'Atrasado']

export function gestOpts(r) {
  if (r.estado_ingreso === 'Completo') return ['Cerrado']
  return G_ACT.concat(['Cerrado'])
}

// Le agrega a cada fila el numero de entrega y el total de entregas de su
// mismo OC+SKU, para mostrar "entrega 1 de 2" en la tabla.
export function withEntregas(rows) {
  const tot = {}
  rows.forEach(r => { const k = r.oc + '|' + r.sku; tot[k] = (tot[k] || 0) + 1 })
  return rows.map(r => ({
    ...r,
    entN: parseInt(String(r.n_entrega || 'E01').replace(/\D/g, ''), 10) || 1,
    entTot: tot[r.oc + '|' + r.sku],
  }))
}

// Le agrega a una fila los campos que se calculan en el navegador (no se
// guardan en la base, dependen de la fecha de hoy).
export function enrich(r) {
  const saldo = r.saldo_pendiente || 0
  const abierto = saldo > 0 && !CERRADAS.includes(r.estado_gestion)
  const tol = CERRADAS.includes(r.estado_gestion) && saldo > 0
  const dd = days(r.fecha_programada_ingreso)
  const prog = r.cant_programada || 0
  const avance = prog ? Math.min(1, (r.cant_ingresada || 0) / prog) : 0
  const desv = prog ? ((r.cant_ingresada || 0) - prog) / prog : 0
  let sem2
  if (tol) sem2 = 'tolerancia'
  else if (!abierto) sem2 = 'cerrado'
  else if (dd == null) sem2 = 'enfecha'
  else if (dd < 0) sem2 = 'atrasado'
  else if (dd <= 7) sem2 = 'porllegar'
  else sem2 = 'enfecha'
  const hist = Array.isArray(r.historial) ? r.historial : []
  const fprog0 = hist.length ? hist[0].de : r.fecha_programada_ingreso
  return { ...r, abierto, tol, dd, avance, desv, sem2, hist, fprog0 }
}
