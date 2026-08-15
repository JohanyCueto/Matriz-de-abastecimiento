import { useState } from 'react'
import { exportarExcel } from './lib/exporter'

export default function ExportButton() {
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    setBusy(true)
    try {
      await exportarExcel()
    } catch (err) {
      alert('No se pudo exportar: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button className="btn" disabled={busy} onClick={handleClick}>
      {busy ? 'Exportando...' : 'Exportar Excel'}
    </button>
  )
}
