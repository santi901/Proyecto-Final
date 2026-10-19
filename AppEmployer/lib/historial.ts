import { apiGet } from '../auth';
import type { EstadoTrabajo } from './trabajos';

// Historial de trabajos (Sprint 5, `GET /api/trabajos/historial`). Para el trabajador son
// los trabajos que tomó; para el empleador, los que publicó. La "ganancia" es el precio
// de los completados (lo que cobró el trabajador / lo que pagó el empleador); los
// cancelados y los que siguen abiertos van con 0.

export type TrabajoHistorial = {
  id: string;
  titulo: string;
  categoria: string;
  estado: EstadoTrabajo;
  precio: number;
  /** Fin, cancelación o creación (lo que corresponda): la fecha a mostrar. */
  fecha: string;
  creado_en: string;
  iniciado_en: string | null;
  finalizado_en: string | null;
  cancelado_por: 'empleado' | 'empleador' | 'sistema' | null;
  duracionSegundos: number | null;
  ganancia: number;
  calificacion: { puntaje: number; comentario: string | null } | null;
};

export type ResumenHistorial = {
  total: number;
  completados: number;
  cancelados: number;
  enCurso: number;
  gananciaTotal: number;
  gananciaMes: number;
  duracionTotalSegundos: number;
};

export async function obtenerHistorial(): Promise<{ trabajos: TrabajoHistorial[]; resumen: ResumenHistorial }> {
  return apiGet('/api/trabajos/historial');
}

// "$ 12.500"
export function formatearMonto(n: number): string {
  return `$ ${Math.round(n).toLocaleString('es-AR')}`;
}

// "18/10/2026"
export function formatearFecha(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
