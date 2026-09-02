import { useEffect, useState } from 'react'
import { fmt, fdate } from './lib/derive'
import { obtenerUltimosSnapshots, obtenerMaterialesDeSnapshot } from './lib/explosionImporter'
import { compararSnapshots } from './lib/explosionDiff'
import ExplosionButton from './ExplosionButton'

const fechaHora = s => s ? new Date(s).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

function FilaMes({ c }) {
  return (
    <span className="tag t-gry" style={{ marginRight: 6 }}>
      {fdate(c.mes)}: {fmt(c.cantidadAnterior)} → {fmt(c.cantidadActual)} ({c.diferencia > 0 ? '+' : ''}{fmt(c.diferencia)})
    </span>
  )
}

function Seccion({ titulo, tag, items, render }) {
  return (
    <div className="expl-sec">
      <h3>{titulo} <span className={`tag ${tag}`}>{items.length}</span></h3>
      {items.length === 0
        ? <div className="empty">Sin cambios en esta categoría.</div>
        : <div className="tw"><div className="scroll"><table>
          <tbody>
            {items.map(it => (
              <tr key={it.codigo}>
                <td className="mono">{it.codigo}</td>
                <td><div className="dsc">{it.descripcion || ''}</div></td>
                <td>{render(it)}</td>
              </tr>
            ))}
          </tbody>
        </table></div></div>}
    </div>
  )
}

export default function Explosion() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [snaps, setSnaps] = useState([])
  const [diff, setDiff] = useState(null)

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
        setDiff(compararSnapshots(matAnterior, matActual))
      } else {
        setDiff(null)
      }
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

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

      {!loading && !err && diff && (
        <>
          <Seccion
            titulo="Materiales nuevos"
            tag="t-grn"
            items={diff.nuevos}
            render={it => <span className="num">{fmt(it.consumoFirmeTotal)} und (firme, total 5 meses)</span>}
          />
          <Seccion
            titulo="Aumentos de consumo en firme"
            tag="t-red"
            items={diff.aumentos}
            render={it => <>{it.cambiosPorMes.map(c => <FilaMes key={c.mes} c={c} />)}</>}
          />
          <Seccion
            titulo="Disminuciones de consumo en firme"
            tag="t-blu"
            items={diff.disminuciones}
            render={it => <>{it.cambiosPorMes.map(c => <FilaMes key={c.mes} c={c} />)}</>}
          />
          <Seccion
            titulo="Materiales que ya no aparecen"
            tag="t-gry"
            items={diff.desaparecidos}
            render={it => <span className="num">{fmt(it.consumoFirmeTotal)} und (firme, total 5 meses)</span>}
          />
        </>
      )}
    </div>
  )
}
