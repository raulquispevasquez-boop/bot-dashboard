/**
 * Servicio y utilidades para la tabla de Peajes y Cargos Regulados (Osinergmin)
 * Mantiene la modularidad y límite < 600 líneas
 */

export const CONCEPTOS_PEAJES_DEFAULT = [
  {
    id: 'peaje_principal',
    concepto: 'Peaje Principal (SPT/SGT)',
    variableCantidad: 'Demanda coincidente',
    unidadCantidad: 'kW',
    formulaDesc: 'Demanda coincidente × Tarifa S/./kW',
    unidadPrecio: 'S/./kW',
    esCentimos: false,
  },
  {
    id: 'peaje_secundario_ad15',
    concepto: 'Peaje Secundario (AD15-MT)',
    variableCantidad: 'kWh medidos',
    unidadCantidad: 'kWh',
    formulaDesc: 'kWh medidos × ctm. S/./kWh ÷ 100',
    unidadPrecio: 'ctm. S/./kWh',
    esCentimos: true,
  },
  {
    id: 'peaje_secundario_ad7',
    concepto: 'Peaje Secundario (AD7-MT)',
    variableCantidad: 'kWh medidos (sin pérdidas)',
    unidadCantidad: 'kWh',
    formulaDesc: 'kWh medidos × ctm. S/./kWh ÷ 100',
    unidadPrecio: 'ctm. S/./kWh',
    esCentimos: true,
  },
  {
    id: 'peaje_secundario_cpsee',
    concepto: 'Peaje Secundario (CPSEE)',
    variableCantidad: 'kWh medidos',
    unidadCantidad: 'kWh',
    formulaDesc: 'kWh medidos × ctm. S/./kWh ÷ 100',
    unidadPrecio: 'ctm. S/./kWh',
    esCentimos: true,
  },
  {
    id: 'cargo_fijo',
    concepto: 'Cargo Fijo',
    variableCantidad: '1 mes',
    unidadCantidad: 'mes',
    formulaDesc: 'Pliego de la distribuidora',
    unidadPrecio: 'S/./mes',
    esCentimos: false,
  },
  {
    id: 'mantenimiento_reposicion',
    concepto: 'Cargo por Mantenimiento y Reposición',
    variableCantidad: '1 mes',
    unidadCantidad: 'mes',
    formulaDesc: 'Según tipo de conexión',
    unidadPrecio: 'S/./mes',
    esCentimos: false,
  },
  {
    id: 'alumbrado_publico',
    concepto: 'Alumbrado Público',
    variableCantidad: 'Tope por categoría de consumo',
    unidadCantidad: 'mes',
    formulaDesc: 'Tramo máximo del pliego AP',
    unidadPrecio: 'S/./mes',
    esCentimos: false,
  },
  {
    id: 'vad_hp',
    concepto: 'VAD - Horas Punta',
    variableCantidad: 'Potencia de distribución: promedio de las 2 mayores demandas en HP de los últimos 6 meses',
    unidadCantidad: 'kW',
    formulaDesc: 'Potencia VAD HP × Tarifa S/./kW',
    unidadPrecio: 'S/./kW',
    esCentimos: false,
  },
  {
    id: 'vad_hfp',
    concepto: 'VAD - Horas Fuera de Punta',
    variableCantidad: 'Exceso de la demanda HFP sobre la HP (mismo promedio)',
    unidadCantidad: 'kW',
    formulaDesc: 'Exceso Potencia HFP × Tarifa S/./kW',
    unidadPrecio: 'S/./kW',
    esCentimos: false,
  },
  {
    id: 'reactiva_inductiva',
    concepto: 'Exceso de Energía Reactiva Inductiva',
    variableCantidad: 'kVArh que exceden el 30 % de los kWh',
    unidadCantidad: 'kVArh',
    formulaDesc: 'kVArh inductivo exceso × ctm. S/./kVArh ÷ 100',
    unidadPrecio: 'ctm. S/./kVArh',
    esCentimos: true,
  },
  {
    id: 'reactiva_capacitiva',
    concepto: 'Exceso de Energía Reactiva Capacitiva',
    variableCantidad: 'kVArh capacitivos registrados',
    unidadCantidad: 'kVArh',
    formulaDesc: 'kVArh capacitivo × ctm. S/./kVArh ÷ 100',
    unidadPrecio: 'ctm. S/./kVArh',
    esCentimos: true,
  },
  {
    id: 'otros',
    concepto: 'Otros Cargos Regulados',
    variableCantidad: 'Cargos adicionales aplicables',
    unidadCantidad: 'mes',
    formulaDesc: 'Cargo directo pliego Osinergmin',
    unidadPrecio: 'S/.',
    esCentimos: false,
  },
];

export const obtenerPrecioDesdeVariables = (id, peajes = {}) => {
  switch (id) {
    case 'peaje_principal': return peajes.peajePrincipal;
    case 'peaje_secundario_ad15': return peajes.peajeSecundarioAD15;
    case 'peaje_secundario_ad7': return peajes.peajeSecundarioAD7;
    case 'peaje_secundario_cpsee': return peajes.peajeSecundarioCPSEE;
    case 'cargo_fijo': return peajes.cargoFijo;
    case 'mantenimiento_reposicion': return peajes.cargoMantenimiento;
    case 'alumbrado_publico': return peajes.alumbradoPublico;
    case 'vad_hp': return peajes.vadHorasPunta;
    case 'vad_hfp': return peajes.vadHorasFueraPunta;
    case 'reactiva_inductiva': return peajes.excesoReactivaInductiva;
    case 'reactiva_capacitiva': return peajes.excesoReactivaCapacitiva;
    default: return null;
  }
};
