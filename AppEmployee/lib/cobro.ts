// Validación del CBU/CVU/alias de cobro, la misma que hace el backend
// (`backend/src/utils/cobro.js`): así el error aparece al tipear y no al guardar.
//
// CBU y CVU: 22 dígitos en dos bloques, cada uno con su dígito verificador.
// El CVU (Mercado Pago, Ualá, etc.) empieza con "000". Alias: 6 a 20 caracteres.

export type DatoCobro =
  | { tipo: 'cbu' | 'cvu' | 'alias'; valor: string; error?: undefined }
  | { error: string; tipo?: undefined; valor?: undefined };

const PESOS_BLOQUE_1 = [7, 1, 3, 9, 7, 1, 3];
const PESOS_BLOQUE_2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];

function digitoVerificador(digitos: string, pesos: number[]): number {
  const suma = pesos.reduce((total, peso, i) => total + Number(digitos[i]) * peso, 0);
  return (10 - (suma % 10)) % 10;
}

function claveBancariaValida(valor: string): boolean {
  return /^\d{22}$/.test(valor)
    && digitoVerificador(valor.slice(0, 7), PESOS_BLOQUE_1) === Number(valor[7])
    && digitoVerificador(valor.slice(8, 21), PESOS_BLOQUE_2) === Number(valor[21]);
}

export function analizarDatoCobro(entrada: string): DatoCobro {
  const valor = entrada.trim();

  if (/^\d+$/.test(valor)) {
    if (valor.length !== 22) return { error: `Un CBU/CVU tiene 22 dígitos (ingresaste ${valor.length}).` };
    if (!claveBancariaValida(valor)) return { error: 'El CBU/CVU no es válido, revisá que esté bien copiado.' };
    return { tipo: valor.startsWith('000') ? 'cvu' : 'cbu', valor };
  }

  if (!/^[a-zA-Z0-9.-]{6,20}$/.test(valor)) {
    return { error: 'El alias tiene que tener entre 6 y 20 caracteres: letras, números, punto o guion.' };
  }
  return { tipo: 'alias', valor };
}

export const NOMBRE_TIPO_COBRO = { cbu: 'CBU', cvu: 'CVU', alias: 'Alias' } as const;
