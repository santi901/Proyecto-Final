const supabase = require('../config/supabase')
const { generarPin, hashearPin, validarPin } = require('../utils/pin')
const { notificarEmpleador, notificarEmpleado, notificarNuevoTrabajo } = require('../services/notificacionesService')
const { buscarTrabajadoresDisponibles } = require('../services/matchingService')
const { emitirFinTrabajo } = require('../realtime/socket')
const { cotizar, firmarCotizacion, verificarCotizacion } = require('../services/preciosService')
const { MINUTOS_PARA_PAGAR, pagosSimulados } = require('../services/mercadoPagoService')
const pagos = require('../services/pagosService')

const CAMPOS_PUBLICOS = 'id, titulo, descripcion, categoria, nivel_dificultad, precio, comision_porcentaje, comision_monto, monto_trabajador, estado, latitud, longitud, creado_en, solicitud_expira_en, iniciado_en, finalizado_en'

const ESTADOS_CANCELABLES = ['pago_pendiente', 'pendiente', 'asignado']

// Cancelar con un trabajador ya asignado: gratis dentro de esta ventana desde que
// aceptó; pasada la ventana se retiene una parte como compensación al trabajador.
const VENTANA_CANCELACION_GRATIS_SEG = 90
const PENALIDAD_CANCELACION_PORCENTAJE = 20

// Backend NestJS de Nacho: solo calificaciones sigue viviendo ahí.
const NACHO_API_URL = process.env.NACHO_API_URL || 'http://localhost:3001'

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

  const { data: trabajo } = await supabase
    .from('trabajos')
    .select(`${CAMPOS_PUBLICOS}, trabajador_id, empleador_id`)
    .eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })

  const duracionSegundos = calcularDuracionSegundos(trabajo)

  res.json({ trabajo: { ...trabajo, duracionSegundos } })
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

  // No alcanza con que confirme una sola parte: hace falta que las dos
  // marquen el trabajo como completado antes de cerrarlo.
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
function porcentajeReembolso(trabajo) {
  if (trabajo.estado !== 'asignado' || !trabajo.asignado_en) return 100
  const segundosDesdeAsignado = (Date.now() - new Date(trabajo.asignado_en)) / 1000
  return segundosDesdeAsignado <= VENTANA_CANCELACION_GRATIS_SEG ? 100 : 100 - PENALIDAD_CANCELACION_PORCENTAJE
}

// POST /api/trabajos/:id/cancelar — también es el endpoint de reembolso:
//   pago_pendiente → se cancela, no hay nada que devolver
//   pendiente      → reembolso del 100%
//   asignado       → 100% dentro de los primeros 90s desde que el trabajador aceptó;
//                    después 80%, y el 20% retenido se le liquida al trabajador.
async function cancelarTrabajo(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId } = req.usuario
  const { motivo } = req.body

  const { data: perfil } = await supabase
    .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()

  if (!perfil) return res.status(400).json({ error: 'Completá tu perfil antes de cancelar trabajos' })

  const { data: trabajo } = await supabase
    .from('trabajos').select('id, estado, empleador_id, trabajador_id, asignado_en').eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })
  if (trabajo.empleador_id !== perfil.id) {
    console.error(`Cancelación rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no es el empleador dueño del trabajo.`)
    return res.status(403).json({ error: 'No sos el empleador de este trabajo' })
  }
  if (!ESTADOS_CANCELABLES.includes(trabajo.estado)) {
    console.error(`Cancelación rechazada (trabajoId=${trabajoId}): estado actual '${trabajo.estado}' no es cancelable.`)
    return res.status(409).json({ error: 'El trabajo ya no se puede cancelar (está en curso o finalizado)' })
  }

  // Se calcula antes del update: la ventana gratis corre hasta que el empleador tocó "cancelar".
  const porcentaje = porcentajeReembolso(trabajo)

  // Condicional sobre el estado leído: si el trabajador validó el PIN (o el
  // poller lo canceló) en el medio, no se cancela ni se reembolsa.
  const { data: cancelados, error } = await supabase
    .from('trabajos')
    .update({
      estado: 'cancelado',
      cancelado_por: 'empleador',
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

  const mensajes = {
    sin_pago:  'Trabajo cancelado.',
    procesado: `Trabajo cancelado. Te devolvimos $${reembolso.monto} (${reembolso.porcentaje}%).`,
    pendiente: `Trabajo cancelado. El reembolso de $${reembolso.monto} se está procesando.`,
  }
  res.json({ message: mensajes[reembolso.estado], reembolso })

  emitirFinTrabajo(trabajoId, { estado: 'cancelado' })

  if (trabajo.trabajador_id) {
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

// El empleador califica al empleado una vez completado el trabajo (empleados.reputacion
// se recalcula del lado de Nacho — ver src/calificaciones — así que solo se califica
// en ese sentido, no al revés).
async function calificarTrabajo(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId } = req.usuario
  const { puntaje, comentario } = req.body

  if (!Number.isInteger(puntaje) || puntaje < 1 || puntaje > 5) {
    return res.status(400).json({ error: 'El puntaje debe ser un entero entre 1 y 5' })
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

  // Un trabajo se califica una sola vez. A diferencia de notificar(), esto NO
  // es fire-and-forget: si no chequeamos esto acá (y esperamos la respuesta
  // de Nacho más abajo), no hay forma de que el usuario sepa que su
  // calificación se perdió o que ya había calificado este trabajo antes.
  const { data: yaCalificado } = await supabase
    .from('calificaciones').select('id').eq('trabajo_id', trabajoId).maybeSingle()

  if (yaCalificado) {
    return res.status(409).json({ error: 'Este trabajo ya fue calificado' })
  }

  let respuestaNacho
  try {
    respuestaNacho = await fetch(`${NACHO_API_URL}/calificaciones`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        trabajoId,
        calificadorId: perfil.id,
        calificadoId:  trabajo.trabajador_id,
        puntaje,
        comentario,
      }),
    })
  } catch (error) {
    console.error(`Error mandando calificación (trabajoId=${trabajoId}): ${error.message}`)
    return res.status(502).json({ error: 'No se pudo registrar la calificación, intentá de nuevo' })
  }

  if (!respuestaNacho.ok) {
    const detalle = await respuestaNacho.json().catch(() => null)
    console.error(`Calificación rechazada por Nacho (trabajoId=${trabajoId}): ${respuestaNacho.status} ${detalle?.message ?? ''}`)
    return res.status(502).json({ error: 'No se pudo registrar la calificación, intentá de nuevo' })
  }

  res.json({ message: 'Calificación enviada' })
}

module.exports = {
  cotizarTrabajo, crearTrabajo, obtenerEstadoPago, simularPago, listarTrabajos, misTrabajos, obtenerTrabajo,
  aceptarTrabajo, validarPinTrabajo, completarTrabajo, calificarTrabajo,
  obtenerCandidatos, cancelarTrabajo,
}
