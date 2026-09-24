import { useState } from 'react'
import { exportarCuadroAlmacen, claveMes, nombreMes } from './lib/exportarAlmacen'

const MESES = [-1, 0, 1, 2].map(claveMes)

export default function ExportAlmacenButton() {
  const [mes, setMes] = useState(claveMes(0))
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    setBusy(true)
    try {
      await exportarCuadroAlmacen(mes)
    } catch (err) {
      alert('No se pudo generar el cuadro de almacen: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="imp">
      <select value={mes} onChange={e => setMes(e.target.value)}>
        {MESES.map(m => <option key={m} value={m}>{nombreMes(m)}</option>)}
      </select>
      <button className="btn" disabled={busy} onClick={handleClick}>
        {busy ? 'Generando...' : 'Cuadro Almacen'}
      </button>
    </span>
  )
}
