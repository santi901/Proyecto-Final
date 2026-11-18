import { apiGet, apiPost } from '../auth';

// Flujo de un trabajo del lado del trabajador, contra el backend de Nico
// (`backend/src/routes/trabajos.js`): solicitud → aceptación → PIN → finalización.

// 'cancelado' lo pone el empleador (POST /:id/cancelar) o, automáticamente, el poller de
// reasignación del backend cuando nadie acepta el trabajo después de 3 reintentos.
// 'programado' (Sprint 6) nunca le llega al trabajador como oferta: el backend lo pasa a
// 'pendiente' una hora antes de la fecha y recién ahí aparece. Está en el tipo porque
// el historial es compartido.
export type EstadoTrabajo = 'programado' | 'pendiente' | 'asignado' | 'en_progreso' | 'completado' | 'cancelado';

/** Score del empleador (Sprint 6): arranca en 5 y lo bajan sus cancelaciones. */
export type ReputacionEmpleador = {
  score: number;
  trabajosCompletados: number;
  cancelaciones: number;
  tasaCancelacion: number;
};

export type Trabajo = {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: string;
  nivel_dificultad: string | null;
  precio: number;
  estado: EstadoTrabajo;
  /** Lugar del trabajo: la ubicación del empleador cuando lo publicó. */
  latitud: number;
  longitud: number;
  creado_en: string;
  /** Hasta cuándo se puede aceptar (el backend le da 15 minutos desde que se publica). */
  solicitud_expira_en: string | null;
  iniciado_en: string | null;
  finalizado_en: string | null;
  /** Quién lo canceló, si está cancelado. Solo cuentan para la reputación los del trabajador. */
  cancelado_por?: 'empleado' | 'empleador' | 'sistema' | null;
  /** Solo viene en el detalle (`GET /api/trabajos/:id`): segundos entre el PIN y la finalización. */
  duracionSegundos?: number | null;
  /** Para cuándo está agendado (null = inmediato). */
  fecha_programada?: string | null;
  /** Texto legible del motivo, si está cancelado. */
  motivo_cancelacion?: string | null;
  /** Viene en el listado y en el detalle: el score del empleador que lo publicó. */
  empleador?: { reputacion: ReputacionEmpleador | null };
};

export type MotivoCancelacion = { codigo: string; texto: string };

export type ResultadoCancelar = {
  message: string;
  penalizacion: { peso: number; penaliza: boolean; bloqueadoHasta: string | null };
};

// GET /api/trabajos/motivos-cancelacion — los motivos válidos para el trabajador.
export async function obtenerMotivosCancelacion(): Promise<MotivoCancelacion[]> {
  const { motivos } = await apiGet('/api/trabajos/motivos-cancelacion');
  return motivos;
}

// "jue 13/11 18:30" (hora local del celular).
export function formatearFechaHora(iso: string): string {
  const d = new Date(iso);
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dias[d.getDay()]} ${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** Tiempo para responder una solicitud entrante, salvo que expire antes. */
export const SEGUNDOS_LIMITE_POR_DEFECTO = 30;

export function segundosParaResponder(trabajo: Trabajo): number {
  if (!trabajo.solicitud_expira_en) return SEGUNDOS_LIMITE_POR_DEFECTO;
  const hastaQueExpira = Math.floor((new Date(trabajo.solicitud_expira_en).getTime() - Date.now()) / 1000);
  return Math.max(1, Math.min(SEGUNDOS_LIMITE_POR_DEFECTO, hastaQueExpira));
}

// "45 min", "1 h 20 min".
export function formatearDuracion(segundos: number): string {
  const minutos = Math.max(1, Math.round(segundos / 60));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

// GET /api/trabajos — como empleado, devuelve solo los trabajos en estado 'pendiente'.
export async function listarTrabajos(): Promise<{ trabajos: Trabajo[] }> {
  return apiGet('/api/trabajos');
}

// GET /api/trabajos/mios — los trabajos que este empleado tiene asignados/en curso/completados.
export async function misTrabajosAsignados(): Promise<{ trabajos: Trabajo[] }> {
  return apiGet('/api/trabajos/mios');
}

// GET /api/trabajos/:id
export async function obtenerTrabajo(id: string): Promise<{ trabajo: Trabajo }> {
  return apiGet(`/api/trabajos/${id}`);
}

// POST /api/trabajos/:id/aceptar
export async function aceptarTrabajo(id: string): Promise<{ message: string }> {
  return apiPost(`/api/trabajos/${id}/aceptar`);
}

// POST /api/trabajos/:id/validar-pin — el empleado ingresa el PIN que le dio el
// empleador en persona para pasar el trabajo de 'asignado' a 'en_progreso'.
export async function validarPin(id: string, pin: string): Promise<{ success: boolean; message: string }> {
  return apiPost(`/api/trabajos/${id}/validar-pin`, { pin });
}

// POST /api/trabajos/:id/completar
/**
 * Completar necesita que confirmen **las dos partes**: la primera llamada deja el trabajo
 * en `en_progreso` con `esperandoConfirmacion: true`, y recién la segunda lo pasa a
 * `completado`. Hay que mirar `estado`: que la llamada no falle no significa que cerró.
 */
export type ResultadoCompletar = {
  message: string;
  estado: EstadoTrabajo;
  esperandoConfirmacion?: boolean;
  duracionSegundos?: number | null;
};

/**
 * El trabajador se baja de un trabajo que aceptó. Solo antes de empezarlo (`asignado`), y
 * cuenta para su tasa de cancelación: baja el score de reputación (Sprint 6: con un peso
 * según cuándo cancela, y si cancela mucho queda bloqueado 24 h para aceptar).
 * El motivo es obligatorio; `detalle` también si el motivo es 'otro'.
 */
export async function cancelarTrabajo(id: string, motivo: string, detalle?: string): Promise<ResultadoCancelar> {
  return apiPost(`/api/trabajos/${id}/cancelar`, { motivo, ...(detalle ? { detalle } : {}) });
}

export async function completarTrabajo(id: string): Promise<ResultadoCompletar> {
  return apiPost(`/api/trabajos/${id}/completar`);
}
