import { apiGet, apiPost } from '../auth';

// Chat de un trabajo entre el trabajador y el empleador (backend de Nico,
// `backend/src/controllers/mensajesController.js`). Solo se puede escribir mientras el
// trabajo está `en_progreso`; antes y después se puede leer el historial.

export type Mensaje = {
  id: string;
  remitente_id: string;
  remitente_tipo: 'empleado' | 'empleador';
  mensaje: string;
  enviado_en: string;
};

// GET /api/trabajos/:id/mensajes — del más viejo al más nuevo.
export async function listarMensajes(trabajoId: string): Promise<{ mensajes: Mensaje[] }> {
  return apiGet(`/api/trabajos/${trabajoId}/mensajes`);
}

// POST /api/trabajos/:id/mensajes
export async function enviarMensaje(trabajoId: string, mensaje: string): Promise<{ mensaje: Mensaje }> {
  return apiPost(`/api/trabajos/${trabajoId}/mensajes`, { mensaje });
}
