import { useState } from 'react'
import { exportarCuadroAlmacen } from './lib/exportarAlmacen'

export default function ExportAlmacenButton() {
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    setBusy(true)
    try {
      await exportarCuadroAlmacen()
    } catch (err) {
      alert('No se pudo generar el cuadro de almacen: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button className="btn" disabled={busy} onClick={handleClick}>
      {busy ? 'Generando...' : 'Cuadro Almacen'}
    </button>
  )
}
