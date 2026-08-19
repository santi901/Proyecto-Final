import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// `backend/` es CommonJS, asi que se carga con require.
const require_ = createRequire(import.meta.url);
const { generarPin, hashearPin, validarPin } = require_('../../backend/src/utils/pin.js');

/**
 * El PIN es lo unico que impide que un trabajador marque un trabajo como iniciado
 * sin haber llegado al domicilio. Si el PIN fuera adivinable o si `validarPin`
 * aceptara uno incorrecto, se cae toda la garantia del flujo del Sprint 4.
 */
describe('PIN de verificacion del trabajo', () => {
  it('genera siempre 6 digitos, sin ceros a la izquierda perdidos', () => {
    // 200 tiradas: suficiente para que aparezca el caso de un numero que empieza en 1
    // y para detectar si alguna vez devuelve 5 o 7 caracteres.
    for (let i = 0; i < 200; i++) {
      const pin = generarPin();
      expect(pin).toMatch(/^\d{6}$/);
    }
  });

  it('no devuelve siempre el mismo PIN', () => {
    const generados = new Set(Array.from({ length: 50 }, () => generarPin()));
    // Con 900.000 valores posibles, 50 tiradas repetidas serian un generador roto.
    expect(generados.size).toBeGreaterThan(40);
  });

  it('valida como correcto el PIN que genero el hash', async () => {
    const pin = generarPin();
    const hash = await hashearPin(pin);

    expect(hash).not.toBe(pin); // nunca se guarda en plano
    await expect(validarPin(pin, hash)).resolves.toBe(true);
  });

  it('rechaza un PIN incorrecto', async () => {
    const hash = await hashearPin('123456');

    await expect(validarPin('123457', hash)).resolves.toBe(false);
    await expect(validarPin('', hash)).resolves.toBe(false);
    await expect(validarPin('12345', hash)).resolves.toBe(false);
  });

  it('genera hashes distintos para el mismo PIN', async () => {
    // bcrypt saltea cada hash: dos trabajos con el mismo PIN no deben verse iguales
    // en la base, si no se filtraria informacion comparando filas.
    const [a, b] = await Promise.all([hashearPin('123456'), hashearPin('123456')]);
    expect(a).not.toBe(b);

    await expect(validarPin('123456', a)).resolves.toBe(true);
    await expect(validarPin('123456', b)).resolves.toBe(true);
  });
});
