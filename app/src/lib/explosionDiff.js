// Compara dos snapshots de la explosion de materiales (filas de
// explosion_materiales) y devuelve que cambio entre el anterior y el
// actual: materiales nuevos, que ya no aparecen, y cuyo consumo en firme
// subio o bajo -- con el detalle mes a mes, para que se vea exactamente
// donde esta la diferencia.

function agruparPorCodigo(filas) {
  const m = new Map()
  for (const f of filas) {
    if (!m.has(f.codigo)) {
      m.set(f.codigo, { codigo: f.codigo, descripcion: f.descripcion, cliente: f.cliente, grupo: f.grupo, meses: new Map() })
    }
    m.get(f.codigo).meses.set(f.mes, f.consumo_firme || 0)
  }
  return m
}

const sumaMeses = mat => [...mat.meses.values()].reduce((a, b) => a + b, 0)

export function compararSnapshots(filasAnterior, filasActual) {
  const anterior = agruparPorCodigo(filasAnterior)
  const actual = agruparPorCodigo(filasActual)

  const nuevos = []
  const desaparecidos = []
  const aumentos = []
  const disminuciones = []

  for (const [codigo, mat] of actual) {
    if (!anterior.has(codigo)) nuevos.push({ ...mat, consumoFirmeTotal: sumaMeses(mat) })
  }
  for (const [codigo, mat] of anterior) {
    if (!actual.has(codigo)) desaparecidos.push({ ...mat, consumoFirmeTotal: sumaMeses(mat) })
  }

  for (const [codigo, matActual] of actual) {
    const matAnterior = anterior.get(codigo)
    if (!matAnterior) continue
    const cambiosPorMes = []
    for (const [mes, cantActual] of matActual.meses) {
      const cantAnterior = matAnterior.meses.get(mes) || 0
      const diferencia = cantActual - cantAnterior
      if (diferencia !== 0) cambiosPorMes.push({ mes, cantidadAnterior: cantAnterior, cantidadActual: cantActual, diferencia })
    }
    if (!cambiosPorMes.length) continue
    const diferenciaTotal = cambiosPorMes.reduce((a, c) => a + c.diferencia, 0)
    const entrada = { codigo, descripcion: matActual.descripcion, cliente: matActual.cliente, grupo: matActual.grupo, cambiosPorMes, diferenciaTotal }
    if (diferenciaTotal > 0) aumentos.push(entrada)
    else if (diferenciaTotal < 0) disminuciones.push(entrada)
    // Si sube en un mes y baja en otro por la misma cantidad neta, se
    // clasifica igual segun si hubo algun mes que subio -- para que no se
    // pierda de vista que algo cambio.
    else if (cambiosPorMes.some(c => c.diferencia > 0)) aumentos.push(entrada)
    else disminuciones.push(entrada)
  }

  aumentos.sort((a, b) => b.diferenciaTotal - a.diferenciaTotal)
  disminuciones.sort((a, b) => a.diferenciaTotal - b.diferenciaTotal)
  nuevos.sort((a, b) => b.consumoFirmeTotal - a.consumoFirmeTotal)
  desaparecidos.sort((a, b) => b.consumoFirmeTotal - a.consumoFirmeTotal)

  return { nuevos, desaparecidos, aumentos, disminuciones }
}
