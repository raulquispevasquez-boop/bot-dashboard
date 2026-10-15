/**
 * Servicio de Cálculo de Valor Agregado de Distribución (VAD) en Horas Punta y Fuera de Punta
 * Conforme al Procedimiento Técnico y Normativa de Tarifas de Distribución de Osinergmin.
 */

import { formatearMesNombre } from '../../components_configuracion_variables/utils/periodoFacturacionUtils';

/**
 * Obtiene los 6 periodos (YYYY-MM) cronológicos hasta el periodo de facturación actual inclusive
 */
export const obtenerPeriodosUltimos6Meses = (periodoFinYYYYMM = '2026-08') => {
  if (!periodoFinYYYYMM || !periodoFinYYYYMM.includes('-')) {
    return ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
  }

  const [yStr, mStr] = periodoFinYYYYMM.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);

  const periodos = [];
  for (let i = 5; i >= 0; i--) {
    let mesIdx = m - i;
    let anioIdx = y;
    while (mesIdx <= 0) {
      mesIdx += 12;
      anioIdx -= 1;
    }
    periodos.push(`${anioIdx}-${String(mesIdx).padStart(2, '0')}`);
  }

  return periodos;
};

/**
 * Ejecuta el cálculo completo del VAD para HP y HFP
 */
export const calcularVAD = ({
  periodoFacturacion = '2026-08',
  historicoPotencias = {},
  circuitoKey = 'total',
  peajesConfig = {},
}) => {
  const periodos6Meses = obtenerPeriodosUltimos6Meses(periodoFacturacion);
  const setPeriodos6 = new Set(periodos6Meses);

  // Obtener los datos del circuito seleccionado
  const porCircuito = historicoPotencias?.porCircuito || {};
  const historicoCircuito = porCircuito[circuitoKey] || {
    ultimos12Meses: historicoPotencias?.ultimos12Meses || [],
    anteriores: historicoPotencias?.anteriores || [],
  };

  const listaCompleta = [
    ...(historicoCircuito.ultimos12Meses || []),
    ...(historicoCircuito.anteriores || []),
  ];

  // Mapear los registros de los 6 meses
  const mapaRegistros = new Map();
  listaCompleta.forEach((item) => {
    if (item && item.periodo && setPeriodos6.has(item.periodo)) {
      mapaRegistros.set(item.periodo, item);
    }
  });

  const mesesEvaluados = periodos6Meses.map((pStr) => {
    const reg = mapaRegistros.get(pStr);
    const hp = Number(reg?.potenciaHP_KW ?? (reg?.potenciaKW || 0)) || 0;
    const hfp = Number(reg?.potenciaHFP_KW ?? (reg?.potenciaKW || 0)) || 0;

    return {
      periodo: pStr,
      mesNombre: formatearMesNombre(pStr),
      potenciaHP_KW: hp,
      potenciaHFP_KW: hfp,
      fechaHP: reg?.fechaHP || '',
      horaHP: reg?.horaHP || '',
      fechaHFP: reg?.fechaHFP || '',
      horaHFP: reg?.horaHFP || '',
      tieneDatos: hp > 0 || hfp > 0,
    };
  });

  // 1. VAD Horas Punta: Promedio de las 2 mayores demandas en HP de los últimos 6 meses
  const mesesConHP = [...mesesEvaluados]
    .filter((m) => m.potenciaHP_KW > 0)
    .sort((a, b) => b.potenciaHP_KW - a.potenciaHP_KW);

  let potenciaVAD_HP = 0;
  let top2_HP = [];

  if (mesesConHP.length >= 2) {
    top2_HP = [mesesConHP[0], mesesConHP[1]];
    potenciaVAD_HP = (top2_HP[0].potenciaHP_KW + top2_HP[1].potenciaHP_KW) / 2;
  } else if (mesesConHP.length === 1) {
    top2_HP = [mesesConHP[0]];
    potenciaVAD_HP = top2_HP[0].potenciaHP_KW;
  }

  // 2. VAD Horas Fuera de Punta: Exceso de la demanda HFP sobre la HP (mismo promedio de las 2 mayores HFP)
  const mesesConHFP = [...mesesEvaluados]
    .filter((m) => m.potenciaHFP_KW > 0)
    .sort((a, b) => b.potenciaHFP_KW - a.potenciaHFP_KW);

  let promedioTop2_HFP = 0;
  let top2_HFP = [];

  if (mesesConHFP.length >= 2) {
    top2_HFP = [mesesConHFP[0], mesesConHFP[1]];
    promedioTop2_HFP = (top2_HFP[0].potenciaHFP_KW + top2_HFP[1].potenciaHFP_KW) / 2;
  } else if (mesesConHFP.length === 1) {
    top2_HFP = [mesesConHFP[0]];
    promedioTop2_HFP = top2_HFP[0].potenciaHFP_KW;
  }

  // Exceso de la demanda HFP sobre la potencia VAD en HP
  const excesoHFP = Math.max(0, promedioTop2_HFP - potenciaVAD_HP);
  const potenciaVAD_HFP = excesoHFP;

  // 3. Precios y Costos Facturables en Soles
  const tarifaVAD_HP = parseFloat(peajesConfig?.vadHorasPunta ?? 13.438) || 0;
  const tarifaVAD_HFP = parseFloat(peajesConfig?.vadHorasFueraPunta ?? 14.460) || 0;

  const costoVAD_HP_PEN = Math.round(potenciaVAD_HP * tarifaVAD_HP * 100) / 100;
  const costoVAD_HFP_PEN = Math.round(potenciaVAD_HFP * tarifaVAD_HFP * 100) / 100;
  const costoTotalVAD_PEN = Math.round((costoVAD_HP_PEN + costoVAD_HFP_PEN) * 100) / 100;

  return {
    periodoFacturacion,
    mesesEvaluados,
    potenciaVAD_HP,
    potenciaVAD_HFP,
    promedioTop2_HFP,
    excesoHFP,
    top2_HP,
    top2_HFP,
    tarifaVAD_HP,
    tarifaVAD_HFP,
    costoVAD_HP_PEN,
    costoVAD_HFP_PEN,
    costoTotalVAD_PEN,
  };
};
