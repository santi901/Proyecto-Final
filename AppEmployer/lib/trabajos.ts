import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiGet, apiPost } from '../auth';

// Flujo de un trabajo del lado del empleador, contra el backend de Nico
// (`backend/src/routes/trabajos.js`): publicación → PIN → seguimiento → finalización.

// 'cancelado' lo pone el empleador (POST /:id/cancelar) o, automáticamente, el poller de
// reasignación del backend cuando nadie acepta el trabajo después de 3 reintentos.
// 'pago_pendiente': recién creado, todavía no se acreditó el pago en MercadoPago. No se
// publica (nadie lo ve ni se notifica) hasta que pasa a 'pendiente'. Ver lib/pagos.ts.
export type EstadoTrabajo = 'pago_pendiente' | 'pendiente' | 'asignado' | 'en_progreso' | 'completado' | 'cancelado';

export type Trabajo = {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: string;
  nivel_dificultad: string | null;
  /** Lo que paga el empleador. Lo calcula el backend (ver cotizarTrabajo). */
  precio: number;
  comision_porcentaje: number | null;
  comision_monto: number | null;
  /** Lo que recibe el trabajador: precio - comisión. */
  monto_trabajador: number | null;
  estado: EstadoTrabajo;
  latitud: number;
  longitud: number;
  creado_en: string;
  /** Hasta cuándo un trabajador puede aceptarlo (15 minutos desde que se publica). */
  solicitud_expira_en: string | null;
  iniciado_en: string | null;
  finalizado_en: string | null;
  /** Solo viene en el detalle (`GET /api/trabajos/:id`). */
  duracionSegundos?: number | null;
};

export type Cotizacion = {
  precio: number;
  comisionPorcentaje: number;
  comisionMonto: number;
  montoTrabajador: number;
  desglose: {
    base: number;
    multiplicadorDificultad: number;
    /** > 1 cuando hay más trabajos esperando que trabajadores libres en la zona. */
    multiplicadorDemanda: number;
    /** 1.2 de noche (22 a 7 hs) o los domingos. */
    multiplicadorHorario: number;
  };
};

// POST /api/trabajos/cotizar — el precio lo calcula el backend (categoría, dificultad,
// demanda en la zona y horario). El token dura 10 minutos y es lo que hay que mandar
// al crear el trabajo: así se cobra exactamente el precio que se mostró.
export async function cotizarTrabajo(datos: {
  categoria: string;
  nivelDificultad: string;
  latitud: number;
  longitud: number;
}): Promise<{ cotizacion: Cotizacion; cotizacionToken: string; validaHasta: string }> {
  return apiPost('/api/trabajos/cotizar', datos);
}

/** True si la cotización ya venció o está por vencer (con 30s de margen para el request). */
export function cotizacionVencida(validaHasta: string): boolean {
  return new Date(validaHasta).getTime() - 30_000 < Date.now();
}

// POST /api/trabajos — el PIN devuelto solo viaja en esta respuesta, no se puede
// volver a consultar después: hay que mostrárselo al empleador en el momento.
// Categoría, dificultad, ubicación y precio salen de la cotización. El trabajo nace en
// 'pago_pendiente': hay que abrir `pago.checkoutUrl` para pagarlo (lib/pagos.ts).
export async function crearTrabajo(datos: {
  titulo: string;
  descripcion: string;
  cotizacionToken: string;
}): Promise<{
  trabajo: Trabajo;
  pin: string;
  /** `simulado`: no hay checkout real (checkoutUrl null); se paga desde la pantalla /checkout. */
  pago: { estado: string; monto: number; checkoutUrl: string | null; simulado: boolean };
}> {
  return apiPost('/api/trabajos', datos);
}

// GET /api/trabajos/mios — los trabajos que publicó este empleador, en cualquier estado.
export async function misTrabajosPublicados(): Promise<{ trabajos: Trabajo[] }> {
  return apiGet('/api/trabajos/mios');
}

// GET /api/trabajos/:id
export async function obtenerTrabajo(id: string): Promise<{ trabajo: Trabajo }> {
  return apiGet(`/api/trabajos/${id}`);
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

export async function completarTrabajo(id: string): Promise<ResultadoCompletar> {
  return apiPost(`/api/trabajos/${id}/completar`);
}

export type ResultadoCancelar = {
  /** Texto listo para mostrar, con lo que se devolvió. */
  message: string;
  reembolso: {
    porcentaje: number;
    monto: number;
    /** 'pendiente' = MP no respondió; el backend lo reintenta solo. */
    estado: 'sin_pago' | 'procesado' | 'pendiente';
  };
};

/**
 * Cancela un trabajo `pago_pendiente`, `pendiente` o `asignado`. Solo el empleador dueño.
 * Reembolso: 100% si nadie lo aceptó o si el trabajador lo aceptó hace menos de 1:30 min;
 * pasado eso, 80% (el 20% compensa al trabajador que ya estaba en camino).
 */
export async function cancelarTrabajo(id: string, motivo?: string): Promise<ResultadoCancelar> {
  return apiPost(`/api/trabajos/${id}/cancelar`, motivo ? { motivo } : {});
}

// El PIN solo viaja una vez en la respuesta de crearTrabajo (el backend guarda el hash,
// no el texto plano) — se guarda localmente en el dispositivo para poder mostrarlo de nuevo.
const PIN_KEY_PREFIX = 'cg_pin_trabajo_';

export async function guardarPinLocal(trabajoId: string, pin: string) {
  await AsyncStorage.setItem(PIN_KEY_PREFIX + trabajoId, pin);
}

export async function obtenerPinLocal(trabajoId: string): Promise<string | null> {
  return AsyncStorage.getItem(PIN_KEY_PREFIX + trabajoId);
}

// POST /api/trabajos/:id/calificar — el empleador califica al trabajador (1 a 5) cuando el
// trabajo ya está completado. El backend de Nico se la pasa al de Nacho, que recalcula la
// reputación del trabajador (con eso el matching ordena a los candidatos).
export async function calificarTrabajo(id: string, puntaje: number, comentario?: string): Promise<{ message: string }> {
  return apiPost(`/api/trabajos/${id}/calificar`, { puntaje, ...(comentario ? { comentario } : {}) });
}

// El backend no expone si un trabajo ya se calificó: se recuerda en el dispositivo para no
// volver a pedir la calificación.
const CALIFICADO_KEY_PREFIX = 'cg_calificado_trabajo_';

export async function marcarCalificadoLocal(trabajoId: string) {
  await AsyncStorage.setItem(CALIFICADO_KEY_PREFIX + trabajoId, '1');
}

export async function yaCalificadoLocal(trabajoId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(CALIFICADO_KEY_PREFIX + trabajoId)) === '1';
}

// "45 min", "1 h 20 min".
export function formatearDuracion(segundos: number): string {
  const minutos = Math.max(1, Math.round(segundos / 60));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}
