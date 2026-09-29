import { useEffect, useMemo, useState } from 'react'
import { fmt } from './lib/derive'
import {
  cargarContactos, guardarContacto, cargarHistorial, registrarEnvio,
  generarAsunto, generarEmailHtml, enviarRecordatorio,
  claveMes, nombreCorto,
} from './lib/recordatorioService'

function hace(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 60) return `hace ${min} min`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `hace ${hrs}h`
  const dias = Math.floor(hrs / 24)
  return `hace ${dias} dia${dias > 1 ? 's' : ''}`
}

export default function EnviarRecordatorios({ rows, esEditor, onClose }) {
  const [contactos, setContactos] = useState([])
  const [historial, setHistorial] = useState([])
  const [rango, setRango] = useState('este')
  const [buscar, setBuscar] = useState('')
  const [editEmail, setEditEmail] = useState({})
  const [vistaPrevia, setVistaPrevia] = useState(null)
  const [enviando, setEnviando] = useState(null)
  const [resultado, setResultado] = useState({})
  const [cargando, setCargando] = useState(true)

  const claveEste = claveMes(0)
  const claveProx = claveMes(1)

  useEffect(() => {
    Promise.all([
      cargarContactos().catch(() => []),
      cargarHistorial().catch(() => []),
    ]).then(([c, h]) => {
      setContactos(c)
      setHistorial(h)
      setCargando(false)
    })
  }, [])

  const porProveedor = useMemo(() => {
    const abiertas = rows.filter(r => r.abierto).filter(r => {
      const clave = r.fecha_programada_ingreso?.slice(0, 7)
      if (rango === 'este') return clave === claveEste
      if (rango === 'proximo') return clave === claveProx
      return clave === claveEste || clave === claveProx
    })

    const groups = new Map()
    for (const r of abiertas) {
      const prov = r.proveedor || 'Sin proveedor'
      if (!groups.has(prov)) groups.set(prov, [])
      groups.get(prov).push(r)
    }

    const bb = buscar.toLowerCase()
    return [...groups.entries()]
      .filter(([nombre]) => !bb || nombre.toLowerCase().includes(bb))
      .map(([nombre, filas]) => {
        const contacto = contactos.find(c => c.nombre === nombre)
        const atrasadas = filas.filter(r => r.dd != null && r.dd < 0).length
        const ultimoEnvio = historial.find(h => h.proveedor === nombre)
        return { nombre, filas, contacto, atrasadas, ultimoEnvio }
      })
      .sort((a, b) => b.atrasadas - a.atrasadas || b.filas.length - a.filas.length)
  }, [rows, contactos, historial, rango, buscar, claveEste, claveProx])

  const conCorreo = porProveedor.filter(p => p.contacto?.correo)
  const sinCorreo = porProveedor.filter(p => !p.contacto?.correo)

  async function guardarEmail(nombre, correo) {
    const existente = contactos.find(c => c.nombre === nombre)
    try {
      await guardarContacto({ id: existente?.id, nombre, correo })
      const nuevos = await cargarContactos()
      setContactos(nuevos)
    } catch (err) {
      alert('Error guardando contacto: ' + err.message)
    }
    setEditEmail(prev => { const n = { ...prev }; delete n[nombre]; return n })
  }

  async function enviarUno(prov) {
    if (!prov.contacto?.correo) return
    setEnviando(prov.nombre)
    setResultado(prev => ({ ...prev, [prov.nombre]: null }))
    const html = generarEmailHtml(prov.nombre, prov.filas)
    const asunto = generarAsunto(prov.nombre, prov.filas)
    try {
      await enviarRecordatorio(
        prov.contacto.correo,
        prov.contacto.correo_cc || null,
        asunto,
        html,
      )
      await registrarEnvio(prov.nombre, prov.contacto.correo, prov.filas.length)
      setResultado(prev => ({ ...prev, [prov.nombre]: 'ok' }))
      const h = await cargarHistorial()
      setHistorial(h)
    } catch (err) {
      setResultado(prev => ({ ...prev, [prov.nombre]: err.message }))
    }
    setEnviando(null)
  }

  async function enviarTodos() {
    for (const prov of conCorreo) {
      if (resultado[prov.nombre] === 'ok') continue
      await enviarUno(prov)
    }
  }

  async function copiarEmail(prov) {
    const html = generarEmailHtml(prov.nombre, prov.filas)
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([`Recordatorio de entregas pendientes - ${prov.nombre}`], { type: 'text/plain' }),
      })
      await navigator.clipboard.write([item])
      setResultado(prev => ({ ...prev, [prov.nombre]: 'copiado' }))
      setTimeout(() => setResultado(prev => ({ ...prev, [prov.nombre]: null })), 2000)
    } catch {
      alert('No se pudo copiar. Usa "Vista previa" y copia desde ahi.')
    }
  }

  if (vistaPrevia) {
    const prov = porProveedor.find(p => p.nombre === vistaPrevia)
    if (!prov) { setVistaPrevia(null); return null }
    const html = generarEmailHtml(prov.nombre, prov.filas)
    const asunto = generarAsunto(prov.nombre, prov.filas)
    return (
      <div className="mdl-ov" onClick={() => setVistaPrevia(null)}>
        <div className="mdl mdl-wide" onClick={e => e.stopPropagation()}>
          <div className="mdl-h">
            <h2>Vista previa del correo</h2>
            <button className="btn" onClick={() => setVistaPrevia(null)}>Volver</button>
          </div>
          <div className="mdl-b">
            <div className="prev-info">
              <span><b>Para:</b> {prov.contacto?.correo || '(sin correo)'}</span>
              {prov.contacto?.correo_cc && <span><b>CC:</b> {prov.contacto.correo_cc}</span>}
              <span><b>Asunto:</b> {asunto}</span>
            </div>
            <div className="prev-frame">
              <iframe
                title="Vista previa"
                srcDoc={html}
                style={{ width: '100%', height: '500px', border: '1px solid var(--brd)', borderRadius: 6, background: '#fff' }}
              />
            </div>
            <div className="prev-acts">
              <button className="btn act" onClick={() => copiarEmail(prov)}>
                {resultado[prov.nombre] === 'copiado' ? 'Copiado' : 'Copiar correo'}
              </button>
              {prov.contacto?.correo && esEditor && (
                <button
                  className="btn act"
                  disabled={enviando === prov.nombre || resultado[prov.nombre] === 'ok'}
                  onClick={() => enviarUno(prov)}
                >
                  {enviando === prov.nombre ? 'Enviando...' : resultado[prov.nombre] === 'ok' ? 'Enviado' : 'Enviar correo'}
                </button>
              )}
              {resultado[prov.nombre] && resultado[prov.nombre] !== 'ok' && resultado[prov.nombre] !== 'copiado' && (
                <span className="rec-err">{resultado[prov.nombre]}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mdl-ov" onClick={onClose}>
      <div className="mdl mdl-wide" onClick={e => e.stopPropagation()}>
        <div className="mdl-h">
          <h2>Recordatorios por correo</h2>
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>
        <div className="mdl-b">
          <div className="mdl-ctrl">
            <select value={rango} onChange={e => setRango(e.target.value)}>
              <option value="este">Pendientes de {nombreCorto(claveEste)}</option>
              <option value="proximo">Pendientes de {nombreCorto(claveProx)}</option>
              <option value="ambos">Ambos meses</option>
            </select>
            <input
              type="text"
              placeholder="Buscar proveedor..."
              value={buscar}
              onChange={e => setBuscar(e.target.value)}
              style={{ flex: 1, minWidth: 160 }}
            />
            {esEditor && conCorreo.length > 0 && (
              <button
                className="btn act"
                disabled={!!enviando}
                onClick={enviarTodos}
              >
                {enviando ? 'Enviando...' : `Enviar a todos (${conCorreo.length})`}
              </button>
            )}
          </div>

          {cargando ? <div className="mdl-empty">Cargando contactos...</div> : (
            <>
              <div className="rec-resumen">
                <span>{fmt(porProveedor.length)} proveedores con entregas pendientes</span>
                <span className="dim">
                  {conCorreo.length} con correo, {sinCorreo.length} sin correo
                </span>
              </div>

              <div className="rec-lista">
                {porProveedor.length === 0 && (
                  <div className="mdl-empty">No hay proveedores con entregas pendientes en este periodo.</div>
                )}
                {porProveedor.map(prov => (
                  <div key={prov.nombre} className={`rec-prov ${prov.atrasadas > 0 ? 'rec-prov-atraso' : ''}`}>
                    <div className="rec-prov-head">
                      <div className="rec-prov-nombre">
                        <b>{prov.nombre}</b>
                        <span className="rec-prov-cnt">
                          {prov.filas.length} entrega{prov.filas.length > 1 ? 's' : ''}
                          {prov.atrasadas > 0 && <span className="rec-atraso">{prov.atrasadas} atrasada{prov.atrasadas > 1 ? 's' : ''}</span>}
                        </span>
                      </div>
                      <div className="rec-prov-acciones">
                        <button className="btn-sm" onClick={() => setVistaPrevia(prov.nombre)}>Vista previa</button>
                        <button className="btn-sm" onClick={() => copiarEmail(prov)}>
                          {resultado[prov.nombre] === 'copiado' ? 'Copiado' : 'Copiar'}
                        </button>
                        {prov.contacto?.correo && esEditor && (
                          <button
                            className="btn-sm act"
                            disabled={enviando === prov.nombre || resultado[prov.nombre] === 'ok'}
                            onClick={() => enviarUno(prov)}
                          >
                            {enviando === prov.nombre ? '...' : resultado[prov.nombre] === 'ok' ? 'Enviado' : 'Enviar'}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="rec-prov-email">
                      {editEmail[prov.nombre] !== undefined ? (
                        <form onSubmit={e => { e.preventDefault(); guardarEmail(prov.nombre, editEmail[prov.nombre]) }} className="rec-email-form">
                          <input
                            type="email"
                            placeholder="correo@proveedor.com"
                            value={editEmail[prov.nombre]}
                            onChange={e => setEditEmail(prev => ({ ...prev, [prov.nombre]: e.target.value }))}
                            autoFocus
                          />
                          <button type="submit" className="btn-sm">Guardar</button>
                          <button type="button" className="btn-sm" onClick={() => setEditEmail(prev => { const n = { ...prev }; delete n[prov.nombre]; return n })}>
                            Cancelar
                          </button>
                        </form>
                      ) : prov.contacto?.correo ? (
                        <span className="rec-email-val">
                          {prov.contacto.correo}
                          {esEditor && <button className="btn-link" onClick={() => setEditEmail(prev => ({ ...prev, [prov.nombre]: prov.contacto.correo }))}>editar</button>}
                        </span>
                      ) : (
                        <span className="rec-email-val dim">
                          Sin correo
                          {esEditor && <button className="btn-link" onClick={() => setEditEmail(prev => ({ ...prev, [prov.nombre]: '' }))}>+ agregar</button>}
                        </span>
                      )}
                      {prov.ultimoEnvio && (
                        <span className="rec-ultimo">Ultimo envio: {hace(prov.ultimoEnvio.enviado_en)}</span>
                      )}
                    </div>
                    {resultado[prov.nombre] && resultado[prov.nombre] !== 'ok' && resultado[prov.nombre] !== 'copiado' && (
                      <div className="rec-err">{resultado[prov.nombre]}</div>
                    )}
                  </div>
                ))}
              </div>

              {historial.length > 0 && (
                <div className="rec-hist">
                  <h3>Ultimos envios</h3>
                  {historial.slice(0, 10).map(h => (
                    <div key={h.id} className="rec-hist-fila">
                      <span><b>{h.proveedor}</b> — {h.correo_destino}</span>
                      <span>{h.entregas_incluidas} entregas</span>
                      <span className="dim">{hace(h.enviado_en)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="hint" style={{ marginTop: 12 }}>
            Puedes copiar el correo y pegarlo en Outlook/Gmail, o enviarlo directo desde aqui si tienes Resend configurado.
          </div>
        </div>
      </div>
    </div>
  )
}
