import { Fragment, useEffect, useMemo, useState } from 'react'
import { fmt, fdate } from './lib/derive'
import { obtenerUltimosSnapshots, obtenerMaterialesDeSnapshot, obtenerOcPorSku } from './lib/explosionImporter'
import { compararExplosiones } from './lib/explosionDiff'
import { calcularCompraSugerida } from './lib/explosionCompra'
import ExplosionButton from './ExplosionButton'

const fechaHora = s => s ? new Date(s).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
const mesLabel = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-PE', { month: 'long', year: 'numeric' }) : ''

const CAT_TAG = { nuevo: 't-grn', aumento: 't-red', disminucion: 't-blu', sin_cambio: 't-gry', desaparecido: 't-gry' }
const CAT_LABEL = { nuevo: 'Nuevo', aumento: 'Aumentó', disminucion: 'Disminuyó', sin_cambio: 'Sin cambio', desaparecido: 'Ya no aparece' }

const ESTADO_TAG = { cubierto: 't-grn', a_tiempo: 't-grn', ajustado: 't-amb', en_riesgo: 't-red', sin_oc: 't-red', sin_dato: 't-gry' }
const ESTADO_LABEL = { cubierto: 'Cubierto', a_tiempo: 'A tiempo', ajustado: 'Ajustado', en_riesgo: 'En riesgo', sin_oc: 'Sin OC', sin_dato: 'Sin dato fabricación' }

export default function Explosion() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [snaps, setSnaps] = useState([])
  const [filas, setFilas] = useState(null)
  const [expandido, setExpandido] = useState(null)

  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  const [fCliente, setFCliente] = useState('')
  const [fMesFab, setFMesFab] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [soloCambios, setSoloCambios] = useState(false)
  const [soloFaltante, setSoloFaltante] = useState(false)

  async function cargar() {
    setLoading(true)
    setErr(null)
    try {
      const ultimos = await obtenerUltimosSnapshots(2)
      setSnaps(ultimos)
      if (ultimos.length === 2) {
        const [actual, anterior] = ultimos
        const [matActual, matAnterior] = await Promise.all([
          obtenerMaterialesDeSnapshot(actual.id),
          obtenerMaterialesDeSnapshot(anterior.id),
        ])
        const comparadas = compararExplosiones(matAnterior, matActual)
        const ocPorSku = await obtenerOcPorSku(comparadas.map(f => f.codigo))
        setFilas(calcularCompraSugerida(comparadas, ocPorSku))
      } else {
        setFilas(null)
      }
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  // Igual que en Seguimiento OC: espera un momento sin escribir antes de
  // aplicar la busqueda, para que el cuadro de texto responda al instante.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 250)
    return () => clearTimeout(t)
  }, [qInput])

  const clientes = useMemo(() => filas ? [...new Set(filas.map(f => f.cliente).filter(Boolean))].sort() : [], [filas])
  const mesesFab = useMemo(() => filas ? [...new Set(filas.map(f => f.mesFabricacionProximo).filter(Boolean))].sort() : [], [filas])

  const filtradas = useMemo(() => {
    if (!filas) return []
    const qq = q.trim().toLowerCase()
    return filas.filter(f => {
      if (qq) {
        const busca = `${f.codigo} ${f.descripcion || ''} ${f.cliente || ''}`.toLowerCase()
        if (!busca.includes(qq)) return false
      }
      if (fGrupo && String(f.grupo) !== fGrupo) return false
      if (fCliente && f.cliente !== fCliente) return false
      if (fMesFab && f.mesFabricacionProximo !== fMesFab) return false
      if (fEstado && f.estadoAbastecimiento !== fEstado) return false
      if (soloCambios && f.categoria === 'sin_cambio') return false
      if (soloFaltante && f.faltanteReal <= 0) return false
      return true
    })
  }, [filas, q, fGrupo, fCliente, fMesFab, fEstado, soloCambios, soloFaltante])

  const kpis = useMemo(() => {
    if (!filas) return null
    const contarCat = cat => filas.filter(f => f.categoria === cat).length
    return {
      nuevo: contarCat('nuevo'),
      aumento: contarCat('aumento'),
      disminucion: contarCat('disminucion'),
      conFaltante: filas.filter(f => f.faltanteReal > 0).length,
      requierenCompra: filas.filter(f => f.compraSugerida > 0).length,
      enRiesgo: filas.filter(f => f.estadoAbastecimiento === 'en_riesgo').length,
    }
  }, [filas])

  function limpiar() {
    setQInput(''); setQ('')
    setFGrupo(''); setFCliente(''); setFMesFab(''); setFEstado('')
    setSoloCambios(false); setSoloFaltante(false)
  }

  return (
    <div>
      <div className="bar">
        <ExplosionButton onDone={cargar} />
        {snaps.length > 0 && (
          <span className="pct">
            Último snapshot: {snaps[0].archivo} ({fechaHora(snaps[0].creado_en)})
            {snaps.length === 2 && <> — comparado contra {snaps[1].archivo} ({fechaHora(snaps[1].creado_en)})</>}
          </span>
        )}
      </div>

      {err && <div className="empty">No se pudo cargar la comparación: {err}</div>}
      {loading && <div className="empty">Cargando...</div>}

      {!loading && !err && snaps.length === 0 && (
        <div className="empty">Todavía no hay ninguna explosión cargada. Usa "Cargar Explosión" para subir la primera.</div>
      )}
      {!loading && !err && snaps.length === 1 && (
        <div className="empty">Ya tienes un snapshot cargado ({snaps[0].archivo}). La próxima vez que cargues una explosión nueva vas a ver aquí qué cambió entre las dos.</div>
      )}

      {!loading && !err && filas && (
        <>
          <div className="kpis">
            <div className="kpi g"><div className="lb">Materiales nuevos</div><div className="vl">{kpis.nuevo}</div></div>
            <div className="kpi r"><div className="lb">Aumentaron consumo</div><div className="vl">{kpis.aumento}</div></div>
            <div className="kpi a"><div className="lb">Disminuyeron consumo</div><div className="vl">{kpis.disminucion}</div></div>
            <div className="kpi a"><div className="lb">Con faltante</div><div className="vl">{kpis.conFaltante}</div></div>
            <div className="kpi r"><div className="lb">Requieren compra</div><div className="vl">{kpis.requierenCompra}</div></div>
            <div className="kpi r"><div className="lb">En riesgo</div><div className="vl">{kpis.enRiesgo}</div></div>
          </div>

          <div className="bar">
            <input type="text" placeholder="Buscar por código, descripción o cliente" value={qInput} onChange={e => setQInput(e.target.value)} />
            <select value={fGrupo} onChange={e => setFGrupo(e.target.value)}>
              <option value="">Todos los grupos</option>
              {[1, 2, 3, 4].map(g => <option key={g} value={g}>Grupo {g}</option>)}
            </select>
            <select value={fCliente} onChange={e => setFCliente(e.target.value)}>
              <option value="">Todos los clientes</option>
              {clientes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={fMesFab} onChange={e => setFMesFab(e.target.value)}>
              <option value="">Todos los meses de fabricación</option>
              {mesesFab.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
            </select>
            <select value={fEstado} onChange={e => setFEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              {Object.keys(ESTADO_LABEL).map(e => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
            </select>
            <button className={`btn ${soloCambios ? 'act' : ''}`} onClick={() => setSoloCambios(v => !v)}>Solo con cambios</button>
            <button className={`btn ${soloFaltante ? 'act' : ''}`} onClick={() => setSoloFaltante(v => !v)}>Solo con faltante</button>
            <button className="btn" onClick={limpiar}>Limpiar</button>
            <span className="count">{fmt(filtradas.length)} materiales</span>
          </div>

          <div className="tw">
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Código</th>
                    <th>Descripción</th>
                    <th>Grupo</th>
                    <th>Cliente</th>
                    <th className="num">Stock</th>
                    <th className="num">Consumo anterior</th>
                    <th className="num">Consumo nuevo</th>
                    <th className="num">Variación</th>
                    <th className="num">Variación %</th>
                    <th>Cambio</th>
                    <th className="num">OC pendiente</th>
                    <th className="num">% Merma</th>
                    <th className="num">Faltante real</th>
                    <th className="num">Compra sugerida</th>
                    <th>Mes fabricación</th>
                    <th>Fecha requerida</th>
                    <th>Fecha programada</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(f => (
                    <Fragment key={f.codigo}>
                      <tr onClick={() => setExpandido(e => e === f.codigo ? null : f.codigo)}>
                        <td className="dim">{expandido === f.codigo ? '▾' : '▸'}</td>
                        <td className="mono">{f.codigo}</td>
                        <td><div className="dsc">{f.descripcion || ''}</div></td>
                        <td>{f.grupo ?? ''}</td>
                        <td>
                          {f.revisarVersion
                            ? <span className="tag t-amb">Revisar versión</span>
                            : (f.cliente || '')}
                        </td>
                        <td className="num">{fmt(f.stock)}</td>
                        <td className="num">{fmt(f.consumoAnteriorTotal)}</td>
                        <td className="num">{fmt(f.consumoActualTotal)}</td>
                        <td className="num">{f.variacionAbs > 0 ? '+' : ''}{fmt(f.variacionAbs)}</td>
                        <td className="num">{f.variacionPct == null ? '' : `${f.variacionPct > 0 ? '+' : ''}${f.variacionPct}%`}</td>
                        <td><span className={`tag ${CAT_TAG[f.categoria]}`}>{CAT_LABEL[f.categoria]}</span></td>
                        <td className="num">{fmt(f.ocPendiente)}</td>
                        <td className="num">{f.mermaPct}%</td>
                        <td className="num">{f.faltanteReal > 0 ? <b style={{ fontWeight: 500 }}>{fmt(f.faltanteReal)}</b> : <span className="dim">0</span>}</td>
                        <td className="num">{f.compraSugerida > 0 ? <b style={{ fontWeight: 500 }}>{fmt(f.compraSugerida)}</b> : <span className="dim">0</span>}</td>
                        <td className="nw">{f.mesFabricacionProximo ? mesLabel(f.mesFabricacionProximo) : <span className="dim">-</span>}</td>
                        <td className="mono">{f.fechaRequeridaIngreso ? fdate(f.fechaRequeridaIngreso) : <span className="dim">-</span>}</td>
                        <td className="mono">{f.fechaEntregaProgramada ? fdate(f.fechaEntregaProgramada) : <span className="dim">-</span>}</td>
                        <td><span className={`tag ${ESTADO_TAG[f.estadoAbastecimiento]}`}>{ESTADO_LABEL[f.estadoAbastecimiento]}</span></td>
                      </tr>
                      {expandido === f.codigo && (
                        <tr>
                          <td></td>
                          <td colSpan={18}>
                            <table className="expl-detalle">
                              <thead>
                                <tr><th>Mes</th><th className="num">Explosión anterior</th><th className="num">Nueva explosión</th><th className="num">Variación</th></tr>
                              </thead>
                              <tbody>
                                {f.meses.map(m => (
                                  <tr key={m.mes}>
                                    <td>{fdate(m.mes)}</td>
                                    <td className="num">{fmt(m.anterior)}</td>
                                    <td className="num">{fmt(m.actual)}</td>
                                    <td className="num">{m.variacion > 0 ? '+' : ''}{fmt(m.variacion)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {(f.version1 || f.version2 || f.version3) && (
                              <div className="pct" style={{ marginTop: 8 }}>
                                Versiones: {[f.version1, f.version2, f.version3].filter(Boolean).join(', ')}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {filtradas.length === 0 && <div className="empty">No hay materiales con estos filtros.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
