import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleLogin() {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    else onLogin(data.user)
  }

  async function handleRegister() {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setError(error.message)
    else setError('Revisá tu email para confirmar el registro.')
  }

  retrn (
    <div>
      <input placeholder="Email" onChange={e => setEmail(e.target.value)} />
      <input placeholder="Contraseña" type="password" onChange={e => setPassword(e.target.value)} />
      <button onClick={handleLogin}>Iniciar sesión</button>
      <button onClick={handleRegister}>Registrarse</button>
      {error && <p>{error}</p>}
    </div>
  )
}