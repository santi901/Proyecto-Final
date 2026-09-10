const bcrypt = require('bcryptjs')
const supabase = require('../config/supabase')
const {
  generarAccessToken,
  generarRefreshToken,
  verificarRefreshToken,
} = require('../utils/jwt')

const SALT_ROUNDS = 12

// ── Helpers ──────────────────────────────────────────────────────────────────

function tokenExpiresAt(dias) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString()
}

async function crearTokens(payload) {
  const accessToken  = generarAccessToken(payload)
  const refreshToken = generarRefreshToken(payload)

  await supabase.from('refresh_tokens').insert({
    usuario_id: payload.id,
    token:      refreshToken,
    expira_en:  tokenExpiresAt(7),
  })

  return { accessToken, refreshToken }
}

// ── Controllers ───────────────────────────────────────────────────────────────

async function registrarEmpleado(req, res) {
  const {
    email, password,
    nombre, apellido, fechaNacimiento, dni,
    codigoPostal, direccion, radioBusqueda,
    fotoUrl, fotoDniUrl, lat, lng, categorias,
  } = req.body

  if (!email || !password || !nombre || !apellido || !fechaNacimiento || !dni || !codigoPostal || !direccion) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
  }

  // Email duplicado
  const { data: emailExistente } = await supabase
    .from('usuarios').select('id').eq('email', email).maybeSingle()
  if (emailExistente) return res.status(409).json({ error: 'El email ya está registrado' })

  // DNI duplicado en empleados
  const { data: dniExistente } = await supabase
    .from('empleados').select('id').eq('dni', dni).maybeSingle()
  if (dniExistente) return res.status(409).json({ error: 'Ya existe un empleado con ese DNI' })

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

  // Crear usuario
  const { data: usuario, error: userErr } = await supabase
    .from('usuarios')
    .insert({ email, password_hash: passwordHash, tipo_usuario: 'empleado' })
    .select('id, email, tipo_usuario')
    .single()

  if (userErr) {
    console.error('Error creando usuario:', userErr)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }

  // Crear perfil de empleado
  const { error: perfilErr } = await supabase.from('empleados').insert({
    user_id:        usuario.id,
    nombre,
    apellido,
    fecha_nacimiento: fechaNacimiento,
    dni,
    codigo_postal:  codigoPostal,
    direccion,
    radio_busqueda: radioBusqueda ?? 10,
    foto_url:       fotoUrl  ?? null,
    foto_dni_url:   fotoDniUrl ?? null,
    lat:            lat ?? null,
    lng:            lng ?? null,
    categorias:     Array.isArray(categorias) ? categorias : [],
  })

  if (perfilErr) {
    // Rollback: eliminar usuario creado
    await supabase.from('usuarios').delete().eq('id', usuario.id)
    console.error('Error creando perfil empleado:', perfilErr)
    return res.status(500).json({ error: 'Error guardando perfil' })
  }

  const payload = { id: usuario.id, email: usuario.email, tipo: usuario.tipo_usuario }
  const { accessToken, refreshToken } = await crearTokens(payload)

  res.status(201).json({ accessToken, refreshToken, usuario: payload })
}

async function registrarEmpleador(req, res) {
  const {
    email, password,
    nombre, apellido, fechaNacimiento, dni,
    codigoPostal, direccion, pisoDepartamento, indicaciones,
    fotoUrl, lat, lng,
  } = req.body

  if (!email || !password || !nombre || !apellido || !fechaNacimiento || !dni || !codigoPostal || !direccion) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
  }

  const { data: emailExistente } = await supabase
    .from('usuarios').select('id').eq('email', email).maybeSingle()
  if (emailExistente) return res.status(409).json({ error: 'El email ya está registrado' })

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

  const { data: usuario, error: userErr } = await supabase
    .from('usuarios')
    .insert({ email, password_hash: passwordHash, tipo_usuario: 'empleador' })
    .select('id, email, tipo_usuario')
    .single()

  if (userErr) {
    console.error('Error creando usuario:', userErr)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }

  const { error: perfilErr } = await supabase.from('perfiles').insert({
    user_id:           usuario.id,
    nombre,
    apellido,
    fecha_nacimiento:  fechaNacimiento,
    dni,
    codigo_postal:     codigoPostal,
    direccion,
    piso_departamento: pisoDepartamento ?? null,
    indicaciones:      indicaciones ?? null,
    foto_url:          fotoUrl ?? null,
    lat:               lat ?? null,
    lng:               lng ?? null,
  })

  if (perfilErr) {
    await supabase.from('usuarios').delete().eq('id', usuario.id)
    console.error('Error creando perfil empleador:', perfilErr)
    return res.status(500).json({ error: 'Error guardando perfil' })
  }

  const payload = { id: usuario.id, email: usuario.email, tipo: usuario.tipo_usuario }
  const { accessToken, refreshToken } = await crearTokens(payload)

  res.status(201).json({ accessToken, refreshToken, usuario: payload })
}

async function login(req, res) {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' })
  }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, email, password_hash, tipo_usuario')
    .eq('email', email)
    .maybeSingle()

  // Comparar siempre para evitar timing attack
  const passwordValida = usuario
    ? await bcrypt.compare(password, usuario.password_hash)
    : false

  if (!usuario || !passwordValida) {
    return res.status(401).json({ error: 'Credenciales inválidas' })
  }

  const payload = { id: usuario.id, email: usuario.email, tipo: usuario.tipo_usuario }
  const { accessToken, refreshToken } = await crearTokens(payload)

  res.json({ accessToken, refreshToken, usuario: payload })
}

async function refresh(req, res) {
  const { refreshToken } = req.body
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token requerido' })

  let payload
  try {
    payload = verificarRefreshToken(refreshToken)
  } catch {
    return res.status(403).json({ error: 'Refresh token inválido o expirado' })
  }

  const { data: stored } = await supabase
    .from('refresh_tokens')
    .select('id, expira_en')
    .eq('token', refreshToken)
    .maybeSingle()

  if (!stored || new Date(stored.expira_en) < new Date()) {
    return res.status(403).json({ error: 'Refresh token inválido o expirado' })
  }

  const nuevoAccessToken = generarAccessToken({
    id: payload.id, email: payload.email, tipo: payload.tipo,
  })

  res.json({ accessToken: nuevoAccessToken })
}

async function logout(req, res) {
  const { refreshToken } = req.body
  if (refreshToken) {
    await supabase.from('refresh_tokens').delete().eq('token', refreshToken)
  }
  res.json({ message: 'Sesión cerrada exitosamente' })
}

module.exports = { registrarEmpleado, registrarEmpleador, login, refresh, logout }
