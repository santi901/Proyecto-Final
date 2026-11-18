const supabase = require('../config/supabase')
const { estadoAlPublicar } = require('../utils/programacion')
const { activarTrabajo } = require('../jobs/activarProgramados')

// API de trabajos programados (fecha y hora futura elegida por el empleador).
//
// La fecha se recibe al cotizar/crear el trabajo (POST /api/trabajos/cotizar y
// POST /api/trabajos { ..., programadoPara }) y se guarda en trabajos.programado_para.
// Acá están la consulta y la reprogramación. La activación cuando llega la fecha
// (Sprint 6) está en jobs/activarProgramados.js: pagado y lejos de la fecha, el trabajo
// espera en 'programado'; una hora antes pasa a 'pendiente' y se publica.

const CAMPOS_PROGRAMADO = 'id, titulo, descripcion, categoria, nivel_dificultad, precio, monto_trabajador, estado, latitud, longitud, creado_en, solicitud_expira_en, programado_para, trabajador_id, empleador_id'

// Hasta que alguien lo acepta, el empleador puede cambiar la fecha: después ya
// hay un trabajador que se comprometió a ese horario.
const ESTADOS_REPROGRAMABLES = ['pago_pendiente', 'programado', 'pendiente']
const ESTADOS_FINALIZADOS = ['completado', 'cancelado']

// GET /api/trabajos/programados[?incluirFinalizados=true]
//   empleador → { trabajos }: los programados que publicó, por fecha ascendente
//   empleado  → { trabajos, disponibles }: los programados que tiene asignados, y los
//               programados publicados que todavía puede aceptar
async function listarProgramados(req, res) {
  const { id: usuarioId, tipo } = req.usuario
  const incluirFinalizados = req.query.incluirFinalizados === 'true'

  const tabla   = tipo === 'empleado' ? 'empleados' : 'perfiles'
  const columna = tipo === 'empleado' ? 'trabajador_id' : 'empleador_id'

  const { data: perfil } = await supabase.from(tabla).select('id').eq('user_id', usuarioId).maybeSingle()
  if (!perfil) return res.status(404).json({ error: 'Perfil no encontrado' })

  let consulta = supabase
    .from('trabajos').select(CAMPOS_PROGRAMADO)
    .eq(columna, perfil.id)
    .not('programado_para', 'is', null)
    .order('programado_para', { ascending: true })
  if (!incluirFinalizados) consulta = consulta.not('estado', 'in', `(${ESTADOS_FINALIZADOS.join(',')})`)

  const { data: trabajos, error } = await consulta
  if (error) {
    console.error(`Error listando trabajos programados (${columna}=${perfil.id}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error listando trabajos programados' })
  }

  if (tipo !== 'empleado') return res.json({ trabajos })

  // Mismo criterio que GET /api/trabajos para el empleado: 'pendiente' con la solicitud vigente.
  const { data: disponibles, error: errorDisponibles } = await supabase
    .from('trabajos').select(CAMPOS_PROGRAMADO)
    .eq('estado', 'pendiente')
    .gt('solicitud_expira_en', new Date().toISOString())
    .not('programado_para', 'is', null)
    .order('programado_para', { ascending: true })

  if (errorDisponibles) {
    console.error(`Error listando trabajos programados disponibles: ${errorDisponibles.message ?? errorDisponibles}`)
    return res.status(500).json({ error: 'Error listando trabajos programados' })
  }

  res.json({ trabajos, disponibles })
}

// PUT /api/trabajos/:id/programacion { programadoPara } — el empleador dueño cambia la
// fecha (o la saca, con null: pasa a ser "lo antes posible") mientras nadie lo aceptó.
async function reprogramarTrabajo(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId } = req.usuario
  const { programadoPara } = req.body

  const { data: perfil } = await supabase
    .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()

  const { data: trabajo } = await supabase
    .from('trabajos').select('id, estado, empleador_id').eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })
  if (!perfil || trabajo.empleador_id !== perfil.id) {
    console.error(`Reprogramación rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no es el empleador dueño del trabajo.`)
    return res.status(403).json({ error: 'No sos el empleador de este trabajo' })
  }
  if (!ESTADOS_REPROGRAMABLES.includes(trabajo.estado)) {
    console.error(`Reprogramación rechazada (trabajoId=${trabajoId}): estado actual '${trabajo.estado}'.`)
    return res.status(409).json({ error: 'Solo se puede cambiar la fecha antes de que alguien acepte el trabajo' })
  }

  // Sprint 6: si ya está pagado, la fecha nueva decide si se publica ya o espera.
  //   pendiente (publicado) → fecha lejana: se retira hasta su hora ('programado').
  //   programado (esperando) → fecha cercana o sin fecha: se publica ya (abajo).
  // pago_pendiente no cambia: lo decide el pago cuando se acredite.
  const cambios = { programado_para: programadoPara }
  if (trabajo.estado === 'pendiente' && estadoAlPublicar(programadoPara) === 'programado') cambios.estado = 'programado'

  // Condicional: si alguien lo aceptó entre la lectura y acá, no se le cambia el horario.
  const actualizar = () => supabase
    .from('trabajos')
    .update(cambios)
    .eq('id', trabajoId)
    .eq('estado', trabajo.estado)
    .select(CAMPOS_PROGRAMADO)

  let { data: actualizados, error } = await actualizar()
  // 23514: la base todavía no acepta 'programado' (falta la migración del Sprint 6):
  // se cambia solo la fecha, como antes.
  if (error?.code === '23514' && cambios.estado) {
    delete cambios.estado;
    ({ data: actualizados, error } = await actualizar())
  }

  if (error) {
    console.error(`Error reprogramando trabajo (trabajoId=${trabajoId}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'No se pudo cambiar la fecha del trabajo' })
  }
  if (!actualizados?.length) {
    console.error(`Reprogramación rechazada (trabajoId=${trabajoId}): el estado cambió mientras se reprogramaba.`)
    return res.status(409).json({ error: 'El trabajo cambió de estado, actualizá y probá de nuevo' })
  }

  let actualizado = actualizados[0]
  if (actualizado.estado === 'programado' && estadoAlPublicar(programadoPara) === 'pendiente') {
    await activarTrabajo(actualizado, new Date())
    const { data } = await supabase.from('trabajos').select(CAMPOS_PROGRAMADO).eq('id', trabajoId).maybeSingle()
    actualizado = data ?? actualizado
  }

  res.json({ trabajo: actualizado })
}

module.exports = { listarProgramados, reprogramarTrabajo }
