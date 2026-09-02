// Compara dos snapshots de la explosion de materiales (filas de
// explosion_materiales) y arma UNA tabla con todos los materiales (union
// de codigos de ambos snapshots), cada uno con su variacion de consumo en
// firme y el detalle mes a mes -- para que Johany vea de un vistazo que
// cambio, no solo lo que subio o bajo.

function contarClientes(cliente) {
  if (!cliente) return 0
  return new Set(cliente.split(',').map(s => s.trim()).filter(Boolean)).size
}

function agruparPorCodigo(filas) {
  const m = new Map()
  for (const f of filas) {
    if (!m.has(f.codigo)) {
      m.set(f.codigo, {
        codigo: f.codigo, descripcion: f.descripcion, cliente: f.cliente, grupo: f.grupo,
        version1: f.version1, version2: f.version2, version3: f.version3, stock: f.stock,
        mesFabricacionProximo: f.mes_fabricacion_proximo, fechaRequeridaIngreso: f.fecha_requerida_ingreso,
        meses: new Map(),
      })
    }
    m.get(f.codigo).meses.set(f.mes, f.consumo_firme || 0)
  }
  return m
}

const sumaMeses = mat => [...mat.meses.values()].reduce((a, b) => a + b, 0)

export function compararExplosiones(filasAnterior, filasActual) {
  const anterior = agruparPorCodigo(filasAnterior)
  const actual = agruparPorCodigo(filasActual)
  const todosLosCodigos = new Set([...anterior.keys(), ...actual.keys()])

  const filas = []
  for (const codigo of todosLosCodigos) {
    const matActual = actual.get(codigo)
    const matAnterior = anterior.get(codigo)
    const base = matActual || matAnterior

    const todosLosMeses = new Set([
      ...(matAnterior ? matAnterior.meses.keys() : []),
      ...(matActual ? matActual.meses.keys() : []),
    ])
    const meses = [...todosLosMeses].sort().map(mes => {
      const anteriorCant = matAnterior?.meses.get(mes) || 0
      const actualCant = matActual?.meses.get(mes) || 0
      return { mes, anterior: anteriorCant, actual: actualCant, variacion: actualCant - anteriorCant }
    })

    const consumoAnteriorTotal = matAnterior ? sumaMeses(matAnterior) : 0
    const consumoActualTotal = matActual ? sumaMeses(matActual) : 0
    const variacionAbs = consumoActualTotal - consumoAnteriorTotal
    const variacionPct = consumoAnteriorTotal ? Math.round((variacionAbs / consumoAnteriorTotal) * 1000) / 10 : null

    let categoria
    if (!matAnterior) categoria = 'nuevo'
    else if (!matActual) categoria = 'desaparecido'
    else if (variacionAbs > 0) categoria = 'aumento'
    else if (variacionAbs < 0) categoria = 'disminucion'
    else categoria = 'sin_cambio'

    filas.push({
      codigo,
      descripcion: base.descripcion,
      grupo: base.grupo,
      cliente: base.cliente,
      revisarVersion: contarClientes(base.cliente) > 1,
      version1: base.version1,
      version2: base.version2,
      version3: base.version3,
      stock: matActual ? matActual.stock : matAnterior.stock,
      mesFabricacionProximo: matActual ? matActual.mesFabricacionProximo : matAnterior.mesFabricacionProximo,
      fechaRequeridaIngreso: matActual ? matActual.fechaRequeridaIngreso : matAnterior.fechaRequeridaIngreso,
      consumoAnteriorTotal,
      consumoActualTotal,
      variacionAbs,
      variacionPct,
      categoria,
      meses,
    })
  }

  const prioridad = { nuevo: 0, aumento: 1, disminucion: 2, sin_cambio: 3, desaparecido: 4 }
  filas.sort((a, b) => {
    const p = prioridad[a.categoria] - prioridad[b.categoria]
    if (p !== 0) return p
    return Math.abs(b.variacionAbs) - Math.abs(a.variacionAbs)
  })

  return filas
}
