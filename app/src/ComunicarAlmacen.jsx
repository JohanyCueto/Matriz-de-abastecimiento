import { useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { fmt, fdate, nombreMes } from './lib/derive'
import { exportarCuadroAlmacen, claveMes } from './lib/exportarAlmacen'
import { importarComunicacionAlmacen } from './lib/importarComunicacion'

export default function ComunicarAlmacen({ rows, onClose, onActualizado }) {
  const [seleccion, setSeleccion] = useState(new Set())
  const [guardando, setGuardando] = useState(false)
  const [mes, setMes] = useState('')
  const [cargandoArchivo, setCargandoArchivo] = useState(false)
  const [resultadoCarga, setResultadoCarga] = useState(null)
  const [generando, setGenerando] = useState(false)
  const inputRef = useRef(null)

  // Nunca comunicadas a almacen (fecha_comunicada_almacen vacia): mientras
  // no se marquen aqui, el Cuadro Almacen no las muestra.
  const porComunicarTodas = useMemo(() => rows
    .filter(r => !r.fecha_comunicada_almacen && r.fecha_programada_ingreso)
    .sort((a, b) => a.fecha_programada_ingreso.localeCompare(b.fecha_programada_ingreso)), [rows])

  const meses = useMemo(() => {
    const claves = [...new Set(porComunicarTodas.map(r => r.fecha_programada_ingreso.slice(0, 7)))].sort()
    return claves.map(k => ({ valor: k, etiqueta: nombreMes(k) }))
  }, [porComunicarTodas])

  const porComunicar = useMemo(() => porComunicarTodas
    .filter(r => !mes || r.fecha_programada_ingreso.slice(0, 7) === mes), [porComunicarTodas, mes])

  // Ya comunicadas antes, pero la fecha vigente se movio desde entonces
  // (reprogramacion). Es solo informativo: el Cuadro Almacen ya las
  // muestra solas con su "Nueva fecha programada", no hace falta marcarlas.
  const conCambio = useMemo(() => rows
    .filter(r => r.fecha_comunicada_almacen && r.fecha_programada_ingreso && r.fecha_comunicada_almacen !== r.fecha_programada_ingreso)
    .filter(r => !mes || r.fecha_programada_ingreso.slice(0, 7) === mes)
    .sort((a, b) => a.fecha_programada_ingreso.localeCompare(b.fecha_programada_ingreso)), [rows, mes])

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

  async function generarCuadro() {
    setGenerando(true)
    try {
      await exportarCuadroAlmacen(mes || claveMes(0))
    } catch (err) {
      alert('No se pudo generar el cuadro: ' + err.message)
    } finally {
      setGenerando(false)
    }
  }

  async function cargarArchivo(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setCargandoArchivo(true)
    setResultadoCarga(null)
    try {
      const res = await importarComunicacionAlmacen(file)
      setResultadoCarga(res)
      onActualizado()
    } catch (err) {
      alert('No se pudo leer el archivo: ' + err.message)
    } finally {
      setCargandoArchivo(false)
    }
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
            <button className="btn" onClick={() => inputRef.current.click()} disabled={cargandoArchivo}>
              {cargandoArchivo ? 'Leyendo...' : 'Cargar Excel ya enviado a almacen'}
            </button>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={cargarArchivo} />
            <span className="hint" style={{ margin: 0 }}>Para poner al dia de una vez lo que ya le avisaste antes, sin marcar una por una</span>
          </div>

          {resultadoCarga && (
            <div className="lock" style={{ marginBottom: 14 }}>
              <div className="lockt">{resultadoCarga.marcadas.length} entregas puestas al dia desde el archivo</div>
              {resultadoCarga.sinEncontrar.length > 0 && (
                <div className="lockd" style={{ marginTop: 8 }}>
                  {resultadoCarga.sinEncontrar.length} filas del archivo no se encontraron en el sistema (SKU no existe o ya no tiene saldo): {resultadoCarga.sinEncontrar.slice(0, 8).map(f => f.sku).join(', ')}{resultadoCarga.sinEncontrar.length > 8 ? '...' : ''}
                </div>
              )}
              {resultadoCarga.ambiguas.length > 0 && (
                <div className="lockd" style={{ marginTop: 8 }}>
                  {resultadoCarga.ambiguas.length} filas coinciden con mas de una entrega (mismo SKU y cantidad repetidos), no se marcaron para no adivinar: {resultadoCarga.ambiguas.slice(0, 8).map(a => a.fila.sku).join(', ')}{resultadoCarga.ambiguas.length > 8 ? '...' : ''}
                </div>
              )}
            </div>
          )}

          <div className="mdl-ctrl">
            <select value={mes} onChange={e => { setMes(e.target.value); setSeleccion(new Set()) }}>
              <option value="">Todos los meses</option>
              {meses.map(m => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
            </select>
            <button className="btn" onClick={toggleTodas} disabled={!porComunicar.length}>
              {seleccion.size === porComunicar.length && porComunicar.length ? 'Quitar seleccion' : 'Seleccionar todas'}
            </button>
            <button className="btn act" onClick={marcarComunicadas} disabled={!seleccion.size || guardando}>
              {guardando ? 'Guardando...' : `Marcar ${seleccion.size || ''} como comunicadas`}
            </button>
            <button className="btn" onClick={generarCuadro} disabled={!mes || generando} title={!mes ? 'Elige un mes primero' : ''}>
              {generando ? 'Generando...' : 'Generar Cuadro Almacen'}
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
