const supabase = require('../config/supabase')
const { obtenerReputacion } = require('../services/reputacionService')
const { faltaMigracion } = require('../services/cuentasService')
const { analizarDatoCobro } = require('../utils/cobro')

// Las liquidaciones guardan una copia del alias/CBU del momento en que se generaron.
// Si el trabajador lo carga o lo cambia, las que todavía no se le transfirieron
// pasan a usar el nuevo: las ya pagadas no se tocan.
async function actualizarLiquidacionesPendientes(empleadoId, aliasCobro) {
  const { error } = await supabase
    .from('liquidaciones')
    .update({ alias_cobro: aliasCobro })
    .eq('empleado_id', empleadoId)
    .eq('estado', 'pendiente')

  if (error) {
    console.error(`Error actualizando el alias de liquidaciones pendientes (empleadoId=${empleadoId}): ${error.message ?? error}`)
  }
}

function describirMetodoCobro(perfil) {
  if (!perfil.alias_cobro) return null
  return {
    // Se deduce del valor en vez de guardarlo: el alias también se puede cambiar por PUT /perfil.
    tipo:          analizarDatoCobro(perfil.alias_cobro).tipo ?? null,
    valor:         perfil.alias_cobro,
    titular:       perfil.titular_cobro ?? null,
    actualizadoEn: perfil.cobro_actualizado_en ?? null,
  }
}

// GET /api/empleados/metodo-cobro — el CBU/CVU/alias que tiene cargado el trabajador.
async function obtenerMetodoCobro(req, res) {
  const { id: usuarioId } = req.usuario

  // select('*') para no depender de las columnas nuevas de empleados.
  const { data: perfil, error } = await supabase
    .from('empleados').select('*').eq('user_id', usuarioId).maybeSingle()

  if (error) {
    console.error(`Error leyendo método de cobro (usuarioId=${usuarioId}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error leyendo el método de cobro' })
  }
  if (!perfil) return res.status(404).json({ error: 'Perfil no encontrado' })

  res.json({ metodoCobro: describirMetodoCobro(perfil) })
}

// PUT /api/empleados/metodo-cobro { valor, titular? } — registra o reemplaza el CBU/CVU/alias.
// `valor` ya viene validado (dígitos verificadores incluidos) por esquemas.metodoCobro.
async function guardarMetodoCobro(req, res) {
  const { id: usuarioId } = req.usuario
  const { valor, titular } = req.body

  const { data: empleado } = await supabase
    .from('empleados').select('id').eq('user_id', usuarioId).maybeSingle()
  if (!empleado) return res.status(404).json({ error: 'Perfil no encontrado' })

  const completo = {
    alias_cobro:          valor,
    titular_cobro:        titular || null,
    cobro_actualizado_en: new Date().toISOString(),
  }

  let { data: perfil, error } = await supabase
    .from('empleados').update(completo).eq('id', empleado.id).select('*').single()

  // Si faltan las columnas nuevas, solo existe alias_cobro: se guarda eso, que es lo que usan las liquidaciones
  // (el titular queda sin guardar).
  if (error && faltaMigracion(error)) {
    console.error(`Método de cobro guardado sin tipo/titular (empleadoId=${empleado.id}): falta la columna titular_cobro en Supabase.`)
    ;({ data: perfil, error } = await supabase
      .from('empleados').update({ alias_cobro: valor }).eq('id', empleado.id).select('*').single())
  }

  if (error) {
    console.error(`Error guardando método de cobro (empleadoId=${empleado.id}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'No se pudo guardar el método de cobro' })
  }

  await actualizarLiquidacionesPendientes(empleado.id, valor)

  res.json({ metodoCobro: describirMetodoCobro(perfil) })
}

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
    fotoUrl, fotoDniUrl, lat, lng, categorias, aliasCobro,
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
      // CBU/CVU o alias adonde se le transfieren las liquidaciones. Si la app no
      // lo manda (versiones viejas), no se pisa el que ya estaba guardado.
      ...(aliasCobro !== undefined ? { alias_cobro: aliasCobro || null } : {}),
    })
    .eq('user_id', id)
    .select()
    .single()

  if (error) {
    console.error('Error actualizando perfil empleado:', error)
    return res.status(500).json({ error: 'Error actualizando perfil' })
  }

  if (aliasCobro) await actualizarLiquidacionesPendientes(perfil.id, aliasCobro)

  res.json({ perfil })
}

module.exports = { obtenerPerfil, actualizarPerfil, reputacionEmpleado, obtenerMetodoCobro, guardarMetodoCobro }
