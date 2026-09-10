const supabase = require('../config/supabase')

async function obtenerPerfil(req, res) {
  const { id } = req.usuario

  const { data: perfil } = await supabase
    .from('empleados')
    .select('*')
    .eq('user_id', id)
    .maybeSingle()

  if (!perfil) return res.status(404).json({ error: 'Perfil no encontrado' })

  res.json({ perfil })
}

async function actualizarPerfil(req, res) {
  const { id } = req.usuario
  const {
    nombre, apellido, fechaNacimiento, dni,
    codigoPostal, direccion, radioBusqueda,
    fotoUrl, fotoDniUrl, lat, lng, categorias,
  } = req.body

  if (!nombre || !apellido || !fechaNacimiento || !dni || !codigoPostal || !direccion) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' })
  }

  const { data: perfil, error } = await supabase
    .from('empleados')
    .update({
      nombre, apellido,
      fecha_nacimiento: fechaNacimiento,
      dni,
      codigo_postal:   codigoPostal,
      direccion,
      radio_busqueda:  radioBusqueda ?? 10,
      foto_url:        fotoUrl ?? null,
      foto_dni_url:    fotoDniUrl ?? null,
      lat:             lat ?? null,
      lng:             lng ?? null,
      categorias:      Array.isArray(categorias) ? categorias : [],
    })
    .eq('user_id', id)
    .select()
    .single()

  if (error) {
    console.error('Error actualizando perfil empleado:', error)
    return res.status(500).json({ error: 'Error actualizando perfil' })
  }

  res.json({ perfil })
}

module.exports = { obtenerPerfil, actualizarPerfil }
