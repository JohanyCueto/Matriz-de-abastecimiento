// A partir de las filas ya comparadas de compararExplosiones (parte 1) y
// lo que ya esta pendiente de recibir por OC (programacion_oc), calcula
// si de verdad hace falta comprar mas, cuanto, y si la fecha de entrega
// que ya tienes programada alcanza a tiempo.

const MARGEN_AJUSTADO_DIAS = 5

function mermaPorGrupo(grupo) {
  if (grupo === 1 || grupo === 2) return 10
  if (grupo === 3 || grupo === 4) return 5
  return 0
}

// Tope de cobertura de stock por grupo (confirmado con Johany): no tiene
// sentido comprar para tener guardado mas de esto, aunque el consumo
// futuro total de la explosion sea mayor -- se vuelve a comprar mas
// adelante cuando toque. Se usa el maximo del rango que dio Johany para
// Grupo 3/4 (1.5 a 2 meses).
function coberturaMesesPorGrupo(grupo) {
  if (grupo === 1 || grupo === 2) return 2.5
  if (grupo === 3 || grupo === 4) return 2
  return null // sin grupo conocido: no se limita, usa todo el horizonte
}

// Suma el consumo en firme desde el mes actual (calendario real, no el
// primer mes de la explosion) hacia adelante, hasta completar
// "mesesCobertura" -- admite fracciones (ej. 2.5 = 2 meses completos +
// mitad del siguiente), usando los montos reales de cada mes, no un
// promedio. Si mesesCobertura es null, usa todo el horizonte disponible
// (mismo comportamiento que antes de tener el tope por grupo).
function necesidadHastaCobertura(meses, mesesCobertura) {
  const ordenados = [...meses].sort((a, b) => a.mes.localeCompare(b.mes))
  if (mesesCobertura == null) return ordenados.reduce((a, m) => a + (m.actual || 0), 0)

  const hoy = new Date()
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
  const futuros = ordenados.filter(m => m.mes >= mesActual)

  let restante = mesesCobertura
  let total = 0
  for (const m of futuros) {
    if (restante <= 0) break
    total += (m.actual || 0) * Math.min(1, restante)
    restante -= 1
  }
  return total
}

export function calcularCompraSugerida(filas, ocPorSku) {
  return filas.map(f => {
    const mermaPct = mermaPorGrupo(f.grupo)
    const mesesCobertura = coberturaMesesPorGrupo(f.grupo)
    const necesidad = necesidadHastaCobertura(f.meses, mesesCobertura)
    const oc = ocPorSku.get(f.codigo) || { saldoPendiente: 0, fechaProgramada: null, entregas: [] }
    const stock = f.stock || 0

    const faltanteReal = Math.max(0, necesidad - stock - oc.saldoPendiente)
    // La merma se aplica sobre lo que de verdad falta comprar, no sobre
    // toda la necesidad -- si el stock y las OC ya cubren el consumo, no
    // hace falta agregar margen de merma a algo que no se va a comprar.
    const compraSugerida = Math.ceil(faltanteReal * (1 + mermaPct / 100))

    let estadoAbastecimiento
    if (faltanteReal <= 0) {
      estadoAbastecimiento = 'cubierto'
    } else if (!oc.fechaProgramada) {
      estadoAbastecimiento = 'sin_oc'
    } else if (!f.fechaRequeridaIngreso) {
      // Hay OC pendiente, pero no se pudo calcular la fecha requerida
      // (el material no aparecio en EXPLOSION_DETALLADA) -- no se puede
      // clasificar el riesgo con certeza.
      estadoAbastecimiento = 'sin_dato'
    } else {
      const diasDiferencia = Math.round(
        (new Date(oc.fechaProgramada) - new Date(f.fechaRequeridaIngreso)) / 86400000
      )
      if (diasDiferencia <= 0) estadoAbastecimiento = 'a_tiempo'
      else if (diasDiferencia <= MARGEN_AJUSTADO_DIAS) estadoAbastecimiento = 'ajustado'
      else estadoAbastecimiento = 'en_riesgo'
    }

    return {
      ...f,
      mermaPct,
      mesesCobertura,
      necesidadCobertura: necesidad,
      ocPendiente: oc.saldoPendiente,
      ocEntregas: oc.entregas,
      fechaEntregaProgramada: oc.fechaProgramada,
      faltanteReal,
      compraSugerida,
      estadoAbastecimiento,
    }
  })
}
