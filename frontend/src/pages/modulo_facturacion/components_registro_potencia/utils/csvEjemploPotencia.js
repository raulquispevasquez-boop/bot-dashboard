// Dataset completo de Agosto 2026 para Potencias (2,497 registros reales en Watts)
// Ensamblado desde chunks modulares para mantener todos los archivos bajo 600 líneas
import { CHUNK_1 } from './chunks/chunk1.js';
import { CHUNK_2 } from './chunks/chunk2.js';
import { CHUNK_3 } from './chunks/chunk3.js';
import { CHUNK_4 } from './chunks/chunk4.js';
import { CHUNK_5 } from './chunks/chunk5.js';
import { CHUNK_6 } from './chunks/chunk6.js';

export const CSV_EJEMPLO_POTENCIA = [
  CHUNK_1,
  CHUNK_2,
  CHUNK_3,
  CHUNK_4,
  CHUNK_5,
  CHUNK_6,
].join('\n');
