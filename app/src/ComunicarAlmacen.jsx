import { useMemo, useState } from 'react'
import { fmt, fdate, nombreMes } from './lib/derive'
import { exportarCuadroAlmacen, claveMes } from './lib/exportarAlmacen'

export default function ComunicarAlmacen({ rows, onClose }) {
  const [mes, setMes] = useState('')
  const [generando, setGenerando] = useState(false)

  const pendientesTodas = useMemo(() => rows
    .filter(r => r.fecha_programada_ingreso && r.abierto)
    .sort((a, b) => a.fecha_programada_ingreso.localeCompare(b.fecha_programada_ingreso)), [rows])

  const meses = useMemo(() => {
    const claves = [...new Set(pendientesTodas.map(r => r.fecha_programada_ingreso.slice(0, 7)))].sort()
    return claves.map(k => ({ valor: k, etiqueta: nombreMes(k) }))
  }, [pendientesTodas])

  const pendientes = useMemo(() => pendientesTodas
    .filter(r => !mes || r.fecha_programada_ingreso.slice(0, 7) === mes), [pendientesTodas, mes])

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

  return (
    <div className="mdl-ov" onClick={onClose}>
      <div className="mdl" onClick={e => e.stopPropagation()}>
        <div className="mdl-h">
          <h2>Comunicar a almacen</h2>
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>
        <div className="mdl-b">
          <div className="hint" style={{ marginBottom: 14 }}>
            Entregas pendientes de ingresar. Elige un mes y genera el Cuadro Almacen para enviarlo.
          </div>

          <div className="mdl-ctrl">
            <select value={mes} onChange={e => setMes(e.target.value)}>
              <option value="">Todos los meses</option>
              {meses.map(m => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
            </select>
            <button className="btn act" onClick={generarCuadro} disabled={!mes || generando} title={!mes ? 'Elige un mes primero' : ''}>
              {generando ? 'Generando...' : 'Generar Cuadro Almacen'}
            </button>
            <span className="count">{pendientes.length} pendientes</span>
          </div>

          {pendientes.length === 0 ? (
            <div className="mdl-empty">No hay entregas pendientes.</div>
          ) : (
            <div className="mdl-tbl">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th><th>Material</th><th>Proveedor</th>
                    <th>Programado</th><th>Ingresado</th><th>Saldo</th><th>F. programada</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientes.map(r => (
                    <tr key={r.id_entrega}>
                      <td>{r.sku}</td>
                      <td>{r.descripcion}</td>
                      <td>{r.proveedor}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.progEfectivo || r.cant_programada)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.cant_ingresada || 0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmt(r.saldo_pendiente)}</td>
                      <td>{fdate(r.fecha_programada_ingreso)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
