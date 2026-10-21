const { z } = require('zod')
const { CATEGORIAS, DIFICULTADES } = require('../services/preciosService')

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

// CBU/CVU: 22 dígitos. Alias de MP/bancos: 6 a 20 caracteres, letras, números, punto y guion.
const aliasCobro = z.string().trim().regex(
  /^(\d{22}|[a-zA-Z0-9.-]{6,20})$/,
  'Tiene que ser un CBU/CVU de 22 dígitos o un alias de 6 a 20 caracteres',
)

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

  // trabajos
  cotizar: z.object({
    categoria,
    nivelDificultad: z.enum(DIFICULTADES),
    latitud,
    longitud,
  }),
  crearTrabajo: z.object({
    titulo:          texto(100),
    descripcion:     texto(1000),
    cotizacionToken: z.string().min(1).max(4000),
  }),
  validarPin:  z.object({ pin: z.coerce.string().regex(/^\d{6}$/, 'El PIN tiene 6 dígitos') }),
  cancelar:    z.object({ motivo: opcional(z.string().trim().max(500)) }),
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
}
