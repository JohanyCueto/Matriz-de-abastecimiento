import { useMemo, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { fmt, fdate } from './lib/derive'

export default function ComunicarAlmacen({ rows, onClose, onActualizado }) {
  const [seleccion, setSeleccion] = useState(new Set())
  const [guardando, setGuardando] = useState(false)

  // Nunca comunicadas a almacen (fecha_comunicada_almacen vacia): mientras
  // no se marquen aqui, el Cuadro Almacen no las muestra.
  const porComunicar = useMemo(() => rows
    .filter(r => !r.fecha_comunicada_almacen && r.fecha_programada_ingreso)
    .sort((a, b) => a.fecha_programada_ingreso.localeCompare(b.fecha_programada_ingreso)), [rows])

  // Ya comunicadas antes, pero la fecha vigente se movio desde entonces
  // (reprogramacion). Es solo informativo: el Cuadro Almacen ya las
  // muestra solas con su "Nueva fecha programada", no hace falta marcarlas.
  const conCambio = useMemo(() => rows
    .filter(r => r.fecha_comunicada_almacen && r.fecha_programada_ingreso && r.fecha_comunicada_almacen !== r.fecha_programada_ingreso)
    .sort((a, b) => a.fecha_programada_ingreso.localeCompare(b.fecha_programada_ingreso)), [rows])

  function toggle(id) {
    setSeleccion(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleTodas() {
    setSeleccion(prev => prev.size === porComunicar.length ? new Set() : new Set(porComunicar.map(r => r.id_entrega)))
  }

  async function marcarComunicadas() {
    setGuardando(true)
    try {
      const elegidas = porComunicar.filter(r => seleccion.has(r.id_entrega))
      for (const r of elegidas) {
        const { error } = await supabase.from('programacion_oc')
          .update({ fecha_comunicada_almacen: r.fecha_programada_ingreso })
          .eq('id_entrega', r.id_entrega)
        if (error) throw error
      }
      onActualizado(elegidas.map(r => ({ id_entrega: r.id_entrega, fecha_comunicada_almacen: r.fecha_programada_ingreso })))
      setSeleccion(new Set())
    } catch (err) {
      alert('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mdl-ov" onClick={onClose}>
      <div className="mdl" onClick={e => e.stopPropagation()}>
        <div className="mdl-h">
          <h2>Comunicar a almacen</h2>
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>
        <div className="mdl-b">
          <div className="hint" style={{ marginBottom: 14 }}>
            Marca aqui lo que vas a avisarle a almacen esta semana. Mientras una entrega no se marque, no sale en el Cuadro Almacen. Una vez marcada, su fecha queda congelada como "Fecha ingreso almacen" aunque despues se reprograme.
          </div>

          <div className="mdl-ctrl">
            <button className="btn" onClick={toggleTodas} disabled={!porComunicar.length}>
              {seleccion.size === porComunicar.length && porComunicar.length ? 'Quitar seleccion' : 'Seleccionar todas'}
            </button>
            <button className="btn act" onClick={marcarComunicadas} disabled={!seleccion.size || guardando}>
              {guardando ? 'Guardando...' : `Marcar ${seleccion.size || ''} como comunicadas`}
            </button>
            <span className="count">{porComunicar.length} sin comunicar</span>
          </div>

          {porComunicar.length === 0 ? (
            <div className="mdl-empty">No hay entregas nuevas por comunicar.</div>
          ) : (
            <div className="mdl-tbl">
              <table>
                <thead>
                  <tr>
                    <th></th><th>SKU</th><th>Material</th><th>Proveedor</th>
                    <th>Programado</th><th>F. programada</th>
                  </tr>
                </thead>
                <tbody>
                  {porComunicar.map(r => (
                    <tr key={r.id_entrega} onClick={() => toggle(r.id_entrega)} style={{ cursor: 'pointer' }}>
                      <td><input type="checkbox" checked={seleccion.has(r.id_entrega)} onChange={() => toggle(r.id_entrega)} onClick={e => e.stopPropagation()} /></td>
                      <td>{r.sku}</td>
                      <td>{r.descripcion}</td>
                      <td>{r.proveedor}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.cant_programada)}</td>
                      <td>{fdate(r.fecha_programada_ingreso)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {conCambio.length > 0 && (
            <>
              <div className="hint" style={{ margin: '18px 0 10px' }}>
                Ya comunicadas antes, pero su fecha se movio desde entonces (el Cuadro Almacen ya las muestra con "Nueva fecha programada", no hace falta hacer nada aqui):
              </div>
              <div className="mdl-tbl">
                <table>
                  <thead><tr><th>SKU</th><th>Material</th><th>Fecha avisada</th><th>Fecha nueva</th></tr></thead>
                  <tbody>
                    {conCambio.map(r => (
                      <tr key={r.id_entrega}>
                        <td>{r.sku}</td>
                        <td>{r.descripcion}</td>
                        <td className="dim">{fdate(r.fecha_comunicada_almacen)}</td>
                        <td>{fdate(r.fecha_programada_ingreso)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
