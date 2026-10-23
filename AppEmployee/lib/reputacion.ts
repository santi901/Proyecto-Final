import { apiGet } from '../auth';

// Reputación de un trabajador (Sprint 5, `backend/src/services/reputacionService.js`).
//
// - `promedio`: promedio simple de las estrellas recibidas (null si nunca lo calificaron).
// - `score`: el número con el que el matching ordena a los candidatos. Pondera la
//   antigüedad de cada calificación, la cantidad de trabajos calificados (con pocos,
//   queda cerca de 3) y la tasa de cancelación del propio trabajador.

export type CalificacionRecibida = {
  puntaje: number;
  comentario: string | null;
  creado_en: string;
};

export type Reputacion = {
  promedio: number | null;
  score: number;
  cantidadCalificaciones: number;
  trabajosCompletados: number;
  cancelaciones: number;
  /** De 0 a 1. */
  tasaCancelacion: number;
  ultimasCalificaciones?: CalificacionRecibida[];
};

// GET /api/empleados/:id/reputacion — `id` es el de la tabla empleados.
export async function obtenerReputacionEmpleado(empleadoId: string): Promise<Reputacion> {
  const data = await apiGet(`/api/empleados/${empleadoId}/reputacion`);
  return data.reputacion;
}

// "4,7" — con coma decimal, como se escribe en Argentina.
export function formatearPuntaje(n: number | null | undefined): string {
  if (n == null) return '–';
  return n.toFixed(1).replace('.', ',');
}
