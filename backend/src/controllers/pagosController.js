const supabase = require('../config/supabase')
const mp = require('../services/mercadoPagoService')
const webhooks = require('../services/webhooksService')

// Estados de `pagos` en los que la plata efectivamente se cobró (aunque después se haya devuelto).
const ESTADOS_COBRADOS = ['aprobado', 'liberado', 'reembolsado', 'reembolsado_parcial', 'reembolso_fallido']

// POST /api/pagos/webhook — notificaciones de MercadoPago. Se responde enseguida
// (MP reintenta si tardamos o respondemos error) y se procesa después.
// El pago se vuelve a pedir a la API de MP: nunca se confía en el body.
// Cada notificación queda registrada en `webhooks_mp` (ver webhooksService.js).
async function recibirWebhook(req, res) {
  const tipo      = req.query.type ?? req.query.topic ?? req.body?.type
  const dataId    = req.query['data.id'] ?? req.body?.data?.id ?? req.query.id
  const requestId = req.headers['x-request-id']

  if (tipo !== 'payment' || !dataId) return res.sendStatus(200)

  let firmaValida = null  // null = no se pudo chequear (falta MP_WEBHOOK_SECRET)
  if (process.env.MP_WEBHOOK_SECRET) {
    firmaValida = mp.firmaWebhookValida({
      firma:     req.headers['x-signature'],
      requestId,
      dataId:    String(dataId),
    })
    if (!firmaValida) {
      console.error(`Webhook de MP rechazado (paymentId=${dataId}): firma inválida.`)
      res.sendStatus(401)
      await webhooks.registrarEvento({ tipo, dataId, requestId, firmaValida, estado: 'rechazado' })
      return
    }
  } else {
    console.error('Webhook de MP sin validar firma: falta MP_WEBHOOK_SECRET (no usar así en producción).')
  }

  res.sendStatus(200)

  const eventoId = await webhooks.registrarEvento({ tipo, dataId, requestId, firmaValida, estado: 'recibido' })
  await webhooks.procesarEvento(eventoId, dataId)
}

// GET /api/pagos/retorno — adonde MP redirige al terminar el checkout. Intenta
// volver a la app; si el deep link no abre (Expo Go, web), alcanza con cerrar
// el navegador: la app consulta GET /api/trabajos/:id/pago al volver.
function retornoCheckout(req, res) {
  const urlApp = process.env.APP_RETORNO_URL || 'appemployer://pago'
  const estado = req.query.collection_status ?? req.query.status
  const texto  = estado === 'approved'
    ? 'Pago recibido. Ya podés volver a ChanguitApp.'
    : 'No se completó el pago. Volvé a ChanguitApp para reintentarlo.'

  res.type('html').send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="1;url=${urlApp}">
<title>ChanguitApp</title></head>
<body style="font-family:sans-serif;text-align:center;padding:48px 16px">
<p>${texto}</p><p><a href="${urlApp}">Volver a la app</a></p>
</body></html>`)
}

// GET /api/pagos/mis-liquidaciones — lo que la plataforma le debe / le pagó al trabajador.
async function misLiquidaciones(req, res) {
  const { id: usuarioId } = req.usuario

  const { data: empleado } = await supabase
    .from('empleados').select('id, alias_cobro').eq('user_id', usuarioId).maybeSingle()
  if (!empleado) return res.status(404).json({ error: 'Perfil no encontrado' })

  const { data: liquidaciones, error } = await supabase
    .from('liquidaciones')
    .select('id, trabajo_id, motivo, monto, estado, creado_en, pagada_en')
    .eq('empleado_id', empleado.id)
    .order('creado_en', { ascending: false })

  if (error) {
    console.error(`Error listando liquidaciones (empleadoId=${empleado.id}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error listando liquidaciones' })
  }

  const pendiente = liquidaciones.filter((l) => l.estado === 'pendiente').reduce((t, l) => t + l.monto, 0)
  res.json({ liquidaciones, totalPendiente: pendiente, aliasCobro: empleado.alias_cobro })
}

// GET /api/pagos/admin/liquidaciones?estado=pendiente — para hacer las transferencias.
async function listarLiquidacionesAdmin(req, res) {
  const estado = req.query.estado ?? 'pendiente'

  const { data: liquidaciones, error } = await supabase
    .from('liquidaciones')
    .select('id, trabajo_id, empleado_id, motivo, monto, alias_cobro, estado, referencia, creado_en, pagada_en')
    .eq('estado', estado)
    .order('creado_en', { ascending: true })

  if (error) {
    console.error(`Error listando liquidaciones (admin, estado=${estado}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error listando liquidaciones' })
  }
  res.json({ liquidaciones })
}

// POST /api/pagos/admin/liquidaciones/:id/pagar { referencia } — se llama después
// de transferirle al trabajador; `referencia` es el nro. de operación.
async function marcarLiquidacionPagada(req, res) {
  const { id } = req.params
  const { referencia } = req.body

  const { data: pagadas, error } = await supabase
    .from('liquidaciones')
    .update({ estado: 'pagada', referencia, pagada_en: new Date().toISOString() })
    .eq('id', id)
    .eq('estado', 'pendiente')
    .select('id, trabajo_id, empleado_id, monto')

  if (error) {
    console.error(`Error marcando liquidación como pagada (id=${id}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error actualizando la liquidación' })
  }
  if (!pagadas?.length) {
    console.error(`Marcar liquidación rechazado (id=${id}): no existe o ya estaba pagada.`)
    return res.status(409).json({ error: 'La liquidación no existe o ya estaba pagada' })
  }
  res.json({ liquidacion: pagadas[0] })
}

// Datos del trabajo de cada pago/liquidación, de a una consulta para toda la lista.
async function trabajosPorId(ids) {
  if (!ids.length) return {}
  const { data, error } = await supabase
    .from('trabajos')
    .select('id, titulo, categoria, estado, precio, comision_porcentaje, comision_monto, monto_trabajador')
    .in('id', [...new Set(ids)])
  if (error) throw error
  return Object.fromEntries(data.map((t) => [t.id, t]))
}

const sumar = (filas, campo) => filas.reduce((total, f) => total + (Number(f[campo]) || 0), 0)

// Lo que pagó el empleador, con el desglose de cuánto se quedó la plataforma
// (comisión, que ya está incluida en el precio) y cuánto le devolvieron.
async function historialEmpleador(usuarioId) {
  const { data: perfil } = await supabase.from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()
  if (!perfil) throw { status: 404, message: 'Perfil no encontrado' }

  // select('*'): las columnas de fecha de `pagos` no son las mismas en todas las bases.
  const { data: filas, error } = await supabase.from('pagos').select('*').eq('empleador_id', perfil.id)
  if (error) throw error

  const trabajos = await trabajosPorId(filas.map((p) => p.trabajo_id))

  const pagos = filas
    .filter((p) => ESTADOS_COBRADOS.includes(p.estado))
    .map((p) => {
      const t = trabajos[p.trabajo_id] ?? {}
      const reembolsado = Number(p.monto_reembolsado) || 0
      return {
        id:               p.id,
        trabajoId:        p.trabajo_id,
        titulo:           t.titulo ?? null,
        categoria:        t.categoria ?? null,
        estadoTrabajo:    t.estado ?? null,
        estado:           p.estado,
        monto:            p.monto,
        comision:         { porcentaje: t.comision_porcentaje ?? null, monto: t.comision_monto ?? null },
        montoTrabajador:  t.monto_trabajador ?? null,
        montoReembolsado: reembolsado,
        montoNeto:        p.monto - reembolsado,
        simulado:         String(p.mp_payment_id ?? '').startsWith('sim-'),
        fecha:            p.aprobado_en ?? p.creado_en ?? p.actualizado_en ?? null,
        reembolsadoEn:    p.reembolsado_en ?? null,
      }
    })
    .sort((a, b) => new Date(b.fecha ?? 0) - new Date(a.fecha ?? 0))

  // La comisión solo se la queda la plataforma si el trabajo se completó (pago liberado).
  const liberados = pagos.filter((p) => p.estado === 'liberado')
  return {
    pagos,
    resumen: {
      cantidad:         pagos.length,
      totalPagado:      sumar(pagos, 'monto'),
      totalReembolsado: sumar(pagos, 'montoReembolsado'),
      totalNeto:        sumar(pagos, 'montoNeto'),
      totalComisiones:  liberados.reduce((total, p) => total + (Number(p.comision.monto) || 0), 0),
    },
  }
}

// Lo que cobró (o tiene por cobrar) el trabajador, con el bruto del trabajo y la
// comisión descontada. Las compensaciones por cancelación no llevan comisión.
async function historialEmpleado(usuarioId) {
  const { data: empleado } = await supabase.from('empleados').select('id').eq('user_id', usuarioId).maybeSingle()
  if (!empleado) throw { status: 404, message: 'Perfil no encontrado' }

  const { data: filas, error } = await supabase
    .from('liquidaciones')
    .select('id, trabajo_id, motivo, monto, estado, alias_cobro, referencia, creado_en, pagada_en')
    .eq('empleado_id', empleado.id)
    .order('creado_en', { ascending: false })
  if (error) throw error

  const trabajos = await trabajosPorId(filas.map((l) => l.trabajo_id))

  const pagos = filas.map((l) => {
    const t = trabajos[l.trabajo_id] ?? {}
    const porTrabajo = l.motivo === 'trabajo_completado'
    return {
      id:         l.id,
      trabajoId:  l.trabajo_id,
      titulo:     t.titulo ?? null,
      categoria:  t.categoria ?? null,
      motivo:     l.motivo,
      montoBruto: porTrabajo ? t.precio ?? null : l.monto,
      comision:   porTrabajo
        ? { porcentaje: t.comision_porcentaje ?? null, monto: t.comision_monto ?? null }
        : { porcentaje: 0, monto: 0 },
      montoNeto:  l.monto,
      estado:     l.estado,
      aliasCobro: l.alias_cobro,
      referencia: l.referencia,
      fecha:      l.creado_en,
      pagadaEn:   l.pagada_en,
    }
  })

  return {
    pagos,
    resumen: {
      cantidad:       pagos.length,
      totalBruto:     sumar(pagos, 'montoBruto'),
      totalComision:  pagos.reduce((total, p) => total + (Number(p.comision.monto) || 0), 0),
      totalNeto:      sumar(pagos, 'montoNeto'),
      totalCobrado:   sumar(pagos.filter((p) => p.estado === 'pagada'), 'montoNeto'),
      totalPendiente: sumar(pagos.filter((p) => p.estado === 'pendiente'), 'montoNeto'),
    },
  }
}

// GET /api/pagos/historial — historial de pagos con monto y comisión, para los dos roles.
//   empleador → lo que pagó por cada trabajo (cobrados por MP), reembolsos y neto
//   empleado  → sus liquidaciones: bruto del trabajo, comisión descontada y neto a cobrar
async function historialPagos(req, res) {
  const { id: usuarioId, tipo } = req.usuario
  try {
    res.json(tipo === 'empleado' ? await historialEmpleado(usuarioId) : await historialEmpleador(usuarioId))
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message })
    console.error(`Error armando historial de pagos (usuarioId=${usuarioId}, tipo=${tipo}): ${error.message ?? error}`)
    res.status(500).json({ error: 'Error cargando el historial de pagos' })
  }
}

module.exports = {
  recibirWebhook, retornoCheckout, misLiquidaciones, listarLiquidacionesAdmin, marcarLiquidacionPagada, historialPagos,
}
