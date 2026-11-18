// Sprint 6 — cálculo de precio de un trabajo.
//
// El precio ya no lo elige la app: lo calcula el backend como
//
//     precio = redondearA100( PRECIO_BASE[categoria] × MULTIPLICADOR[dificultad] )
//
// Es una función pura (sin base de datos) para que sea fácil de testear y de
// explicar, y porque el tarifario es chico y cambia poco: vive en código, no en
// una tabla. Si algún día tiene que editarlo alguien que no programa, se mueve a
// una tabla `tarifas` y esta función pasa a leerla — la firma no cambia.
//
// La app pide la cotización ANTES de publicar (GET /api/trabajos/cotizar) para
// mostrarla, y al publicar manda el precio que mostró: si no coincide con el que
// calcula el backend en ese momento (cambió el tarifario en el medio), se rechaza
// con 409 para que el empleador vea y confirme el precio nuevo.

const MONEDA = 'ARS'

// Precio de un trabajo "Simple" de cada categoría, en pesos.
const PRECIO_BASE = {
  'Limpieza': 3000,
  'Mudanza':  6000,
  'Jardín':   3500,
  'Pintura':  4500,
  'Plomería': 5000,
  'Otros':    3000,
}

const MULTIPLICADOR_DIFICULTAD = {
  'Simple':     1,
  'Intermedio': 1.6,
  'Complejo':   2.5,
}

const CATEGORIAS  = Object.keys(PRECIO_BASE)
const DIFICULTADES = Object.keys(MULTIPLICADOR_DIFICULTAD)

// Redondeo a la centena: los precios "$ 7.840" se leen raro; "$ 7.800" no.
function redondearA100(n) {
  return Math.round(n / 100) * 100
}

// Devuelve { precio, moneda, desglose } o tira { status: 400, message } si la
// categoría o la dificultad no existen.
function calcularPrecio(categoria, nivelDificultad) {
  if (!Object.hasOwn(PRECIO_BASE, categoria)) {
    throw { status: 400, message: `Categoría inválida. Opciones: ${CATEGORIAS.join(', ')}` }
  }
  if (!Object.hasOwn(MULTIPLICADOR_DIFICULTAD, nivelDificultad)) {
    throw { status: 400, message: `Dificultad inválida. Opciones: ${DIFICULTADES.join(', ')}` }
  }

  const base          = PRECIO_BASE[categoria]
  const multiplicador = MULTIPLICADOR_DIFICULTAD[nivelDificultad]

  return {
    precio: redondearA100(base * multiplicador),
    moneda: MONEDA,
    desglose: { categoria, nivelDificultad, base, multiplicador },
  }
}

// Todo el tarifario, para que la app arme los selectores sin hardcodear listas.
function obtenerTarifario() {
  return {
    moneda: MONEDA,
    categorias:   CATEGORIAS.map(nombre => ({ nombre, base: PRECIO_BASE[nombre] })),
    dificultades: DIFICULTADES.map(nombre => ({ nombre, multiplicador: MULTIPLICADOR_DIFICULTAD[nombre] })),
  }
}

module.exports = {
  calcularPrecio, obtenerTarifario, redondearA100,
  PRECIO_BASE, MULTIPLICADOR_DIFICULTAD, CATEGORIAS, DIFICULTADES,
}
