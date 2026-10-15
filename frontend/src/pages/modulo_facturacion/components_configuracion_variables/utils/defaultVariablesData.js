import { FERIADOS_PERU_OFICIALES } from './feriadosPeruData';

export const VARIABLES_FACTURACION_DEFAULT = {
  // Periodo / Mes Activo a Facturar ('YYYY-MM')
  periodoFacturacion: '2026-08',

  // 1. Energía Activa B.G Kallpa La Curva y Medidor en Sede
  energiaKallpa: {
    valor: 1450.50,
    unidad: 'MWh', // 'MWh' o 'kWh'
    valorSede: 1420.25,
    unidadSede: 'MWh', // 'MWh' o 'kWh'
  },

  // 2. Demanda Coincidente (Fecha, Hora, Potencia kW y Precio Unitario por kW)
  demandaCoincidente: {
    fecha: '2026-08-26',
    hora: '19:00',
    potenciaKW: 423.01,
    precioUnitarioKW: 6.620,
  },

  // 3. Tipo de Cambio
  tipoCambio: {
    valor: 3.748,
    fecha: '2026-08-31',
    fuente: 'SBS', // 'SBS', 'SUNAT', 'Manual'
  },

  // 4. Tarifas Cliente Libre
  tarifas: {
    tarifaEnergia: 58.50,
    unidadEnergia: 'USD/MWh', // 'USD/MWh' o 'USD/kWh'
    tarifaPotencia: 8.450,
    unidadPotencia: 'USD/kW', // 'USD/kW' o 'USD/MW'
  },

  // 5. Potencia Contratada del Suministro
  potenciaContratada: {
    potenciaKW: 700.00,
    potenciaHP_KW: 700.00,
    potenciaHFP_KW: 700.00,
    unidad: 'kW', // 'kW' o 'MW'
    toleranciaPorcentaje: 5.0, // % de tolerancia
    suministroCodigo: 'SUM-KALLPA-001',
    precioExcesoKW: 10.50, // USD/kW penalidad exceso opcional
    modalidad: 'unica', // 'unica' o 'diferenciada' (HP / HFP)
  },

  // 6. Factor de Carga Objetivo / Parámetro K
  parametrosContrato: {
    factorCargaObjetivo: 85.0, // %
    parametroK: 1.050,
  },

  // 6. Días No Laborables (domingos y feriados)
  diasNoLaborables: [...FERIADOS_PERU_OFICIALES],

  // 7. Histórico de Potencias (Últimos 12 meses móviles en primera línea + histórico anterior)
  historicoPotencias: {
    circuitoSeleccionado: 'total',
    ultimos12Meses: [
      { id: 'm-12', periodo: '2025-09', mesNombre: 'Septiembre 2025', potenciaHP_KW: 245300.50, potenciaHFP_KW: 239800.00, potenciaKW: 245300.50 },
      { id: 'm-11', periodo: '2025-10', mesNombre: 'Octubre 2025', potenciaHP_KW: 251200.00, potenciaHFP_KW: 245100.00, potenciaKW: 251200.00 },
      { id: 'm-10', periodo: '2025-11', mesNombre: 'Noviembre 2025', potenciaHP_KW: 248900.25, potenciaHFP_KW: 242000.50, potenciaKW: 248900.25 },
      { id: 'm-09', periodo: '2025-12', mesNombre: 'Diciembre 2025', potenciaHP_KW: 260100.80, potenciaHFP_KW: 253400.00, potenciaKW: 260100.80 },
      { id: 'm-08', periodo: '2026-01', mesNombre: 'Enero 2026', potenciaHP_KW: 255400.10, potenciaHFP_KW: 249200.00, potenciaKW: 255400.10 },
      { id: 'm-07', periodo: '2026-02', mesNombre: 'Febrero 2026', potenciaHP_KW: 258700.40, potenciaHFP_KW: 251100.00, potenciaKW: 258700.40 },
      { id: 'm-06', periodo: '2026-03', mesNombre: 'Marzo 2026', potenciaHP_KW: 262300.00, potenciaHFP_KW: 257800.00, potenciaKW: 262300.00 },
      { id: 'm-05', periodo: '2026-04', mesNombre: 'Abril 2026', potenciaHP_KW: 259800.60, potenciaHFP_KW: 252900.00, potenciaKW: 259800.60 },
      { id: 'm-04', periodo: '2026-05', mesNombre: 'Mayo 2026', potenciaHP_KW: 261400.90, potenciaHFP_KW: 254200.00, potenciaKW: 261400.90 },
      { id: 'm-03', periodo: '2026-06', mesNombre: 'Junio 2026', potenciaHP_KW: 258100.30, potenciaHFP_KW: 250900.00, potenciaKW: 258100.30 },
      { id: 'm-02', periodo: '2026-07', mesNombre: 'Julio 2026', potenciaHP_KW: 260900.75, potenciaHFP_KW: 253800.00, potenciaKW: 260900.75 },
      { id: 'm-01', periodo: '2026-08', mesNombre: 'Agosto 2026', potenciaHP_KW: 262213.78, potenciaHFP_KW: 256400.00, potenciaKW: 262213.78 },
    ],
    anteriores: [
      { id: 'm-old-01', periodo: '2025-08', mesNombre: 'Agosto 2025', potenciaHP_KW: 241500.00, potenciaHFP_KW: 236100.00, potenciaKW: 241500.00 },
      { id: 'm-old-02', periodo: '2025-07', mesNombre: 'Julio 2025', potenciaHP_KW: 239800.50, potenciaHFP_KW: 234500.00, potenciaKW: 239800.50 },
      { id: 'm-old-03', periodo: '2025-06', mesNombre: 'Junio 2025', potenciaHP_KW: 242100.20, potenciaHFP_KW: 235900.00, potenciaKW: 242100.20 },
      { id: 'm-old-04', periodo: '2025-05', mesNombre: 'Mayo 2025', potenciaHP_KW: 238900.00, potenciaHFP_KW: 231200.00, potenciaKW: 238900.00 },
      { id: 'm-old-05', periodo: '2025-04', mesNombre: 'Abril 2025', potenciaHP_KW: 235400.80, potenciaHFP_KW: 228900.00, potenciaKW: 235400.80 },
      { id: 'm-old-06', periodo: '2025-03', mesNombre: 'Marzo 2025', potenciaHP_KW: 237100.10, potenciaHFP_KW: 230500.00, potenciaKW: 237100.10 },
      { id: 'm-old-07', periodo: '2025-02', mesNombre: 'Febrero 2025', potenciaHP_KW: 234800.30, potenciaHFP_KW: 229100.00, potenciaKW: 234800.30 },
      { id: 'm-old-08', periodo: '2025-01', mesNombre: 'Enero 2025', potenciaHP_KW: 233900.00, potenciaHFP_KW: 227600.00, potenciaKW: 233900.00 },
      { id: 'm-old-09', periodo: '2024-12', mesNombre: 'Diciembre 2024', potenciaHP_KW: 236500.40, potenciaHFP_KW: 231000.00, potenciaKW: 236500.40 },
      { id: 'm-old-10', periodo: '2024-11', mesNombre: 'Noviembre 2024', potenciaHP_KW: 232100.90, potenciaHFP_KW: 226800.00, potenciaKW: 232100.90 },
      { id: 'm-old-11', periodo: '2024-10', mesNombre: 'Octubre 2024', potenciaHP_KW: 231400.00, potenciaHFP_KW: 225200.00, potenciaKW: 231400.00 },
      { id: 'm-old-12', periodo: '2024-09', mesNombre: 'Septiembre 2024', potenciaHP_KW: 230200.50, potenciaHFP_KW: 224100.00, potenciaKW: 230200.50 },
    ],
  },

  // 8. Peajes y Cargos Regulados (Precios Unitarios)
  peajesRegulados: {
    peajePrincipal: 35.533, // S/./kW
    peajeSecundarioAD15: 0.188, // ctm. S/./kWh
    peajeSecundarioAD7: 4.574, // ctm. S/./kWh
    peajeSecundarioCPSEE: 0.000, // ctm. S/./kWh
    cargoFijo: 6.38, // S/.
    cargoMantenimiento: 36.99, // S/.
    alumbradoPublico: 2520.00, // S/. según alícuota
    vadHorasPunta: 13.438, // S/./kW
    vadHorasFueraPunta: 14.460, // S/./kW (VAD Horas Fuera de Punta)
    excesoReactivaInductiva: 4.750, // ctm. S/./kVarh
    excesoReactivaCapacitiva: 9.500, // ctm. S/./kVarh
  },

  // 9. Otros Cargos (Factor FOSE, Ley LER y Fondo FISE)
  otrosCargos: {
    factorFose: 2.30, // Recargo FOSE % (2.30% según pliego actual Osinergmin)
    cargoLer: 11.000, // S/./MWh (Ley 28749)
    cargoFise: 1.315200, // ctm. S/./kWh (Ley 29852 / Osinergmin)
  },

  // 10. Intervalo de Horas Punta y Fuera de Punta
  horarioPunta: {
    horaInicio: '18:00',
    horaFin: '23:00',
    diasAplica: 'Lunes a Sábado',
  },

  // 11. Costos por Exceso de Potencia
  excesoPotencia: {
    precioUnitarioKW: 10.50, // USD/kW por potencia en exceso
    precioUnitarioHP_KW: 12.00, // USD/kW en HP si diferenciado
    precioUnitarioHFP_KW: 9.50, // USD/kW en HFP si diferenciado
    unidad: 'USD/kW', // 'USD/kW' o 'USD/MW'
    modalidad: 'fija', // 'fija' o 'factor'
    factorRecargo: 1.25, // Multiplicador sobre tarifa potencia si aplica
    toleranciaExcesoKW: 0, // Tolerancia adicional en kW
    aplicaEn: 'HP_y_HFP', // 'HP_y_HFP' | 'solo_HP' | 'maximo_mensual'
  },

  // 12. Costos por Exceso de Energía
  excesoEnergia: {
    precioUnitarioMWh: 72.50, // USD/MWh por energía en exceso
    precioUnitarioHP_MWh: 78.00, // USD/MWh en HP
    precioUnitarioHFP_MWh: 68.00, // USD/MWh en HFP
    unidad: 'USD/MWh', // 'USD/MWh' o 'USD/kWh'
    modalidad: 'fija', // 'fija' o 'factor'
    factorRecargo: 1.20, // Multiplicador sobre tarifa energía base
    bloqueEnergiaBaseMWh: 1500.00, // Bloque mensual base en MWh
    aplicaSobre: 'factor_carga', // 'factor_carga' | 'bloque_fijo' | 'consumo_total'
  },
};

