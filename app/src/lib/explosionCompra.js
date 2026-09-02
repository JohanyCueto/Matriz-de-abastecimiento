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

export function calcularCompraSugerida(filas, ocPorSku) {
  return filas.map(f => {
    const mermaPct = mermaPorGrupo(f.grupo)
    const necesidad = f.consumoActualTotal || 0
    const oc = ocPorSku.get(f.codigo) || { saldoPendiente: 0, fechaProgramada: null }
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
      ocPendiente: oc.saldoPendiente,
      fechaEntregaProgramada: oc.fechaProgramada,
      faltanteReal,
      compraSugerida,
      estadoAbastecimiento,
    }
  })
}
