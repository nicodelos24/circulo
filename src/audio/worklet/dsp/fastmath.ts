/**
 * Trigonometría barata para el hilo de audio: una tabla de seno con
 * interpolación lineal y una aproximación racional de la tangente
 * hiperbólica. En un celular la diferencia se nota:(Math.sin y Math.tanh
 * por muestra y por voz son de las operaciones más caras del bucle.
 */

const TABLE_SIZE = 4096;
const TABLE_MASK = TABLE_SIZE - 1;
const TWO_PI = Math.PI * 2;

const sineTable = new Float32Array(TABLE_SIZE + 1);
for (let i = 0; i <= TABLE_SIZE; i += 1) {
  sineTable[i] = Math.sin((i / TABLE_SIZE) * TWO_PI);
}

/** Seno de un ángulo expresado en vueltas (0..1 = 0..2π). */
export function fastSin(turns: number): number {
  const position = turns * TABLE_SIZE;
  const index = Math.floor(position);
  const frac = position - index;
  const a = sineTable[index & TABLE_MASK];
  const b = sineTable[(index + 1) & TABLE_MASK];
  return a + (b - a) * frac;
}

export function fastCos(turns: number): number {
  return fastSin(turns + 0.25);
}

/** tangente hiperblica aproximada (Padé 3/2): satura en +/-1 sin dividir de más. */
export function fastTanh(x: number): number {
  if (x > 4) return 1;
  if (x < -4) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

/** Aproximación de tangente para argumentos del rango audible. */
export function fastTan(x: number): number {
  const x2 = x * x;
  return (x * (135135 + x2 * (17325 + x2 * (378 + x2)))) / (135135 + x2 * (62370 + x2 * (3150 + x2 * 28)));
}
