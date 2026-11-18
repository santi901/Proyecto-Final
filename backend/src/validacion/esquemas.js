const { z } = require('zod')
const { CATEGORIAS, DIFICULTADES } = require('../services/preciosService')
const { analizarDatoCobro } = require('../utils/cobro')
const { errorFechaProgramada } = require('../utils/programacion')

// Mensajes de error de zod en español.
z.config(z.locales.es())

// Esquemas de entrada por ruta. Los de rutas que ya existían antes del sprint 5
// usan z.looseObject (dejan pasar campos extra) para no romper lo que mandan las
// apps hoy; los nuevos usan z.object, que descarta todo lo que no esté declarado.

const texto      = (max) => z.string().trim().min(1).max(max)
const opcional   = (esquema) => esquema.nullish()
const latitud    = z.number().min(-90).max(90)
const longitud   = z.number().min(-180).max(180)
const categoria  = z.enum(CATEGORIAS)
const uuid       = z.uuid()

// CBU/CVU de 22 dígitos (con sus dígitos verificadores) o alias de 6 a 20 caracteres:
// ver utils/cobro.js.
const aliasCobro = z.string().trim().superRefine((valor, ctx) => {
  const { error } = analizarDatoCobro(valor)
  if (error) ctx.addIssue({ code: 'custom', message: error })
})

// Fecha y hora de un trabajo programado. Con zona horaria obligatoria ("2026-11-20T15:00:00-03:00"
// o "...Z"): sin ella no se sabe a qué hora se refiere. Se normaliza a ISO en UTC.
const fechaProgramada = z.iso.datetime({ offset: true })
  .superRefine((valor, ctx) => {
    const error = errorFechaProgramada(valor)
    if (error) ctx.addIssue({ code: 'custom', message: error })
  })
  .transform((valor) => new Date(valor).toISOString())

const pagina = {
  pagina:    z.coerce.number().int().min(1).max(10000).optional(),
  porPagina: z.coerce.number().int().min(1).max(100).optional(),
}

const datosPersonales = {
  nombre:          texto(80),
  apellido:        texto(80),
  fechaNacimiento: texto(30),
  dni:             z.coerce.string().trim().min(6).max(15),
  codigoPostal:    z.coerce.string().trim().min(1).max(10),
  direccion:       texto(200),
  fotoUrl:         opcional(z.string().max(2000)),
  lat:             opcional(latitud),
  lng:             opcional(longitud),
}

const datosEmpleado = {
  ...datosPersonales,
  radioBusqueda: opcional(z.number().min(1).max(100)),
  categorias:    opcional(z.array(categoria).max(CATEGORIAS.length)),
  fotoDniUrl:    opcional(z.string().max(2000)),
}

const datosEmpleador = {
  ...datosPersonales,
  pisoDepartamento: opcional(z.string().max(50)),
  indicaciones:     opcional(z.string().max(500)),
}

const credenciales = {
  email:    z.email().max(254),
  password: z.string().min(6).max(128),
}

module.exports = {
  uuid,

  // auth
  registrarEmpleado:  z.looseObject({ ...credenciales, ...datosEmpleado }),
  registrarEmpleador: z.looseObject({ ...credenciales, ...datosEmpleador }),
  login:              z.object({ email: z.string().trim().min(1).max(254), password: z.string().min(1).max(128) }),
  refresh:            z.object({ refreshToken: z.string().min(1).max(2000) }),
  logout:             z.object({ refreshToken: opcional(z.string().max(2000)) }),

  // perfiles
  perfilEmpleado:  z.looseObject({ ...datosEmpleado, aliasCobro: opcional(aliasCobro) }),
  perfilEmpleador: z.looseObject(datosEmpleador),
  metodoCobro:     z.object({
    valor:   aliasCobro,
    titular: opcional(z.string().trim().max(120)),
  }),

  // trabajos
  cotizar: z.object({
    categoria,
    nivelDificultad: z.enum(DIFICULTADES),
    latitud,
    longitud,
    // Sprint 6: si viene, el recargo por horario se calcula con esta fecha y queda
    // dentro del token (crearTrabajo toma la fecha de ahí, no del body).
    programadoPara:  opcional(fechaProgramada),
  }),
  crearTrabajo: z.object({
    titulo:          texto(100),
    descripcion:     texto(1000),
    cotizacionToken: z.string().min(1).max(4000),
    programadoPara:  opcional(fechaProgramada),
  }),
  reprogramar:      z.object({ programadoPara: fechaProgramada.nullable() }),
  programadosQuery: z.looseObject({ incluirFinalizados: z.enum(['true', 'false']).optional() }),
  validarPin:  z.object({ pin: z.coerce.string().regex(/^\d{6}$/, 'El PIN tiene 6 dígitos') }),
  // Sprint 6: motivo obligatorio. Es un código de MOTIVOS_CANCELACION (cancelacionesService);
  // que corresponda al rol de quien cancela se chequea en el controller.
  cancelar:    z.object({
    motivo:  z.string({ error: 'Elegí el motivo de la cancelación' }).trim().min(1, 'Elegí el motivo de la cancelación').max(40),
    detalle: opcional(z.string().trim().max(300)),
  }),
  calificar:   z.object({
    puntaje:    z.number().int().min(1).max(5),
    comentario: opcional(z.string().trim().max(500)),
  }),
  candidatosQuery: z.looseObject({ radioKm: z.coerce.number().min(0.1).max(100).optional() }),
  mensaje:     z.object({ mensaje: texto(1000) }),

  // ubicación
  actualizarUbicacion: z.object({
    workerId: uuid,
    lat:      latitud,
    lng:      longitud,
    jobId:    opcional(uuid),
  }),
  calcularViajeQuery: z.looseObject({
    direccionTrabajador: texto(200),
    direccionEmpleador:  texto(200),
  }),

  // pagos (admin)
  liquidacionesQuery: z.looseObject({ estado: z.enum(['pendiente', 'pagada']).optional() }),
  marcarLiquidacion:  z.object({ referencia: texto(100) }),

  // admin
  usuariosQuery: z.looseObject({
    ...pagina,
    tipo:       z.enum(['empleado', 'empleador']).optional(),
    q:          z.string().trim().max(100).optional(),
    suspendido: z.enum(['true', 'false']).optional(),
  }),
  trabajosAdminQuery: z.looseObject({
    ...pagina,
    estado:    z.enum(['pago_pendiente', 'programado', 'pendiente', 'asignado', 'en_progreso', 'completado', 'cancelado']).optional(),
    categoria: categoria.optional(),
  }),
  // Sprint 6 — disputas en el panel de admin.
  disputasQuery: z.looseObject({
    ...pagina,
    estado: z.enum(['abierta', 'en_revision', 'resuelta', 'rechazada']).optional(),
  }),
  cambiarDisputa: z.object({
    estado:     z.enum(['en_revision', 'resuelta', 'rechazada']),
    resolucion: opcional(z.string().trim().max(1000)),
  }),
  transaccionesQuery: z.looseObject({
    ...pagina,
    tipo:   z.enum(['pagos', 'liquidaciones']).optional(),
    estado: z.string().trim().max(30).optional(),
  }),
  webhooksQuery: z.looseObject({
    ...pagina,
    estado: z.enum(['recibido', 'procesado', 'error', 'rechazado']).optional(),
  }),
  suspension:   z.object({
    suspendido: z.boolean(),
    motivo:     opcional(z.string().trim().max(500)),
  }).refine((d) => !d.suspendido || d.motivo, { message: 'Indicá el motivo de la suspensión', path: ['motivo'] }),
  verificacion: z.object({
    verificado: z.boolean(),
    nota:       opcional(z.string().trim().max(500)),
  }),
}
