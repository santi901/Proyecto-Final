const supabase = require('../config/supabase')
const { generarPin, hashearPin, validarPin } = require('../utils/pin')
const { notificarEmpleador, notificarEmpleado, notificarNuevoTrabajo } = require('../services/notificacionesService')
const { buscarTrabajadoresDisponibles } = require('../services/matchingService')
const { emitirFinTrabajo } = require('../realtime/socket')
const { cotizar, firmarCotizacion, verificarCotizacion } = require('../services/preciosService')
const { MINUTOS_PARA_PAGAR, pagosSimulados } = require('../services/mercadoPagoService')
const pagos = require('../services/pagosService')
const { obtenerReputacion, actualizarReputacion } = require('../services/reputacionService')

const CAMPOS_PUBLICOS = 'id, titulo, descripcion, categoria, nivel_dificultad, precio, comision_porcentaje, comision_monto, monto_trabajador, estado, latitud, longitud, creado_en, solicitud_expira_en, iniciado_en, finalizado_en, confirmado_empleado_en, confirmado_empleador_en, cancelado_por'

const ESTADOS_CANCELABLES = ['pago_pendiente', 'pendiente', 'asignado']

// Cancelar con un trabajador ya asignado: gratis dentro de esta ventana desde que
// aceptó; pasada la ventana se retiene una parte como compensación al trabajador.
const VENTANA_CANCELACION_GRATIS_SEG = 90
const PENALIDAD_CANCELACION_PORCENTAJE = 20

const MAX_LARGO_COMENTARIO = 500

// Columnas que necesita el historial (Sprint 5): estado, fechas, duración y monto.
const CAMPOS_HISTORIAL = 'id, titulo, categoria, estado, precio, monto_trabajador, creado_en, iniciado_en, finalizado_en, cancelado_en, cancelado_por'

function calcularDuracionSegundos(trabajo) {
  if (!trabajo.iniciado_en || !trabajo.finalizado_en) return null
  return Math.round((new Date(trabajo.finalizado_en) - new Date(trabajo.iniciado_en)) / 1000)
}

// POST /api/trabajos/cotizar — el precio lo calcula el backend (preciosService).
// Devuelve un token firmado con la cotización, que hay que mandar al crear el trabajo.
async function cotizarTrabajo(req, res) {
  const { id: usuarioId } = req.usuario
  const { categoria, nivelDificultad, latitud, longitud } = req.body
  const datos = { categoria, nivelDificultad, latitud, longitud }

  try {
    const cotizacion = await cotizar(datos)
    const { token: cotizacionToken, validaHasta } = firmarCotizacion(usuarioId, datos, cotizacion)
    res.json({ cotizacion, cotizacionToken, validaHasta })
  } catch (error) {
    console.error(`Error cotizando trabajo (usuarioId=${usuarioId}, categoria=${categoria}): ${error.message ?? error}`)
    res.status(error.status ?? 500).json({ error: 'No se pudo calcular el precio, intentá de nuevo' })
  }
}

// POST /api/trabajos — el trabajo nace en 'pago_pendiente' y no se publica (ni se
// notifica a nadie) hasta que MP acredita el pago: ver pagosService.procesarPagoMp.
// Categoría, dificultad, ubicación y precio salen de la cotización firmada, no del body.
async function crearTrabajo(req, res) {
  const { id: usuarioId } = req.usuario
  const { titulo, descripcion, cotizacionToken } = req.body

  let cotizacion
  try {
    cotizacion = verificarCotizacion(cotizacionToken, usuarioId)
  } catch (error) {
    console.error(`Creación de trabajo rechazada (usuarioId=${usuarioId}): cotización inválida o vencida (${error.message}).`)
    return res.status(400).json({ error: 'La cotización venció o no es válida. Volvé a calcular el precio.' })
  }

  // Buscar perfil del empleador
  const { data: perfil } = await supabase
    .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()

  if (!perfil) {
    console.error(`Creación de trabajo rechazada (usuarioId=${usuarioId}): no tiene perfil de empleador creado.`)
    return res.status(400).json({ error: 'Completá tu perfil antes de crear un trabajo' })
  }

  const pin     = generarPin()
  const pinHash = await hashearPin(pin)
  const expira  = new Date(); expira.setHours(expira.getHours() + 24)

  // Mientras está en 'pago_pendiente', solicitud_expira_en es el plazo para pagar
  // (el poller lo cancela pasado ese tiempo). Al acreditarse el pago se reinicia
  // con la ventana normal de 15 min para que algún candidato acepte.
  const plazoPago = new Date(); plazoPago.setMinutes(plazoPago.getMinutes() + MINUTOS_PARA_PAGAR)

  const { data: trabajo, error } = await supabase
    .from('trabajos')
    .insert({
      empleador_id:         perfil.id,
      titulo, descripcion,
      categoria:            cotizacion.categoria,
      nivel_dificultad:     cotizacion.nivelDificultad,
      latitud:              cotizacion.latitud,
      longitud:             cotizacion.longitud,
      precio:               cotizacion.precio,
      comision_porcentaje:  cotizacion.comisionPorcentaje,
      comision_monto:       cotizacion.comisionMonto,
      monto_trabajador:     cotizacion.montoTrabajador,
      desglose_precio:      cotizacion.desglose,
      estado:               'pago_pendiente',
      pin_hash:             pinHash,
      pin_expira_en:        expira.toISOString(),
      solicitud_expira_en:  plazoPago.toISOString(),
    })
    .select(CAMPOS_PUBLICOS)
    .single()

  if (error) {
    console.error(`Error creando trabajo (empleadorId=${perfil.id}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error creando trabajo' })
  }

  let pago
  try {
    pago = await pagos.iniciarCobro({ trabajo, empleadorId: perfil.id })
  } catch (errorPago) {
    // Rollback manual (sin transacción, igual que el registro): un trabajo sin
    // forma de pagarlo no le sirve a nadie.
    console.error(`Error iniciando cobro (trabajoId=${trabajo.id}): ${errorPago.message ?? errorPago}`)
    await supabase.from('trabajos').delete().eq('id', trabajo.id)
    return res.status(errorPago.status ?? 502).json({ error: 'No se pudo iniciar el pago con MercadoPago, intentá de nuevo' })
  }

  // PIN se retorna SOLO aquí — el empleador lo muestra al empleado al llegar
  res.status(201).json({
    trabajo,
    pin,
    pago: { estado: pago.estado, monto: pago.monto, checkoutUrl: pago.mp_checkout_url, simulado: pagosSimulados() },
  })
}

// GET /api/trabajos/:id/pago — estado del cobro para el empleador dueño. Si
// sigue pendiente le pregunta a MP (la app llama a esto al volver del checkout).
async function obtenerEstadoPago(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId } = req.usuario

  const { data: perfil } = await supabase
    .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()

  const { data: trabajo } = await supabase
    .from('trabajos').select('id, estado, empleador_id').eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })
  if (!perfil || trabajo.empleador_id !== perfil.id) {
    console.error(`Consulta de pago rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no es el empleador dueño del trabajo.`)
    return res.status(403).json({ error: 'No sos el empleador de este trabajo' })
  }

  const pago = await pagos.sincronizarPago(trabajoId)
  if (!pago) return res.status(404).json({ error: 'Este trabajo no tiene un pago asociado' })

  const { data: actualizado } = await supabase
    .from('trabajos').select('estado').eq('id', trabajoId).maybeSingle()

  res.json({
    pago: {
      estado:           pago.estado,
      monto:            pago.monto,
      montoReembolsado: pago.monto_reembolsado,
      // Solo tiene sentido mientras se puede pagar.
      checkoutUrl:      pago.estado === 'pendiente' ? pago.mp_checkout_url : null,
      simulado:         pagosSimulados(),
    },
    estadoTrabajo: actualizado?.estado ?? trabajo.estado,
  })
}

// POST /api/trabajos/:id/pago/simular — solo en modo simulado (ver mercadoPagoService):
// lo llama la pantalla de checkout de la app al tocar "Pagar". Aprueba el pago como si
// lo hubiera confirmado MP, y el trabajo pasa a 'pendiente' (publicado).
async function simularPago(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId } = req.usuario

  const { data: perfil } = await supabase
    .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()

  const { data: trabajo } = await supabase
    .from('trabajos').select('id, empleador_id').eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })
  if (!perfil || trabajo.empleador_id !== perfil.id) {
    console.error(`Pago simulado rechazado (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no es el empleador dueño del trabajo.`)
    return res.status(403).json({ error: 'No sos el empleador de este trabajo' })
  }

  try {
    const pago = await pagos.simularPagoAprobado(trabajoId)
    const { data: actualizado } = await supabase
      .from('trabajos').select('estado').eq('id', trabajoId).maybeSingle()
    res.json({
      pago: { estado: pago.estado, monto: pago.monto, montoReembolsado: pago.monto_reembolsado, checkoutUrl: null, simulado: true },
      estadoTrabajo: actualizado?.estado,
    })
  } catch (error) {
    console.error(`Pago simulado rechazado (trabajoId=${trabajoId}): ${error.message ?? error}`)
    res.status(error.status ?? 500).json({ error: error.message ?? 'No se pudo procesar el pago' })
  }
}

async function listarTrabajos(req, res) {
  const { id: usuarioId, tipo } = req.usuario

  if (tipo === 'empleador') {
    const { data: perfil } = await supabase
      .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()

    if (!perfil) return res.status(404).json({ error: 'Perfil no encontrado' })

    const { data: trabajos, error } = await supabase
      .from('trabajos').select(CAMPOS_PUBLICOS)
      .eq('empleador_id', perfil.id)
      .order('creado_en', { ascending: false })

    if (error) return res.status(500).json({ error: 'Error listando trabajos' })
    return res.json({ trabajos })
  }

  // Empleado: ver trabajos disponibles. Se excluyen los 'pendiente' cuya solicitud
  // ya expiró (chequeo lazy, igual que el PIN: no hay cron que los cancele).
  const { data: trabajos, error } = await supabase
    .from('trabajos').select(CAMPOS_PUBLICOS)
    .eq('estado', 'pendiente')
    .gt('solicitud_expira_en', new Date().toISOString())
    .order('creado_en', { ascending: false })

  if (error) return res.status(500).json({ error: 'Error listando trabajos' })
  res.json({ trabajos })
}

// GET /api/trabajos/mios — a diferencia de listarTrabajos (que para un empleado
// muestra los 'pendiente' disponibles para tomar), esto devuelve los trabajos
// propios del usuario en cualquier estado: los que publicó (empleador) o los
// que tiene asignados/en curso/completados (empleado).
async function misTrabajos(req, res) {
  const { id: usuarioId, tipo } = req.usuario

  if (tipo === 'empleador') {
    const { data: perfil } = await supabase
      .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()

    if (!perfil) return res.status(404).json({ error: 'Perfil no encontrado' })

    const { data: trabajos, error } = await supabase
      .from('trabajos').select(CAMPOS_PUBLICOS)
      .eq('empleador_id', perfil.id)
      .order('creado_en', { ascending: false })

    if (error) {
      console.error(`Error listando trabajos propios (empleadorId=${perfil.id}): ${error.message ?? error}`)
      return res.status(500).json({ error: 'Error listando trabajos' })
    }
    return res.json({ trabajos })
  }

  const { data: empleado } = await supabase
    .from('empleados').select('id').eq('user_id', usuarioId).maybeSingle()

  if (!empleado) return res.status(404).json({ error: 'Perfil no encontrado' })

  const { data: trabajos, error } = await supabase
    .from('trabajos').select(CAMPOS_PUBLICOS)
    .eq('trabajador_id', empleado.id)
    .order('creado_en', { ascending: false })

  if (error) {
    console.error(`Error listando trabajos propios (empleadoId=${empleado.id}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error listando trabajos' })
  }
  res.json({ trabajos })
}

async function obtenerTrabajo(req, res) {
  const { id: trabajoId } = req.params
  const { tipo } = req.usuario

  const { data: trabajo } = await supabase
    .from('trabajos')
    .select(`${CAMPOS_PUBLICOS}, trabajador_id, empleador_id`)
    .eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })

  const duracionSegundos = calcularDuracionSegundos(trabajo)

  // Sprint 5: el empleador ve el nombre y la reputación del trabajador que lo tomó.
  let trabajador = null
  if (tipo === 'empleador' && trabajo.trabajador_id) {
    const { data: empleado } = await supabase
      .from('empleados').select('id, nombre, apellido, foto_url').eq('id', trabajo.trabajador_id).maybeSingle()
    if (empleado) {
      try {
        const { promedio, score, cantidadCalificaciones, trabajosCompletados } = await obtenerReputacion(empleado.id)
        trabajador = { ...empleado, reputacion: { promedio, score, cantidadCalificaciones, trabajosCompletados } }
      } catch {
        trabajador = { ...empleado, reputacion: null }
      }
    }
  }

  res.json({ trabajo: { ...trabajo, duracionSegundos, trabajador } })
}

async function aceptarTrabajo(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId } = req.usuario

  const { data: empleado } = await supabase
    .from('empleados').select('id').eq('user_id', usuarioId).maybeSingle()

  if (!empleado) {
    return res.status(400).json({ error: 'Completá tu perfil antes de aceptar trabajos' })
  }

  const { data: trabajo } = await supabase
    .from('trabajos').select('id, estado, empleador_id, solicitud_expira_en').eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })
  if (trabajo.estado !== 'pendiente') {
    return res.status(409).json({ error: 'El trabajo ya no está disponible' })
  }
  if (trabajo.solicitud_expira_en && new Date(trabajo.solicitud_expira_en) < new Date()) {
    console.error(`Aceptar trabajo rechazado (trabajoId=${trabajoId}): la solicitud expiró.`)
    return res.status(409).json({ error: 'La solicitud para este trabajo expiró' })
  }

  const { data: aceptado, error } = await supabase
    .from('trabajos')
    .update({ trabajador_id: empleado.id, estado: 'asignado', asignado_en: new Date().toISOString() })
    .eq('id', trabajoId)
    .eq('estado', 'pendiente')  // si otro lo aceptó (o se canceló) en el medio, no pisarlo
    .select('id')

  if (error) return res.status(500).json({ error: 'Error aceptando trabajo' })
  if (!aceptado?.length) {
    console.error(`Aceptar trabajo rechazado (trabajoId=${trabajoId}): cambió de estado mientras se aceptaba.`)
    return res.status(409).json({ error: 'El trabajo ya no está disponible' })
  }

  res.json({ message: 'Trabajo aceptado. El empleador te dará el PIN para iniciar.' })

  notificarEmpleador(trabajo.empleador_id, {
    tipo:    'cambio_estado',
    titulo:  'Trabajo aceptado',
    mensaje: 'Un trabajador aceptó tu trabajo. Compartile el PIN cuando llegue.',
    trabajoId,
  })
}

async function validarPinTrabajo(req, res) {
  const { id: trabajoId } = req.params
  const { pin } = req.body
  const { id: usuarioId } = req.usuario

  if (!pin) return res.status(400).json({ error: 'PIN requerido' })

  const { data: trabajo } = await supabase
    .from('trabajos')
    .select('id, estado, pin_hash, pin_expira_en, trabajador_id, empleador_id')
    .eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })
  if (trabajo.estado !== 'asignado') {
    return res.status(400).json({ error: 'El trabajo no está en estado asignado' })
  }
  if (new Date(trabajo.pin_expira_en) < new Date()) {
    return res.status(400).json({ error: 'El PIN expiró' })
  }

  const { data: empleado } = await supabase
    .from('empleados').select('id').eq('user_id', usuarioId).maybeSingle()

  if (!empleado || trabajo.trabajador_id !== empleado.id) {
    return res.status(403).json({ error: 'No tenés asignado este trabajo' })
  }

  const pinValido = await validarPin(pin, trabajo.pin_hash)
  if (!pinValido) return res.status(401).json({ error: 'PIN incorrecto' })

  await supabase
    .from('trabajos')
    .update({ estado: 'en_progreso', iniciado_en: new Date().toISOString() })
    .eq('id', trabajoId)

  res.json({ success: true, message: 'PIN validado. Trabajo iniciado.' })

  notificarEmpleador(trabajo.empleador_id, {
    tipo:    'cambio_estado',
    titulo:  'Trabajo iniciado',
    mensaje: 'El trabajador validó el PIN y arrancó el trabajo.',
    trabajoId,
  })
}

// Sprint 3 — "Confirmación de finalización por ambas partes antes de liberar el
// pago": ninguna de las dos partes puede completar el trabajo unilateralmente.
// Cada una llama este mismo endpoint (ya lo hacían ambas apps) y solo cuando
// las dos confirmaron el estado pasa a 'completado' — recién ahí se habilita
// calificar (que es, hoy, lo que gatea "liberar" algo en este proyecto).
async function completarTrabajo(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId, tipo } = req.usuario

  const { data: trabajo } = await supabase
    .from('trabajos')
    .select('id, estado, trabajador_id, empleador_id, iniciado_en, confirmado_empleado_en, confirmado_empleador_en, monto_trabajador')
    .eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })
  if (trabajo.estado !== 'en_progreso') {
    return res.status(400).json({ error: 'El trabajo no está en progreso' })
  }

  if (tipo === 'empleado') {
    const { data: empleado } = await supabase
      .from('empleados').select('id').eq('user_id', usuarioId).maybeSingle()
    if (!empleado || trabajo.trabajador_id !== empleado.id) {
      console.error(`Completar trabajo rechazado (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no es el empleado asignado.`)
      return res.status(403).json({ error: 'No tenés asignado este trabajo' })
    }
  } else {
    const { data: perfil } = await supabase
      .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()
    if (!perfil || trabajo.empleador_id !== perfil.id) {
      console.error(`Completar trabajo rechazado (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no es el empleador dueño del trabajo.`)
      return res.status(403).json({ error: 'No sos el empleador de este trabajo' })
    }
  }

  // Idempotente: si esta misma parte ya había confirmado, no hace nada de nuevo.
  const yaConfirmoEstaParte = tipo === 'empleado' ? trabajo.confirmado_empleado_en : trabajo.confirmado_empleador_en
  if (yaConfirmoEstaParte) {
    return res.json({
      message: 'Ya confirmaste la finalización. Esperando confirmación de la otra parte.',
      estado: 'en_progreso',
      esperandoConfirmacion: true,
    })
  }

  const ahora = new Date().toISOString()
  const campoConfirmacion = tipo === 'empleado' ? 'confirmado_empleado_en' : 'confirmado_empleador_en'
  const otraParteYaConfirmo = tipo === 'empleado' ? trabajo.confirmado_empleador_en : trabajo.confirmado_empleado_en

  if (!otraParteYaConfirmo) {
    // Primera confirmación: solo se registra, el trabajo sigue en_progreso.
    await supabase.from('trabajos').update({ [campoConfirmacion]: ahora }).eq('id', trabajoId)

    res.json({
      message: 'Confirmaste la finalización. Esperando confirmación de la otra parte.',
      estado: 'en_progreso',
      esperandoConfirmacion: true,
    })

    const payload = {
      tipo:    'cambio_estado',
      titulo:  'Confirmación pendiente',
      mensaje: 'La otra parte marcó el trabajo como completado. Confirmalo vos para cerrarlo.',
      trabajoId,
    }
    if (tipo === 'empleado') {
      notificarEmpleador(trabajo.empleador_id, payload)
    } else if (trabajo.trabajador_id) {
      notificarEmpleado(trabajo.trabajador_id, payload)
    }
    return
  }

  // Segunda confirmación: ya confirmaron ambas partes, se cierra el trabajo.
  const finalizadoEn = ahora
  await supabase
    .from('trabajos')
    .update({ estado: 'completado', finalizado_en: finalizadoEn, [campoConfirmacion]: ahora })
    .eq('id', trabajoId)

  const duracionSegundos = calcularDuracionSegundos({ ...trabajo, finalizado_en: finalizadoEn })

  res.json({ message: 'Trabajo completado exitosamente', estado: 'completado', duracionSegundos })

  emitirFinTrabajo(trabajoId, { estado: 'completado' })

  // La plata retenida desde que se creó el trabajo pasa a deberse al trabajador.
  if (trabajo.trabajador_id && trabajo.monto_trabajador) {
    pagos.liberarPago({ trabajoId, empleadoId: trabajo.trabajador_id, montoTrabajador: trabajo.monto_trabajador })
      .catch((e) => console.error(`Error liberando pago (trabajoId=${trabajoId}): ${e.message ?? e}`))
  }

  const payload = {
    tipo:    'cambio_estado',
    titulo:  'Trabajo completado',
    mensaje: 'El trabajo se marcó como completado.',
    trabajoId,
  }
  if (tipo === 'empleado') {
    notificarEmpleador(trabajo.empleador_id, payload)
  } else if (trabajo.trabajador_id) {
    notificarEmpleado(trabajo.trabajador_id, payload)
  }
}

// Qué parte del pago se le devuelve al empleador según el estado al cancelar.
// Si el que cancela es el trabajador, el empleador no tiene culpa: siempre 100%.
function porcentajeReembolso(trabajo, canceladoPor) {
  if (canceladoPor === 'empleado') return 100
  if (trabajo.estado !== 'asignado' || !trabajo.asignado_en) return 100
  const segundosDesdeAsignado = (Date.now() - new Date(trabajo.asignado_en)) / 1000
  return segundosDesdeAsignado <= VENTANA_CANCELACION_GRATIS_SEG ? 100 : 100 - PENALIDAD_CANCELACION_PORCENTAJE
}

// POST /api/trabajos/:id/cancelar — también es el endpoint de reembolso. El empleador
// dueño puede cancelar mientras nadie empezó a trabajar (pago_pendiente/pendiente/asignado):
//   pago_pendiente → se cancela, no hay nada que devolver
//   pendiente      → reembolso del 100%
//   asignado       → 100% dentro de los primeros 90s desde que el trabajador aceptó;
//                    después 80%, y el 20% retenido se le liquida al trabajador.
// El trabajador asignado también puede bajarse, solo en 'asignado' (reembolso del 100%).
// Una vez validado el PIN (en_progreso) ya no se puede cancelar por acá.
async function cancelarTrabajo(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId, tipo } = req.usuario
  const { motivo } = req.body ?? {}

  const { data: trabajo } = await supabase
    .from('trabajos').select('id, titulo, estado, empleador_id, trabajador_id, asignado_en').eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })

  if (tipo === 'empleado') {
    // Sprint 5: el trabajador puede bajarse de un trabajo que aceptó, pero solo antes
    // de arrancarlo (asignado). Cuenta para su tasa de cancelación (reputacionService).
    const { data: empleado } = await supabase
      .from('empleados').select('id').eq('user_id', usuarioId).maybeSingle()
    if (!empleado || trabajo.trabajador_id !== empleado.id) {
      console.error(`Cancelación rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no es el empleado asignado.`)
      return res.status(403).json({ error: 'No tenés asignado este trabajo' })
    }
    if (trabajo.estado !== 'asignado') {
      console.error(`Cancelación de empleado rechazada (trabajoId=${trabajoId}): estado actual '${trabajo.estado}'.`)
      return res.status(409).json({ error: 'Solo podés cancelar un trabajo antes de empezarlo' })
    }
  } else {
    const { data: perfil } = await supabase
      .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()
    if (!perfil) return res.status(400).json({ error: 'Completá tu perfil antes de cancelar trabajos' })
    if (trabajo.empleador_id !== perfil.id) {
      console.error(`Cancelación rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no es el empleador dueño del trabajo.`)
      return res.status(403).json({ error: 'No sos el empleador de este trabajo' })
    }
    if (!ESTADOS_CANCELABLES.includes(trabajo.estado)) {
      console.error(`Cancelación rechazada (trabajoId=${trabajoId}): estado actual '${trabajo.estado}' no es cancelable.`)
      return res.status(409).json({ error: 'El trabajo ya no se puede cancelar (está en curso o finalizado)' })
    }
  }

  // Se calcula antes del update: la ventana gratis corre hasta que el empleador tocó "cancelar".
  const porcentaje = porcentajeReembolso(trabajo, tipo)

  // Condicional sobre el estado leído: si el trabajador validó el PIN (o el
  // poller lo canceló) en el medio, no se cancela ni se reembolsa.
  const { data: cancelados, error } = await supabase
    .from('trabajos')
    .update({
      estado: 'cancelado',
      cancelado_por: tipo === 'empleado' ? 'empleado' : 'empleador',
      cancelado_en: new Date().toISOString(),
      motivo_cancelacion: motivo ?? null,
    })
    .eq('id', trabajoId)
    .eq('estado', trabajo.estado)
    .select('id')

  if (error) {
    console.error(`Error cancelando trabajo (trabajoId=${trabajoId}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error cancelando trabajo' })
  }
  if (!cancelados?.length) {
    console.error(`Cancelación rechazada (trabajoId=${trabajoId}): el estado cambió mientras se cancelaba.`)
    return res.status(409).json({ error: 'El trabajo cambió de estado, actualizá y probá de nuevo' })
  }

  let reembolso
  if (trabajo.estado === 'pago_pendiente') {
    // Si justo terminó de pagar, procesarPagoMp ve el trabajo cancelado y reembolsa el 100%.
    await pagos.cancelarPagoPendiente(trabajoId)
    reembolso = { porcentaje: 0, monto: 0, estado: 'sin_pago' }
  } else {
    const resultado = await pagos.reembolsarTrabajo({ trabajoId, porcentaje })
    reembolso = resultado.sinPago
      ? { porcentaje: 0, monto: 0, estado: 'sin_pago' }
      : { porcentaje, monto: resultado.monto, estado: resultado.ok ? 'procesado' : 'pendiente' }

    // La parte retenida va para el trabajador que ya estaba en camino.
    if (!resultado.sinPago && porcentaje < 100 && trabajo.trabajador_id) {
      const pago = await pagos.obtenerPagoDeTrabajo(trabajoId)
      await pagos.crearLiquidacion({
        trabajoId,
        empleadoId: trabajo.trabajador_id,
        pagoId:     pago.id,
        motivo:     'compensacion_cancelacion',
        monto:      pago.monto - pagos.montoAReembolsar(pago, porcentaje),
      })
    }
  }

  // El reembolso es para el empleador: al trabajador que se bajó no le corresponde ese mensaje.
  const mensajes = {
    sin_pago:  'Trabajo cancelado.',
    procesado: `Trabajo cancelado. Te devolvimos $${reembolso.monto} (${reembolso.porcentaje}%).`,
    pendiente: `Trabajo cancelado. El reembolso de $${reembolso.monto} se está procesando.`,
  }
  res.json({ message: tipo === 'empleado' ? 'Cancelaste el trabajo.' : mensajes[reembolso.estado], reembolso })

  emitirFinTrabajo(trabajoId, { estado: 'cancelado' })

  if (tipo === 'empleado') {
    notificarEmpleador(trabajo.empleador_id, {
      tipo:    'cambio_estado',
      titulo:  'El trabajador canceló',
      mensaje: `El trabajador ya no puede hacer "${trabajo.titulo}". Te devolvimos el pago completo; podés volver a publicarlo.`,
      trabajoId,
    })
  } else if (trabajo.trabajador_id) {
    notificarEmpleado(trabajo.trabajador_id, {
      tipo:    'cambio_estado',
      titulo:  'Trabajo cancelado',
      mensaje: porcentaje < 100
        ? 'El empleador canceló este trabajo. Vas a recibir una compensación por el traslado.'
        : 'El empleador canceló este trabajo.',
      trabajoId,
    })
  }
}

// Expone el matching portado (matchingService.js) para que el empleador pueda
// ver quién matchea con su trabajo, sin esperar al ciclo de notificación.
async function obtenerCandidatos(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId } = req.usuario
  const { radioKm } = req.query

  const { data: perfil } = await supabase
    .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()

  if (!perfil) return res.status(400).json({ error: 'Completá tu perfil antes de ver candidatos' })

  const { data: trabajo } = await supabase
    .from('trabajos').select('id, empleador_id').eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })
  if (trabajo.empleador_id !== perfil.id) {
    return res.status(403).json({ error: 'No sos el empleador de este trabajo' })
  }

  try {
    const candidatos = await buscarTrabajadoresDisponibles(trabajoId, radioKm ? Number(radioKm) : undefined)
    res.json({ candidatos })
  } catch (error) {
    console.error(`Error buscando candidatos (trabajoId=${trabajoId}): ${error.message ?? error}`)
    res.status(error.status ?? 500).json({ error: error.message ?? 'Error buscando candidatos' })
  }
}

// El empleador califica al empleado una vez completado el trabajo. Portado del
// backend NestJS (src/calificaciones): inserta en 'calificaciones' y recalcula
// empleados.reputacion (promedio desnormalizado, que es lo que ordena el matching).
async function calificarTrabajo(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId } = req.usuario
  const { puntaje, comentario } = req.body

  if (!Number.isInteger(puntaje) || puntaje < 1 || puntaje > 5) {
    console.error(`Calificación rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): puntaje inválido ${JSON.stringify(puntaje)}.`)
    return res.status(400).json({ error: 'El puntaje debe ser un entero entre 1 y 5' })
  }
  if (comentario != null && typeof comentario !== 'string') {
    console.error(`Calificación rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): comentario no es texto.`)
    return res.status(400).json({ error: 'El comentario tiene que ser texto' })
  }
  if (comentario && comentario.trim().length > MAX_LARGO_COMENTARIO) {
    console.error(`Calificación rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): comentario de ${comentario.trim().length} caracteres.`)
    return res.status(400).json({ error: `El comentario puede tener hasta ${MAX_LARGO_COMENTARIO} caracteres` })
  }

  const { data: perfil } = await supabase
    .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()

  if (!perfil) return res.status(400).json({ error: 'Completá tu perfil antes de calificar' })

  const { data: trabajo } = await supabase
    .from('trabajos').select('id, estado, trabajador_id, empleador_id').eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })
  if (trabajo.empleador_id !== perfil.id) {
    console.error(`Calificación rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no es el empleador dueño del trabajo.`)
    return res.status(403).json({ error: 'No sos el empleador de este trabajo' })
  }
  if (trabajo.estado !== 'completado') {
    return res.status(400).json({ error: 'Solo se puede calificar un trabajo completado' })
  }
  if (!trabajo.trabajador_id) {
    return res.status(400).json({ error: 'Este trabajo no tiene trabajador asignado' })
  }

  // Un trabajo se califica una sola vez.
  const { data: yaCalificado } = await supabase
    .from('calificaciones').select('id').eq('trabajo_id', trabajoId).maybeSingle()

  if (yaCalificado) {
    return res.status(409).json({ error: 'Este trabajo ya fue calificado' })
  }

  const { data: calificacion, error } = await supabase
    .from('calificaciones')
    .insert({
      trabajo_id:     trabajoId,
      calificador_id: perfil.id,
      calificado_id:  trabajo.trabajador_id,
      puntaje,
      comentario:     comentario?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    console.error(`Error guardando calificación (trabajoId=${trabajoId}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'No se pudo registrar la calificación, intentá de nuevo' })
  }

  let reputacion = null
  try {
    reputacion = await actualizarReputacion(trabajo.trabajador_id)
  } catch {
    // La calificación ya quedó guardada; la reputación se vuelve a calcular en la próxima consulta.
  }

  res.json({ message: 'Calificación enviada', calificacion, reputacion })

  notificarEmpleado(trabajo.trabajador_id, {
    tipo:    'calificacion',
    titulo:  'Te calificaron',
    mensaje: `Recibiste ${puntaje} estrella${puntaje === 1 ? '' : 's'} por tu último trabajo.`,
    trabajoId,
  })
}

// GET /api/trabajos/:id/calificacion — para que la app sepa si ya se calificó.
async function obtenerCalificacion(req, res) {
  const { id: trabajoId } = req.params
  const { data, error } = await supabase
    .from('calificaciones').select('id, puntaje, comentario, creado_en').eq('trabajo_id', trabajoId).maybeSingle()

  if (error) {
    console.error(`Error obteniendo calificación (trabajoId=${trabajoId}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error obteniendo la calificación' })
  }
  res.json({ calificacion: data })
}

// GET /api/trabajos/historial — Sprint 5. Todos los trabajos del usuario (los que
// tomó, si es empleado; los que publicó, si es empleador) con estado, fecha,
// duración y ganancia, más un resumen. La "ganancia" de un trabajo completado es lo
// que cobra el trabajador (monto_trabajador, precio menos comisión) o lo que pagó el
// empleador (precio); los cancelados y los que siguen abiertos van con 0.
async function historialTrabajos(req, res) {
  const { id: usuarioId, tipo } = req.usuario

  const tabla = tipo === 'empleado' ? 'empleados' : 'perfiles'
  const columna = tipo === 'empleado' ? 'trabajador_id' : 'empleador_id'

  const { data: perfil } = await supabase.from(tabla).select('id').eq('user_id', usuarioId).maybeSingle()
  if (!perfil) return res.status(404).json({ error: 'Perfil no encontrado' })

  const { data: filas, error } = await supabase
    .from('trabajos').select(CAMPOS_HISTORIAL).eq(columna, perfil.id).order('creado_en', { ascending: false })

  if (error) {
    console.error(`Error armando historial (${columna}=${perfil.id}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error cargando el historial' })
  }

  const ids = (filas ?? []).map(t => t.id)
  const { data: calificaciones, error: errorCal } = ids.length
    ? await supabase.from('calificaciones').select('trabajo_id, puntaje, comentario').in('trabajo_id', ids)
    : { data: [], error: null }
  if (errorCal) console.error(`Error leyendo calificaciones del historial: ${errorCal.message ?? errorCal}`)
  const calificacionPorTrabajo = Object.fromEntries((calificaciones ?? []).map(c => [c.trabajo_id, c]))

  const trabajos = (filas ?? []).map(t => ({
    id:               t.id,
    titulo:           t.titulo,
    categoria:        t.categoria,
    estado:           t.estado,
    precio:           t.precio,
    fecha:            t.finalizado_en ?? t.cancelado_en ?? t.creado_en,
    creado_en:        t.creado_en,
    iniciado_en:      t.iniciado_en,
    finalizado_en:    t.finalizado_en,
    cancelado_por:    t.cancelado_por,
    duracionSegundos: calcularDuracionSegundos(t),
    ganancia:         t.estado === 'completado'
      ? Number(tipo === 'empleado' ? t.monto_trabajador ?? t.precio : t.precio) || 0
      : 0,
    calificacion:     calificacionPorTrabajo[t.id] ?? null,
  })).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

  const completados = trabajos.filter(t => t.estado === 'completado')
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)

  res.json({
    trabajos,
    resumen: {
      total:                 trabajos.length,
      completados:           completados.length,
      cancelados:            trabajos.filter(t => t.estado === 'cancelado').length,
      enCurso:               trabajos.filter(t => ['asignado', 'en_progreso'].includes(t.estado)).length,
      gananciaTotal:         completados.reduce((s, t) => s + t.ganancia, 0),
      gananciaMes:           completados.filter(t => new Date(t.fecha) >= inicioMes).reduce((s, t) => s + t.ganancia, 0),
      duracionTotalSegundos: completados.reduce((s, t) => s + (t.duracionSegundos ?? 0), 0),
    },
  })
}

module.exports = {
  cotizarTrabajo, crearTrabajo, obtenerEstadoPago, simularPago, listarTrabajos, misTrabajos, obtenerTrabajo,
  aceptarTrabajo, validarPinTrabajo, completarTrabajo, calificarTrabajo,
  cancelarTrabajo, obtenerCandidatos, obtenerCalificacion, historialTrabajos,
}
