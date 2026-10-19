const supabase = require('../config/supabase')
const { obtenerReputacion } = require('../services/reputacionService')

async function obtenerPerfil(req, res) {
  const { id } = req.usuario

  const { data: perfil } = await supabase
    .from('empleados')
    .select('*')
    .eq('user_id', id)
    .maybeSingle()

  if (!perfil) return res.status(404).json({ error: 'Perfil no encontrado' })

  // Sprint 5: el perfil trae la reputación (promedio + score ponderado) para mostrarla.
  let reputacion = null
  try {
    reputacion = await obtenerReputacion(perfil.id)
  } catch {
    // Si falla el cálculo, el perfil se puede editar igual.
  }

  res.json({ perfil, reputacion })
}

// GET /api/empleados/:id/reputacion — reputación de cualquier trabajador (empleados.id),
// para que el empleador la vea antes/durante un trabajo.
async function reputacionEmpleado(req, res) {
  const { id: empleadoId } = req.params

  const { data: empleado } = await supabase
    .from('empleados').select('id, nombre, apellido, foto_url').eq('id', empleadoId).maybeSingle()

  if (!empleado) return res.status(404).json({ error: 'Trabajador no encontrado' })

  try {
    res.json({ empleado, reputacion: await obtenerReputacion(empleadoId) })
  } catch (error) {
    res.status(error.status ?? 500).json({ error: error.message ?? 'Error calculando la reputación' })
  }
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

module.exports = { obtenerPerfil, actualizarPerfil, reputacionEmpleado }
