import { describe, it, expect, beforeAll } from 'vitest';

/**
 * E2E del flujo principal de ChanguitApp, el mismo que arma el Sprint 4:
 *
 *   empleador se registra → publica un trabajo (y recibe el PIN)
 *   → trabajador se registra → ve el trabajo disponible → lo acepta
 *   → ingresa un PIN incorrecto (rechazado) → ingresa el correcto (arranca)
 *   → se completa el trabajo
 *
 * Corre contra el backend levantado de verdad, pegandole por HTTP: no mockea nada.
 * Se apunta con E2E_BASE_URL (por defecto el backend local en el puerto 3000).
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

// Emails unicos por corrida: el test se puede repetir sin chocar con datos viejos.
const marca = `e2e-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const EMPLEADOR = { email: `empleador-${marca}@test.changuitapp`, password: 'test1234' };
const EMPLEADO = { email: `empleado-${marca}@test.changuitapp`, password: 'test1234' };
// El DNI tiene indice unico en la tabla empleados.
const DNI_EMPLEADO = String(Date.now()).slice(-8);
const DNI_EMPLEADOR = String(Date.now() + 1).slice(-8);

type Respuesta = { status: number; body: any };

async function pedir(
  metodo: string,
  ruta: string,
  opciones: { body?: object; token?: string } = {},
): Promise<Respuesta> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opciones.token) headers.Authorization = `Bearer ${opciones.token}`;

  const res = await fetch(`${BASE_URL}${ruta}`, {
    method: metodo,
    headers,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });

  const texto = await res.text();
  let body: any = null;
  try { body = texto ? JSON.parse(texto) : null; } catch { body = texto; }

  return { status: res.status, body };
}

// Estado que se va encadenando entre los pasos del flujo.
let tokenEmpleador = '';
let tokenEmpleado = '';
let trabajoId = '';
let pin = '';

beforeAll(async () => {
  // Si el backend no esta arriba, conviene decirlo claro y no encadenar 8 fallas
  // confusas de "fetch failed".
  try {
    const salud = await pedir('GET', '/health');
    if (salud.status !== 200) {
      throw new Error(`El backend respondio ${salud.status} en /health`);
    }
  } catch (e: any) {
    throw new Error(
      `No se pudo contactar al backend en ${BASE_URL}. ` +
        `Levantalo con "npm run backend" (necesita SUPABASE_URL, SUPABASE_SERVICE_KEY, ` +
        `JWT_SECRET y JWT_REFRESH_SECRET) o apunta E2E_BASE_URL al entorno correcto. ` +
        `Detalle: ${e?.message}`,
    );
  }
});

describe('Flujo completo de un trabajo', () => {
  it('1. el empleador se registra y recibe un token', async () => {
    const r = await pedir('POST', '/api/auth/registrar-empleador', {
      body: {
        ...EMPLEADOR,
        nombre: 'Empleador', apellido: 'E2E',
        fechaNacimiento: '1990-01-01', dni: DNI_EMPLEADOR,
        codigoPostal: '1000', direccion: 'Av. Corrientes 1000, CABA',
      },
    });

    expect(r.status).toBe(201);
    expect(r.body.accessToken).toBeTruthy();
    expect(r.body.usuario.tipo).toBe('empleador');
    tokenEmpleador = r.body.accessToken;
  });

  it('2. publica un trabajo y el backend le devuelve el PIN una sola vez', async () => {
    const r = await pedir('POST', '/api/trabajos', {
      token: tokenEmpleador,
      body: {
        titulo: 'Cortar el pasto (E2E)',
        descripcion: 'Trabajo creado por el test end to end.',
        categoria: 'Jardín',
        nivelDificultad: 'Simple',
        precio: 2500,
      },
    });

    expect(r.status).toBe(201);
    expect(r.body.trabajo.estado).toBe('pendiente');
    expect(r.body.pin).toMatch(/^\d{6}$/);

    trabajoId = r.body.trabajo.id;
    pin = r.body.pin;
  });

  it('3. el trabajo NO expone el PIN al consultarlo', async () => {
    // Si el PIN viajara en el GET, cualquier trabajador podria iniciar el trabajo
    // sin haber ido al domicilio.
    const r = await pedir('GET', `/api/trabajos/${trabajoId}`, { token: tokenEmpleador });

    expect(r.status).toBe(200);

    // Se chequea campo por campo y no buscando el PIN como substring del JSON: los
    // 6 digitos podrian aparecer de casualidad dentro de un id o de los microsegundos
    // de `creado_en`, y el test fallaria sin que haya ninguna filtracion real.
    const campos = Object.keys(r.body.trabajo);
    expect(campos).not.toContain('pin');
    expect(campos).not.toContain('pin_hash');
    expect(r.body.trabajo.pin).toBeUndefined();
  });

  it('4. el trabajador se registra', async () => {
    const r = await pedir('POST', '/api/auth/registrar-empleado', {
      body: {
        ...EMPLEADO,
        nombre: 'Trabajador', apellido: 'E2E',
        fechaNacimiento: '1995-05-05', dni: DNI_EMPLEADO,
        codigoPostal: '1000', direccion: 'Av. Corrientes 2000, CABA',
        radioBusqueda: 25,
      },
    });

    expect(r.status).toBe(201);
    expect(r.body.usuario.tipo).toBe('empleado');
    tokenEmpleado = r.body.accessToken;
  });

  it('5. el trabajador ve el trabajo entre los disponibles', async () => {
    const r = await pedir('GET', '/api/trabajos', { token: tokenEmpleado });

    expect(r.status).toBe(200);
    const ids = (r.body.trabajos ?? []).map((t: any) => t.id);
    expect(ids).toContain(trabajoId);
  });

  it('6. lo acepta y queda asignado', async () => {
    const r = await pedir('POST', `/api/trabajos/${trabajoId}/aceptar`, { token: tokenEmpleado });
    expect(r.status).toBe(200);

    const consulta = await pedir('GET', `/api/trabajos/${trabajoId}`, { token: tokenEmpleado });
    expect(consulta.body.trabajo.estado).toBe('asignado');
  });

  it('7. un PIN incorrecto es rechazado y el trabajo no arranca', async () => {
    const incorrecto = pin === '000000' ? '111111' : '000000';
    const r = await pedir('POST', `/api/trabajos/${trabajoId}/validar-pin`, {
      token: tokenEmpleado,
      body: { pin: incorrecto },
    });

    expect(r.status).toBe(401);

    const consulta = await pedir('GET', `/api/trabajos/${trabajoId}`, { token: tokenEmpleado });
    expect(consulta.body.trabajo.estado).toBe('asignado'); // sigue sin arrancar
  });

  it('8. el PIN correcto pone el trabajo en progreso', async () => {
    const r = await pedir('POST', `/api/trabajos/${trabajoId}/validar-pin`, {
      token: tokenEmpleado,
      body: { pin },
    });

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);

    const consulta = await pedir('GET', `/api/trabajos/${trabajoId}`, { token: tokenEmpleado });
    expect(consulta.body.trabajo.estado).toBe('en_progreso');
  });

  it('9. se completa el trabajo', async () => {
    const r = await pedir('POST', `/api/trabajos/${trabajoId}/completar`, { token: tokenEmpleado });
    expect(r.status).toBe(200);

    const consulta = await pedir('GET', `/api/trabajos/${trabajoId}`, { token: tokenEmpleado });
    expect(consulta.body.trabajo.estado).toBe('completado');
  });
});

describe('Seguridad del flujo', () => {
  it('sin token no se puede listar trabajos', async () => {
    const r = await pedir('GET', '/api/trabajos');
    expect([401, 403]).toContain(r.status);
  });

  it('un empleador no puede aceptar un trabajo', async () => {
    // La ruta de aceptar es `soloEmpleado`.
    const r = await pedir('POST', `/api/trabajos/${trabajoId}/aceptar`, { token: tokenEmpleador });
    expect([403, 409]).toContain(r.status);
  });

  it('el login devuelve credenciales invalidas con la password equivocada', async () => {
    const r = await pedir('POST', '/api/auth/login', {
      body: { email: EMPLEADO.email, password: 'passwordIncorrecta' },
    });
    expect(r.status).toBe(401);
  });
});
