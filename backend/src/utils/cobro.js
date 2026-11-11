// Datos de cobro del trabajador: adonde se le transfieren las liquidaciones.
//
// CBU y CVU tienen el mismo formato (BCRA): 22 dígitos en dos bloques, cada uno
// terminado en un dígito verificador.
//   bloque 1 (8 dígitos):  entidad (3) + sucursal (4) + verificador
//   bloque 2 (14 dígitos): número de cuenta (13) + verificador
// El CVU (billeteras virtuales: Mercado Pago, Ualá, etc.) usa "000" como entidad.
// El alias son 6 a 20 caracteres: letras, números, punto y guion.
//
// Con el verificador se detecta un CBU mal copiado (un dígito cambiado o dos
// dígitos vecinos invertidos) antes de que el admin intente transferirle.

const PESOS_BLOQUE_1 = [7, 1, 3, 9, 7, 1, 3]
const PESOS_BLOQUE_2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]

function digitoVerificador(digitos, pesos) {
  const suma = pesos.reduce((total, peso, i) => total + Number(digitos[i]) * peso, 0)
  return (10 - (suma % 10)) % 10
}

function claveBancariaValida(valor) {
  if (!/^\d{22}$/.test(valor)) return false
  return digitoVerificador(valor.slice(0, 7), PESOS_BLOQUE_1) === Number(valor[7])
    && digitoVerificador(valor.slice(8, 21), PESOS_BLOQUE_2) === Number(valor[21])
}

// Devuelve { tipo: 'cbu' | 'cvu' | 'alias', valor } o { error } con un mensaje para el usuario.
function analizarDatoCobro(entrada) {
  const valor = String(entrada ?? '').trim()

  // Solo números: tiene que ser un CBU/CVU completo. Un alias de puros números
  // casi siempre es un CBU copiado a medias.
  if (/^\d+$/.test(valor)) {
    if (valor.length !== 22) return { error: `Un CBU/CVU tiene 22 dígitos (ingresaste ${valor.length})` }
    if (!claveBancariaValida(valor)) return { error: 'El CBU/CVU no es válido, revisá que esté bien copiado' }
    return { tipo: valor.startsWith('000') ? 'cvu' : 'cbu', valor }
  }

  if (!/^[a-zA-Z0-9.-]{6,20}$/.test(valor)) {
    return { error: 'El alias tiene que tener entre 6 y 20 caracteres: letras, números, punto o guion' }
  }
  return { tipo: 'alias', valor }
}

module.exports = { analizarDatoCobro, claveBancariaValida }
