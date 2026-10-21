import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { apiGet, apiPost } from '../auth';
import type { EstadoTrabajo } from './trabajos';

// Cobro con MercadoPago (Checkout Pro), contra el backend de Nico
// (`backend/src/services/pagosService.js`). Al publicar, el trabajo queda en
// 'pago_pendiente' y recién se publica cuando MP acredita el pago. La plata queda
// retenida por la plataforma hasta que el trabajo se completa (se le transfiere al
// trabajador, menos la comisión) o se cancela (se devuelve todo o parte).

export type EstadoPago =
  | 'pendiente'           // todavía no pagó
  | 'aprobado'            // pagado y retenido hasta que termine el trabajo
  | 'liberado'            // trabajo completado: la plata pasó al trabajador
  | 'reembolsado'
  | 'reembolsado_parcial'
  | 'reembolso_fallido'   // el backend lo reintenta solo
  | 'cancelado'           // se canceló antes de pagar
  | 'monto_invalido';

export type InfoPago = {
  estado: EstadoPago;
  monto: number;
  montoReembolsado: number | null;
  /** Solo mientras `estado === 'pendiente'`: el link para (re)abrir el checkout. */
  checkoutUrl: string | null;
  /**
   * Modo demo del backend (sin credenciales de MP): no hay checkout real, se paga desde
   * la pantalla /checkout de la app, que llama a simularPago.
   */
  simulado: boolean;
};

// GET /api/trabajos/:id/pago — si el pago sigue pendiente, el backend le pregunta a MP
// antes de responder. Por eso esto alcanza para enterarse del pago aunque el webhook
// de MP no llegue (en desarrollo local nunca llega: MP no ve `localhost`).
export async function obtenerEstadoPago(
  trabajoId: string,
): Promise<{ pago: InfoPago; estadoTrabajo: EstadoTrabajo }> {
  return apiGet(`/api/trabajos/${trabajoId}/pago`);
}

// POST /api/trabajos/:id/pago/simular — solo en modo simulado. Aprueba el pago como si lo
// hubiera confirmado MP: el trabajo se publica igual que con un pago real.
export async function simularPago(
  trabajoId: string,
): Promise<{ pago: InfoPago; estadoTrabajo: EstadoTrabajo }> {
  return apiPost(`/api/trabajos/${trabajoId}/pago/simular`);
}

// Abre el checkout de MP en el navegador del sistema. Se cierra solo cuando MP vuelve
// a `appemployer://pago` (build instalada); en Expo Go o web el usuario lo cierra a mano.
// En cualquier caso, lo que vale es consultar obtenerEstadoPago después, no lo que
// devuelva el navegador.
export async function abrirCheckout(checkoutUrl: string): Promise<void> {
  await WebBrowser.openAuthSessionAsync(checkoutUrl, Linking.createURL('pago'));
}
