// Agrupa una sede por marca a partir de su descripción, ej.
// "AREQUIPA 2 - MK - ECO { A124-1-24107007 }" -> "Makro"
// "LA PERLA - PVS { A125-1-25103040 }" -> "Plaza Vea"
// "PARDO - VIV { A125-1-25104004 }" -> "Vivanda"
// Es un patrón de texto (Fracttal no trae un campo de marca estructurado)
// — lo que no matchea cae en "Otros" para ir refinando la regla cuando
// aparezca un caso nuevo, en vez de adivinar.
export function clasificarMarca(descripcion) {
  const sinCodigo = (descripcion || '').split('{')[0];
  const segmentos = sinCodigo.split('-').map((s) => s.trim().toUpperCase()).filter(Boolean);
  for (const seg of segmentos) {
    if (seg === 'MK') return 'Makro';
    if (/^PV[A-Z]{0,3}$/.test(seg)) return 'Plaza Vea';
    if (seg === 'VIV' || seg === 'VV' || seg === 'VIVANDA') return 'Vivanda';
  }
  return 'Otros';
}

export const ORDEN_MARCAS = ['Plaza Vea', 'Makro', 'Vivanda', 'Otros'];
