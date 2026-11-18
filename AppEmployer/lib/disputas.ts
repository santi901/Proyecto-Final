import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAutenticado } from '../auth';
import { adjuntarImagen } from './archivos';

// Sistema de disputas (Sprint 6): "Reportar problema" sobre un trabajo, con motivo,
// descripción y una foto opcional. La misma lógica en las dos apps.
//
// Contrato propuesto para el backend (todavía NO existe, lo tiene que hacer Nico):
//   POST {API_URL}/api/trabajos/:id/disputas   (multipart, con token)
//     campos: motivo (uno de MOTIVOS_DISPUTA), descripcion (texto, máx. 1000), foto (opcional, jpg/png)
//     respuesta 201: { disputa: { id, estado: 'abierta', creado_en } }
// Lo puede abrir cualquiera de las dos partes del trabajo (mismo chequeo que el chat:
// esParticipanteTrabajo).
//
// Mientras el endpoint no exista (404), el reporte queda guardado en el dispositivo como
// "pendiente de envío" y se reintenta solo la próxima vez que se abre un reporte.

export const MOTIVOS_DISPUTA = [
  'El trabajo no se hizo o quedó incompleto',
  'Problema con el pago',
  'La otra persona no se presentó',
  'Daños o problemas de seguridad',
  'Trato inadecuado',
  'Otro',
] as const;

export type MotivoDisputa = typeof MOTIVOS_DISPUTA[number];

export type ReporteProblema = {
  trabajoId: string;
  motivo: MotivoDisputa;
  descripcion: string;
  fotoUri: string | null;
};

export type ReporteGuardado = ReporteProblema & {
  creadoEn: string;
  estado: 'enviado' | 'pendiente_envio';
};

const CLAVE_REPORTES = 'cg_reportes_problema';

async function leerReportes(): Promise<ReporteGuardado[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(CLAVE_REPORTES)) ?? '[]');
  } catch {
    return [];
  }
}

async function guardarReportes(lista: ReporteGuardado[]) {
  await AsyncStorage.setItem(CLAVE_REPORTES, JSON.stringify(lista));
}

/** Los reportes hechos desde este dispositivo para un trabajo, el más nuevo primero. */
export async function reportesDelTrabajo(trabajoId: string): Promise<ReporteGuardado[]> {
  return (await leerReportes()).filter(r => r.trabajoId === trabajoId).reverse();
}

// Manda un reporte. Devuelve true si llegó al backend, false si quedó guardado para después.
async function enviar(reporte: ReporteProblema): Promise<boolean> {
  const form = new FormData();
  form.append('motivo', reporte.motivo);
  form.append('descripcion', reporte.descripcion);
  if (reporte.fotoUri) await adjuntarImagen(form, 'foto', reporte.fotoUri, 'reporte.jpg');

  const res = await fetchAutenticado(`/api/trabajos/${reporte.trabajoId}/disputas`, {
    method: 'POST',
    body: form,
  }, 30_000);

  // 404 = el backend todavía no tiene la ruta. Cualquier otro error sí se muestra.
  if (res.status === 404) return false;
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'No pudimos enviar el reporte.');
  }
  return true;
}

export async function reportarProblema(reporte: ReporteProblema): Promise<{ enviado: boolean }> {
  if (!reporte.descripcion.trim()) throw new Error('Contanos qué pasó.');

  let enviado = false;
  try {
    enviado = await enviar(reporte);
  } catch (e: any) {
    // Sin conexión también se guarda; un error del backend (400, 403) se informa.
    if (e?.name !== 'AbortError' && !/network|timed out|tiempo/i.test(e?.message ?? '')) throw e;
  }

  const lista = await leerReportes();
  lista.push({ ...reporte, creadoEn: new Date().toISOString(), estado: enviado ? 'enviado' : 'pendiente_envio' });
  await guardarReportes(lista);
  return { enviado };
}

/** Reintenta mandar los reportes que quedaron guardados. Nunca tira error. */
export async function reintentarReportesPendientes(): Promise<void> {
  const lista = await leerReportes();
  let cambio = false;
  for (const r of lista) {
    if (r.estado !== 'pendiente_envio') continue;
    try {
      if (await enviar(r)) { r.estado = 'enviado'; cambio = true; }
      else break; // sigue sin existir el endpoint: no tiene sentido probar los demás
    } catch {
      break;
    }
  }
  if (cambio) await guardarReportes(lista);
}
