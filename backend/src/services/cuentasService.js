const supabase = require('../config/supabase')

// Estado de la cuenta de un usuario (suspensión manual desde el panel de admin).
//
// Las columnas `usuarios.suspendido*` se agregaron a mano en Supabase (ver "Schema" en backend/CLAUDE.md).
// Si en una base las columnas no existen, todo esto se comporta como "nadie está
// suspendido" en vez de romper el login o el matching: se avisa una vez por consola.

// Errores de PostgREST/Postgres cuando una columna no existe.
const CODIGOS_COLUMNA_INEXISTENTE = ['42703', 'PGRST204']

function faltaMigracion(error) {
  return CODIGOS_COLUMNA_INEXISTENTE.includes(error?.code)
}

let avisoMostrado = false
function avisarFaltaMigracion(error) {
  if (avisoMostrado) return
  avisoMostrado = true
  console.error(`Falta la columna usuarios.suspendido en Supabase (${error.message}): la suspensión de cuentas queda desactivada.`)
}

// { suspendido, motivo } — ante cualquier error de lectura, la cuenta se considera activa
// (no se le corta el acceso a nadie por una falla de la base).
async function estadoCuenta(usuarioId) {
  const { data, error } = await supabase
    .from('usuarios').select('suspendido, suspendido_motivo').eq('id', usuarioId).maybeSingle()

  if (error) {
    if (faltaMigracion(error)) avisarFaltaMigracion(error)
    else console.error(`Error leyendo el estado de la cuenta (usuarioId=${usuarioId}): ${error.message ?? error}`)
    return { suspendido: false, motivo: null }
  }
  return { suspendido: data?.suspendido === true, motivo: data?.suspendido_motivo ?? null }
}

// Set con los usuarios.id suspendidos entre los pasados (para sacarlos del matching).
async function idsSuspendidos(usuarioIds) {
  if (!usuarioIds.length) return new Set()

  const { data, error } = await supabase
    .from('usuarios').select('id').in('id', usuarioIds).eq('suspendido', true)

  if (error) {
    if (faltaMigracion(error)) avisarFaltaMigracion(error)
    else console.error(`Error buscando cuentas suspendidas: ${error.message ?? error}`)
    return new Set()
  }
  return new Set(data.map((u) => u.id))
}

function mensajeSuspension(motivo) {
  return motivo
    ? `Tu cuenta está suspendida: ${motivo}. Escribinos si creés que es un error.`
    : 'Tu cuenta está suspendida. Escribinos si creés que es un error.'
}

module.exports = { estadoCuenta, idsSuspendidos, mensajeSuspension, faltaMigracion }
