import { Fragment, useEffect, useMemo, useState } from 'react'
import { fmt, fdate } from './lib/derive'
import { obtenerUltimosSnapshots, obtenerMaterialesDeSnapshot } from './lib/explosionImporter'
import { compararExplosiones } from './lib/explosionDiff'
import ExplosionButton from './ExplosionButton'

const fechaHora = s => s ? new Date(s).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

const CAT_TAG = { nuevo: 't-grn', aumento: 't-red', disminucion: 't-blu', sin_cambio: 't-gry', desaparecido: 't-gry' }
const CAT_LABEL = { nuevo: 'Nuevo', aumento: 'Aumentó', disminucion: 'Disminuyó', sin_cambio: 'Sin cambio', desaparecido: 'Ya no aparece' }

export default function Explosion() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [snaps, setSnaps] = useState([])
  const [filas, setFilas] = useState(null)
  const [expandido, setExpandido] = useState(null)

  const [fGrupo, setFGrupo] = useState('')
  const [fCliente, setFCliente] = useState('')
  const [soloCambios, setSoloCambios] = useState(false)

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
        setFilas(compararExplosiones(matAnterior, matActual))
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

  const clientes = useMemo(() => filas ? [...new Set(filas.map(f => f.cliente).filter(Boolean))].sort() : [], [filas])

  const filtradas = useMemo(() => {
    if (!filas) return []
    return filas.filter(f => {
      if (fGrupo && String(f.grupo) !== fGrupo) return false
      if (fCliente && f.cliente !== fCliente) return false
      if (soloCambios && f.categoria === 'sin_cambio') return false
      return true
    })
  }, [filas, fGrupo, fCliente, soloCambios])

  const kpis = useMemo(() => {
    if (!filas) return null
    const contar = cat => filas.filter(f => f.categoria === cat).length
    return {
      nuevo: contar('nuevo'), aumento: contar('aumento'), disminucion: contar('disminucion'),
      sin_cambio: contar('sin_cambio'), desaparecido: contar('desaparecido'),
    }
  }, [filas])

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
            <div className="kpi"><div className="lb">Sin cambios</div><div className="vl">{kpis.sin_cambio}</div></div>
            <div className="kpi"><div className="lb">Ya no aparecen</div><div className="vl">{kpis.desaparecido}</div></div>
          </div>

          <div className="bar">
            <select value={fGrupo} onChange={e => setFGrupo(e.target.value)}>
              <option value="">Todos los grupos</option>
              {[1, 2, 3, 4].map(g => <option key={g} value={g}>Grupo {g}</option>)}
            </select>
            <select value={fCliente} onChange={e => setFCliente(e.target.value)}>
              <option value="">Todos los clientes</option>
              {clientes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className={`btn ${soloCambios ? 'act' : ''}`} onClick={() => setSoloCambios(v => !v)}>Solo con cambios</button>
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
                      </tr>
                      {expandido === f.codigo && (
                        <tr>
                          <td></td>
                          <td colSpan={10}>
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
