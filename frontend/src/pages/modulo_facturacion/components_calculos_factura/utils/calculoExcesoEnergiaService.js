// Servicio de cálculo para Liquidación de Exceso de Energía (Horas Punta y Fuera de Punta)
// Soporta Modalidad A (Bloque Contratado Asignado) y Modalidad B (Factor de Carga Objetivo)
// Cumple con la normativa eléctrica del mercado libre y límites de < 600 líneas

/**
 * Calcula la liquidación de exceso de energía en HP y HFP tanto para Modalidad A como B.
 *
 * @param {object} resultadoEnergias - Datos de energía calculados por calculoEnergiaService
 * @param {object} variablesConfig - Configuración de variables del sistema
 * @param {string} circuitoKey - Llave del circuito activo ('total', 'virtual', key física)
 * @param {string} modalidadForzada - 'bloque_fijo' | 'factor_carga' o null para usar la configurada
 * @returns {object} Resultados de exceso en MWh, kWh, costos en USD y PEN para ambas modalidades
 */
export const calcularLiquidacionExcesoEnergia = (
  resultadoEnergias,
  variablesConfig = {},
  circuitoKey = 'virtual_default',
  modalidadForzada = null
) => {
  if (!resultadoEnergias || !resultadoEnergias.consolidado) {
    return null;
  }

  const { consolidado, circuitos = [], meta = {} } = resultadoEnergias;
  const pContratada = variablesConfig?.potenciaContratada || {};
  const confExceso = variablesConfig?.excesoEnergia || {};
  const parametrosContrato = variablesConfig?.parametrosContrato || {};
  const tarifas = variablesConfig?.tarifas || {};
  const tipoCambio = parseFloat(variablesConfig?.tipoCambio?.valor) || 3.748;

  // 1. Determinar circuito activo
  const medidorVirtual = circuitos.find((c) => c.esVirtual);
  const activeKey = circuitoKey === 'virtual_default'
    ? (medidorVirtual ? medidorVirtual.key : 'total')
    : circuitoKey;

  const datosCircuito = activeKey === 'total'
    ? consolidado
    : (circuitos.find((c) => c.key === activeKey) || consolidado);

  const regHP_MWh = Math.round((datosCircuito.hp_MWh || 0) * 1000) / 1000;
  const regHFP_MWh = Math.round((datosCircuito.hfp_MWh || 0) * 1000) / 1000;
  const regTotal_MWh = Math.round((datosCircuito.total_MWh || 0) * 1000) / 1000;

  // 2. Horas transcurridas en HP y HFP
  const conteoHP = consolidado.conteoHP || 440;
  const conteoHFP = consolidado.conteoHFP || 2057;
  const totalIntervalos = conteoHP + conteoHFP;

  const horasHP = Math.round((conteoHP * 0.25) * 100) / 100; // 110.0 hrs
  const horasHFP = Math.round((conteoHFP * 0.25) * 100) / 100; // 514.25 hrs

  // 3. Precios unitarios de exceso de energía
  const tarifaEnergiaBase = parseFloat(tarifas.tarifaEnergia) || 58.50;
  const modalidadTarifa = confExceso.modalidad || 'fija';

  let precioHP_MWh = 0;
  let precioHFP_MWh = 0;

  if (modalidadTarifa === 'factor') {
    const factor = parseFloat(confExceso.factorRecargo) || 1.20;
    const precioFactor = Math.round(tarifaEnergiaBase * factor * 100) / 100;
    precioHP_MWh = precioFactor;
    precioHFP_MWh = precioFactor;
  } else if (modalidadTarifa === 'diferenciada') {
    precioHP_MWh = parseFloat(confExceso.precioUnitarioHP_MWh) || 78.00;
    precioHFP_MWh = parseFloat(confExceso.precioUnitarioHFP_MWh) || 68.00;
  } else {
    // Tarifa fija única por MWh
    const pFijo = parseFloat(confExceso.precioUnitarioMWh) || 72.50;
    precioHP_MWh = pFijo;
    precioHFP_MWh = pFijo;
  }

  // 4. MODALIDAD A: Sobre Bloque Contratado Asignado (MWh)
  const bloqueTotalMWh = parseFloat(confExceso.bloqueEnergiaBaseMWh) || 1500.00;
  const propHP = totalIntervalos > 0 ? conteoHP / totalIntervalos : 0.176;
  const propHFP = 1 - propHP;

  const bloqueAsignadoHP_MWh = Math.round(bloqueTotalMWh * propHP * 100) / 100;
  const bloqueAsignadoHFP_MWh = Math.round(bloqueTotalMWh * propHFP * 100) / 100;

  const excesoModA_HP_MWh = Math.max(0, Math.round((regHP_MWh - bloqueAsignadoHP_MWh) * 1000) / 1000);
  const excesoModA_HFP_MWh = Math.max(0, Math.round((regHFP_MWh - bloqueAsignadoHFP_MWh) * 1000) / 1000);
  const excesoModA_Total_MWh = Math.round((excesoModA_HP_MWh + excesoModA_HFP_MWh) * 1000) / 1000;

  const costoModA_HP_USD = Math.round(excesoModA_HP_MWh * precioHP_MWh * 100) / 100;
  const costoModA_HFP_USD = Math.round(excesoModA_HFP_MWh * precioHFP_MWh * 100) / 100;
  const costoModA_Total_USD = Math.round((costoModA_HP_USD + costoModA_HFP_USD) * 100) / 100;
  const costoModA_Total_PEN = Math.round(costoModA_Total_USD * tipoCambio * 100) / 100;

  // 5. MODALIDAD B: Por Desviación del Factor de Carga Objetivo
  const potenciaContratadaKW = parseFloat(pContratada.potenciaKW) || 700.00;
  const factorCargaObjetivoPct = parseFloat(parametrosContrato.factorCargaObjetivo) || 85.0;
  const fcRatio = factorCargaObjetivoPct / 100; // 0.85

  // Energía esperada / garantizada dentro de modulación (MWh)
  const topeEnergiaHP_MWh = Math.round(((potenciaContratadaKW * horasHP * fcRatio) / 1000) * 1000) / 1000;
  const topeEnergiaHFP_MWh = Math.round(((potenciaContratadaKW * horasHFP * fcRatio) / 1000) * 1000) / 1000;
  const topeEnergiaTotal_MWh = Math.round((topeEnergiaHP_MWh + topeEnergiaHFP_MWh) * 1000) / 1000;

  const excesoModB_HP_MWh = Math.max(0, Math.round((regHP_MWh - topeEnergiaHP_MWh) * 1000) / 1000);
  const excesoModB_HFP_MWh = Math.max(0, Math.round((regHFP_MWh - topeEnergiaHFP_MWh) * 1000) / 1000);
  const excesoModB_Total_MWh = Math.round((excesoModB_HP_MWh + excesoModB_HFP_MWh) * 1000) / 1000;

  const costoModB_HP_USD = Math.round(excesoModB_HP_MWh * precioHP_MWh * 100) / 100;
  const costoModB_HFP_USD = Math.round(excesoModB_HFP_MWh * precioHFP_MWh * 100) / 100;
  const costoModB_Total_USD = Math.round((costoModB_HP_USD + costoModB_HFP_USD) * 100) / 100;
  const costoModB_Total_PEN = Math.round(costoModB_Total_USD * tipoCambio * 100) / 100;

  // 6. Selección activa según configuración o selección forzada
  const modalidadActiva = modalidadForzada || confExceso.aplicaSobre || 'factor_carga';
  const esModA = modalidadActiva === 'bloque_fijo';

  return {
    activeKey,
    nombreFuente: datosCircuito.alias || 'Circuito',
    esVirtual: !!datosCircuito.esVirtual,
    regHP_MWh,
    regHFP_MWh,
    regTotal_MWh,
    horasHP,
    horasHFP,
    precioHP_MWh,
    precioHFP_MWh,
    modalidadActiva: esModA ? 'bloque_fijo' : 'factor_carga',
    tipoCambio,

    // Modalidad A (Bloque Asignado MWh)
    modalidadA: {
      nombre: 'Modalidad A: Sobre Bloque Contratado Asignado',
      bloqueTotalMWh,
      bloqueAsignadoHP_MWh,
      bloqueAsignadoHFP_MWh,
      excesoHP_MWh: excesoModA_HP_MWh,
      excesoHFP_MWh: excesoModA_HFP_MWh,
      excesoTotal_MWh: excesoModA_Total_MWh,
      costoHP_USD: costoModA_HP_USD,
      costoHFP_USD: costoModA_HFP_USD,
      costoTotal_USD: costoModA_Total_USD,
      costoTotal_PEN: costoModA_Total_PEN,
      hayExceso: excesoModA_Total_MWh > 0,
    },

    // Modalidad B (Factor de Carga Objetivo)
    modalidadB: {
      nombre: 'Modalidad B: Por Desviación del Factor de Carga Objetivo',
      potenciaContratadaKW,
      factorCargaObjetivoPct,
      topeEnergiaHP_MWh,
      topeEnergiaHFP_MWh,
      topeEnergiaTotal_MWh,
      excesoHP_MWh: excesoModB_HP_MWh,
      excesoHFP_MWh: excesoModB_HFP_MWh,
      excesoTotal_MWh: excesoModB_Total_MWh,
      costoHP_USD: costoModB_HP_USD,
      costoHFP_USD: costoModB_HFP_USD,
      costoTotal_USD: costoModB_Total_USD,
      costoTotal_PEN: costoModB_Total_PEN,
      hayExceso: excesoModB_Total_MWh > 0,
    },

    // Datos vigentes para renderizar directamente según la modalidad activa
    activo: esModA
      ? {
          tipo: 'bloque_fijo',
          etiqueta: 'Bloque Contratado',
          excesoHP_MWh: excesoModA_HP_MWh,
          excesoHFP_MWh: excesoModA_HFP_MWh,
          excesoTotal_MWh: excesoModA_Total_MWh,
          costoTotal_USD: costoModA_Total_USD,
          costoTotal_PEN: costoModA_Total_PEN,
          baseHP_MWh: bloqueAsignadoHP_MWh,
          baseHFP_MWh: bloqueAsignadoHFP_MWh,
          hayExceso: excesoModA_Total_MWh > 0,
        }
      : {
          tipo: 'factor_carga',
          etiqueta: `Factor Carga (${factorCargaObjetivoPct}%)`,
          excesoHP_MWh: excesoModB_HP_MWh,
          excesoHFP_MWh: excesoModB_HFP_MWh,
          excesoTotal_MWh: excesoModB_Total_MWh,
          costoTotal_USD: costoModB_Total_USD,
          costoTotal_PEN: costoModB_Total_PEN,
          baseHP_MWh: topeEnergiaHP_MWh,
          baseHFP_MWh: topeEnergiaHFP_MWh,
          hayExceso: excesoModB_Total_MWh > 0,
        },
  };
};
