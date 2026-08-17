import { useState } from 'react'
import { supabase } from './lib/supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
    setBusy(false)
    if (error) setError('Correo o clave incorrectos.')
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={entrar}>
        <h1>Seguimiento de materiales de empaque</h1>
        <p className="sub">Ingresa con tu correo de Roxfarma</p>
        <div className="fld">
          <label>Correo</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required />
        </div>
        <div className="fld">
          <label>Clave</label>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} autoComplete="current-password" required />
        </div>
        {error && <div className="login-err">{error}</div>}
        <button className="save" disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </div>
  )
}
