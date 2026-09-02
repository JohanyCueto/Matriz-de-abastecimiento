import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// sesion: undefined mientras carga, null si no hay nadie logueado, o la sesion real.
// perfil: nombre y rol (editor | lector) de la persona logueada.
export function useSesion() {
  const [sesion, setSesion] = useState(undefined)
  const [perfil, setPerfil] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, session) => setSesion(session))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!sesion) { setPerfil(null); return }
    supabase.from('perfiles').select('nombre,rol').eq('id', sesion.user.id).single()
      .then(({ data }) => setPerfil(data))
    // Se compara el id de usuario, no el objeto sesion completo: Supabase
    // genera una sesion "nueva" cada vez que renueva el token al volver a
    // la pestaña, y no hace falta pedir el perfil de nuevo por eso.
  }, [sesion?.user?.id])

  return { sesion, perfil, cargando: sesion === undefined }
}
