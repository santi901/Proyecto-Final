// Sin esto, si el backend no responde (caído, DB pausada, red mala), fetch() se
// cuelga indefinidamente y la UI queda con el spinner infinito en vez de mostrar un error.
const TIMEOUT_MS = 15000;

export async function fetchConTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e: any) {
    if (e.name === 'AbortError') {
      throw new Error('El servidor no respondió a tiempo. Revisá tu conexión e intentá de nuevo.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
