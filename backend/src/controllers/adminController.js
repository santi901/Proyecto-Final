const supabase = require('../config/supabase')
const { notificar } = require('../services/notificacionesService')
const { faltaMigracion } = require('../services/cuentasService')
const webhooks = require('../services/webhooksService')
const { pagosSimulados } = require('../services/mercadoPagoService')

// Panel de administración (rutas /api/admin/*, protegidas por soloAdmin con el header
// x-admin-key). La interfaz es backend/public/admin/, servida en GET /admin.
//
// Todas las listas son paginadas (?pagina=1&porPagina=25) y devuelven { total, pagina, porPagina }.

const POR_PAGINA_DEFAULT = 25

const MENSAJE_MIGRACION = 'Faltan tablas o columnas en Supabase (ver "Schema" en backend/CLAUDE.md)'

function paginacion(query) {
  const pagina    = Number(query.pagina) || 1
  const porPagina = Number(query.porPagina) || POR_PAGINA_DEFAULT
  return { pagina, porPagina, desde: (pagina - 1) * porPagina, hasta: pagina * porPagina - 1 }
}

// Para ilike: que un % o _ tipeado en el buscador se tome literal.
function escaparLike(texto) {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function responderError(res, contexto, error) {
  console.error(`Error en admin (${contexto}): ${error.message ?? error}`)
  const mensaje = faltaMigracion(error) || error.code === 'PGRST205' || error.code === '42P01'
    ? MENSAJE_MIGRACION
    : `Error en ${contexto}`
  res.status(500).json({ error: mensaje })
}

// { [user_id]: perfil } de empleados y perfiles (empleadores), para mostrar nombre y DNI.
async function perfilesPorUsuario(userIds) {
  if (!userIds.length) return {}
  const [empleados, empleadores] = await Promise.all([
    supabase.from('empleados').select('id, user_id, nombre, apellido, dni, alias_cobro, reputacion').in('user_id', userIds),
    supabase.from('perfiles').select('id, user_id, nombre, apellido, dni').in('user_id', userIds),
  ])
  const porUsuario = {}
  for (const p of empleadores.data ?? []) porUsuario[p.user_id] = p
  for (const p of empleados.data ?? []) porUsuario[p.user_id] = p
  return porUsuario
}

// { [id de empleados/perfiles]: "Nombre Apellido" }
async function nombresPorPerfil(tabla, ids) {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (!unicos.length) return {}
  const { data } = await supabase.from(tabla).select('id, nombre, apellido').in('id', unicos)
  return Object.fromEntries((data ?? []).map((p) => [p.id, `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim()]))
}

// GET /api/admin/resumen — números generales para la portada del panel. Trae solo las
// columnas que cuenta: alcanza para el volumen de este proyecto.
async function resumen(req, res) {
  const [usuarios, trabajos, pagos, liquidaciones] = await Promise.all([
    supabase.from('usuarios').select('tipo_usuario'),
    supabase.from('trabajos').select('estado, comision_monto'),
    supabase.from('pagos').select('estado, monto, monto_reembolsado'),
    supabase.from('liquidaciones').select('estado, monto'),
  ])

  const conError = [usuarios, trabajos, pagos, liquidaciones].find((r) => r.error)
  if (conError) return responderError(res, 'el resumen', conError.error)

  const contar = (filas, campo) => filas.reduce((acc, f) => ({ ...acc, [f[campo]]: (acc[f[campo]] ?? 0) + 1 }), {})
  const sumar  = (filas, campo) => filas.reduce((total, f) => total + (Number(f[campo]) || 0), 0)

  const pagosRetenidos = pagos.data.filter((p) => p.estado === 'aprobado')
  const pendientes     = liquidaciones.data.filter((l) => l.estado === 'pendiente')

  res.json({
    usuarios: { total: usuarios.data.length, porTipo: contar(usuarios.data, 'tipo_usuario') },
    trabajos: { total: trabajos.data.length, porEstado: contar(trabajos.data, 'estado') },
    pagos: {
      porEstado:          contar(pagos.data, 'estado'),
      // Plata cobrada a empleadores que todavía no se liberó ni se devolvió.
      montoRetenido:      sumar(pagosRetenidos, 'monto'),
      montoReembolsado:   sumar(pagos.data, 'monto_reembolsado'),
      comisionesGanadas:  sumar(trabajos.data.filter((t) => t.estado === 'completado'), 'comision_monto'),
      reembolsosFallidos: pagos.data.filter((p) => p.estado === 'reembolso_fallido').length,
    },
    liquidaciones: { pendientes: pendientes.length, montoPendiente: sumar(pendientes, 'monto') },
    pagosSimulados: pagosSimulados(),
  })
}

// GET /api/admin/usuarios?tipo=&q=&suspendido=
async function listarUsuarios(req, res) {
  const { tipo, q, suspendido } = req.query
  const { pagina, porPagina, desde, hasta } = paginacion(req.query)

  // select('*') para no depender de las columnas nuevas; password_hash se descarta abajo.
  let consulta = supabase.from('usuarios').select('*', { count: 'exact' }).order('email').range(desde, hasta)
  if (tipo)       consulta = consulta.eq('tipo_usuario', tipo)
  if (q)          consulta = consulta.ilike('email', `%${escaparLike(q)}%`)
  if (suspendido) consulta = consulta.eq('suspendido', suspendido === 'true')

  const { data, count, error } = await consulta
  if (error) return responderError(res, 'el listado de usuarios', error)

  const perfiles = await perfilesPorUsuario(data.map((u) => u.id))

  const usuarios = data.map((u) => {
    const p = perfiles[u.id]
    return {
      id:               u.id,
      email:            u.email,
      tipo:             u.tipo_usuario,
      creadoEn:         u.creado_en ?? u.created_at ?? null,
      suspendido:       u.suspendido === true,
      suspendidoMotivo: u.suspendido_motivo ?? null,
      suspendidoEn:     u.suspendido_en ?? null,
      verificado:       u.verificado === true,
      verificadoEn:     u.verificado_en ?? null,
      verificadoNota:   u.verificado_nota ?? null,
      perfil: p ? {
        id:         p.id,
        nombre:     p.nombre,
        apellido:   p.apellido,
        dni:        p.dni,
        aliasCobro: p.alias_cobro ?? null,
        reputacion: p.reputacion ?? null,
      } : null,
    }
  })

  res.json({ usuarios, total: count ?? usuarios.length, pagina, porPagina })
}

// POST /api/admin/usuarios/:id/suspension { suspendido, motivo }
// Suspender corta el acceso: se borran sus refresh tokens (la sesión muere cuando vence
// el access token, 15 min como mucho), el login y el refresh lo rechazan, y deja de
// recibir ofertas (matchingService). No toca los trabajos que ya tenga en curso.
async function cambiarSuspension(req, res) {
  const { id: usuarioId } = req.params
  const { suspendido, motivo } = req.body

  const { data: actualizados, error } = await supabase
    .from('usuarios')
    .update({
      suspendido,
      suspendido_motivo: suspendido ? motivo : null,
      suspendido_en:     suspendido ? new Date().toISOString() : null,
    })
    .eq('id', usuarioId)
    .select('id, email, suspendido, suspendido_motivo, suspendido_en')

  if (error) return responderError(res, 'la suspensión', error)
  if (!actualizados?.length) return res.status(404).json({ error: 'Usuario no encontrado' })

  if (suspendido) {
    const { error: errorTokens } = await supabase.from('refresh_tokens').delete().eq('usuario_id', usuarioId)
    if (errorTokens) console.error(`Error revocando sesiones del usuario suspendido (usuarioId=${usuarioId}): ${errorTokens.message ?? errorTokens}`)
  }

  console.error(`Admin: usuario ${suspendido ? 'suspendido' : 'reactivado'} (usuarioId=${usuarioId}${suspendido ? `, motivo=${motivo}` : ''}).`)
  res.json({ usuario: actualizados[0] })

  notificar(usuarioId, {
    tipo:    'cuenta',
    titulo:  suspendido ? 'Cuenta suspendida' : 'Cuenta reactivada',
    mensaje: suspendido ? `Suspendimos tu cuenta: ${motivo}` : 'Tu cuenta volvió a estar activa. Ya podés ingresar.',
  })
}

// POST /api/admin/usuarios/:id/verificacion { verificado, nota }
// Verificación manual de identidad: para cuando Rekognition no pudo (foto borrosa, DNI
// viejo) y un admin revisó los documentos a mano, o para quitarla si hubo un problema.
async function cambiarVerificacion(req, res) {
  const { id: usuarioId } = req.params
  const { verificado, nota } = req.body

  const { data: actualizados, error } = await supabase
    .from('usuarios')
    .update({
      verificado,
      verificado_en:   verificado ? new Date().toISOString() : null,
      verificado_nota: nota || null,
    })
    .eq('id', usuarioId)
    .select('id, email, verificado, verificado_en, verificado_nota')

  if (error) return responderError(res, 'la verificación', error)
  if (!actualizados?.length) return res.status(404).json({ error: 'Usuario no encontrado' })

  console.error(`Admin: verificación ${verificado ? 'aprobada' : 'quitada'} (usuarioId=${usuarioId}).`)
  res.json({ usuario: actualizados[0] })

  if (verificado) {
    notificar(usuarioId, { tipo: 'cuenta', titulo: 'Identidad verificada', mensaje: 'Revisamos tus datos y tu identidad quedó verificada.' })
  }
}

// GET /api/admin/trabajos?estado=&categoria=
async function listarTrabajos(req, res) {
  const { estado, categoria } = req.query
  const { pagina, porPagina, desde, hasta } = paginacion(req.query)

  let consulta = supabase
    .from('trabajos')
    .select('id, titulo, categoria, estado, precio, comision_monto, monto_trabajador, creado_en, finalizado_en, cancelado_en, cancelado_por, motivo_cancelacion, intentos_reasignacion, empleador_id, trabajador_id', { count: 'exact' })
    .order('creado_en', { ascending: false })
    .range(desde, hasta)
  if (estado)    consulta = consulta.eq('estado', estado)
  if (categoria) consulta = consulta.eq('categoria', categoria)

  const { data, count, error } = await consulta
  if (error) return responderError(res, 'el listado de trabajos', error)

  const [empleadores, trabajadores] = await Promise.all([
    nombresPorPerfil('perfiles', data.map((t) => t.empleador_id)),
    nombresPorPerfil('empleados', data.map((t) => t.trabajador_id)),
  ])

  const trabajos = data.map((t) => ({
    ...t,
    empleador:  empleadores[t.empleador_id] ?? null,
    trabajador: trabajadores[t.trabajador_id] ?? null,
  }))

  res.json({ trabajos, total: count ?? trabajos.length, pagina, porPagina })
}

// GET /api/admin/transacciones?tipo=pagos|liquidaciones&estado=
//   pagos         → cobros a empleadores (MercadoPago), con reembolsos
//   liquidaciones → lo que la plataforma le debe / pagó a cada trabajador
async function listarTransacciones(req, res) {
  const tipo = req.query.tipo ?? 'pagos'
  const { estado } = req.query
  const { pagina, porPagina, desde, hasta } = paginacion(req.query)

  const tabla = tipo === 'liquidaciones' ? 'liquidaciones' : 'pagos'

  const armar = (columnaOrden) => {
    let consulta = supabase.from(tabla).select('*', { count: 'exact' }).range(desde, hasta)
    if (columnaOrden) consulta = consulta.order(columnaOrden, { ascending: false })
    if (estado) consulta = consulta.eq('estado', estado)
    return consulta
  }

  let { data, count, error } = await armar('creado_en')
  // `pagos` puede no tener creado_en según cómo se creó la tabla: sin orden antes que sin datos.
  if (error && faltaMigracion(error)) ({ data, count, error } = await armar('actualizado_en'))
  if (error) return responderError(res, `el listado de ${tabla}`, error)

  const idsTrabajo = [...new Set(data.map((f) => f.trabajo_id).filter(Boolean))]
  const { data: trabajos } = idsTrabajo.length
    ? await supabase.from('trabajos').select('id, titulo, comision_porcentaje, comision_monto, monto_trabajador').in('id', idsTrabajo)
    : { data: [] }
  const trabajoPorId = Object.fromEntries((trabajos ?? []).map((t) => [t.id, t]))

  const nombres = tabla === 'liquidaciones'
    ? await nombresPorPerfil('empleados', data.map((l) => l.empleado_id))
    : await nombresPorPerfil('perfiles', data.map((p) => p.empleador_id))

  const filas = data.map((f) => {
    const t = trabajoPorId[f.trabajo_id] ?? {}
    return {
      ...f,
      titulo:             t.titulo ?? null,
      comisionPorcentaje: t.comision_porcentaje ?? null,
      comisionMonto:      t.comision_monto ?? null,
      montoTrabajador:    t.monto_trabajador ?? null,
      persona:            nombres[f.empleado_id ?? f.empleador_id] ?? null,
    }
  })

  res.json({ tipo: tabla, transacciones: filas, total: count ?? filas.length, pagina, porPagina })
}

// GET /api/admin/webhooks?estado= — notificaciones de MP recibidas (webhooksService).
async function listarWebhooks(req, res) {
  const { estado } = req.query
  const { pagina, porPagina, desde, hasta } = paginacion(req.query)

  let consulta = supabase.from('webhooks_mp').select('*', { count: 'exact' })
    .order('recibido_en', { ascending: false }).range(desde, hasta)
  if (estado) consulta = consulta.eq('estado', estado)

  const { data, count, error } = await consulta
  if (error) return responderError(res, 'el listado de webhooks', error)

  res.json({ webhooks: data, total: count ?? data.length, pagina, porPagina })
}

// POST /api/admin/webhooks/:id/reprocesar — vuelve a pedir el pago a MP y lo procesa.
// Seguro de repetir: procesarPagoMp es idempotente.
async function reprocesarWebhook(req, res) {
  const { id } = req.params

  const { data: evento, error } = await supabase.from('webhooks_mp').select('*').eq('id', id).maybeSingle()
  if (error) return responderError(res, 'el reproceso del webhook', error)
  if (!evento) return res.status(404).json({ error: 'Webhook no encontrado' })
  if (evento.estado === 'rechazado') {
    return res.status(409).json({ error: 'Este webhook tenía la firma inválida: no se reprocesa' })
  }
  if (pagosSimulados()) {
    return res.status(409).json({ error: 'Los pagos están en modo simulado: no hay a quién consultar el pago' })
  }

  const resultado = await webhooks.procesarEvento(evento.id, evento.data_id)
  if (!resultado.ok) return res.status(502).json({ error: resultado.error })
  res.json({ message: 'Webhook reprocesado', mpEstado: resultado.mpEstado })
}

module.exports = {
  resumen, listarUsuarios, cambiarSuspension, cambiarVerificacion,
  listarTrabajos, listarTransacciones, listarWebhooks, reprocesarWebhook,
}
