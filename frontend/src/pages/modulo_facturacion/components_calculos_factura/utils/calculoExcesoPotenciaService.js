// Servicio de cálculo para Liquidación de Exceso de Potencia (HP y HFP)
// Cumple con la normativa eléctrica del COES/Osinergmin y límites de < 600 líneas

/**
 * Calcula la liquidación comercial por exceso de potencia contratada en HP y HFP.
 *
 * @param {object} resultadoMaximasDemandas - Datos de picos registrados de CardCalculoMaximasDemandas
 * @param {object} variablesConfig - Configuración de variables (potenciaContratada, excesoPotencia, tarifas, TC)
 * @param {string} circuitoKey - Circuito o medidor seleccionado ('total', 'virtual', key de celda)
 * @returns {object} Resultados detallados de excesos en kW, MW, costos USD y PEN
 */
export const calcularLiquidacionExcesoPotencia = (resultadoMaximasDemandas, variablesConfig = {}, circuitoKey = 'virtual_default') => {
  if (!resultadoMaximasDemandas || !resultadoMaximasDemandas.consolidado) {
    return null;
  }

  const { consolidado, circuitos = [] } = resultadoMaximasDemandas;
  const pContratada = variablesConfig?.potenciaContratada || {};
  const confExceso = variablesConfig?.excesoPotencia || {};
  const tarifas = variablesConfig?.tarifas || {};
  const tipoCambio = parseFloat(variablesConfig?.tipoCambio?.valor) || 3.748;

  // 1. Determinar el circuito o medidor activo
  const medidorVirtual = circuitos.find((c) => c.esVirtual);
  const activeKey = circuitoKey === 'virtual_default'
    ? (medidorVirtual ? medidorVirtual.key : 'total')
    : circuitoKey;

  const datosCircuito = activeKey === 'total'
    ? consolidado
    : (circuitos.find((c) => c.key === activeKey) || consolidado);

  const maxHP = datosCircuito.maxHP || { potenciaKW: 0, potenciaMW: 0, fechaDisplay: '—', horaDisplay: '—' };
  const maxHFP = datosCircuito.maxHFP || { potenciaKW: 0, potenciaMW: 0, fechaDisplay: '—', horaDisplay: '—' };

  // 2. Potencia Contratada base y límites con tolerancia
  const esDiferenciada = pContratada.modalidad === 'diferenciada';
  const contratadaHP_KW = esDiferenciada
    ? (parseFloat(pContratada.potenciaHP_KW) || 0)
    : (parseFloat(pContratada.potenciaKW) || 700.00);

  const contratadaHFP_KW = esDiferenciada
    ? (parseFloat(pContratada.potenciaHFP_KW) || 0)
    : (parseFloat(pContratada.potenciaKW) || 700.00);

  const toleranciaPct = parseFloat(pContratada.toleranciaPorcentaje) || 0;
  const factorTolerancia = 1 + (toleranciaPct / 100);

  const limiteHP_KW = Math.round(contratadaHP_KW * factorTolerancia * 100) / 100;
  const limiteHFP_KW = Math.round(contratadaHFP_KW * factorTolerancia * 100) / 100;

  // 3. Precios unitarios por exceso de potencia
  const tarifaPotenciaBase = parseFloat(tarifas.tarifaPotencia) || 8.450;
  const modalidadExceso = confExceso.modalidad || 'fija';

  let precioHP_KW = 0;
  let precioHFP_KW = 0;

  if (modalidadExceso === 'factor') {
    const factor = parseFloat(confExceso.factorRecargo) || 1.25;
    const precioFactor = Math.round(tarifaPotenciaBase * factor * 1000) / 1000;
    precioHP_KW = precioFactor;
    precioHFP_KW = precioFactor;
  } else if (modalidadExceso === 'diferenciada') {
    precioHP_KW = parseFloat(confExceso.precioUnitarioHP_KW) || 12.00;
    precioHFP_KW = parseFloat(confExceso.precioUnitarioHFP_KW) || 9.50;
  } else {
    // Tarifa fija única
    const pFijo = parseFloat(confExceso.precioUnitarioKW) || 10.50;
    precioHP_KW = pFijo;
    precioHFP_KW = pFijo;
  }

  // 4. Cálculo de Exceso en kW
  const deltaHP_Bruto = maxHP.potenciaKW - limiteHP_KW;
  const deltaHFP_Bruto = maxHFP.potenciaKW - limiteHFP_KW;

  const excesoHP_KW = Math.max(0, Math.round(deltaHP_Bruto * 100) / 100);
  const excesoHFP_KW = Math.max(0, Math.round(deltaHFP_Bruto * 100) / 100);

  const aplicaCriterio = confExceso.aplicaEn || 'HP_y_HFP';

  let excesoCobradoHP_KW = excesoHP_KW;
  let excesoCobradoHFP_KW = excesoHFP_KW;

  if (aplicaCriterio === 'solo_HP') {
    excesoCobradoHFP_KW = 0;
  } else if (aplicaCriterio === 'maximo_mensual') {
    // Evalúa sobre el pico mensual absoluto
    const maxMes = Math.max(maxHP.potenciaKW, maxHFP.potenciaKW);
    const excesoMes = Math.max(0, maxMes - limiteHP_KW);
    excesoCobradoHP_KW = excesoMes;
    excesoCobradoHFP_KW = 0;
  }

  const excesoTotal_KW = Math.round((excesoCobradoHP_KW + excesoCobradoHFP_KW) * 100) / 100;
  const excesoTotal_MW = Math.round((excesoTotal_KW / 1000) * 1000) / 1000;

  // 5. Costos en USD y PEN
  const costoHP_USD = Math.round(excesoCobradoHP_KW * precioHP_KW * 100) / 100;
  const costoHFP_USD = Math.round(excesoCobradoHFP_KW * precioHFP_KW * 100) / 100;
  const costoTotal_USD = Math.round((costoHP_USD + costoHFP_USD) * 100) / 100;
  const costoTotal_PEN = Math.round(costoTotal_USD * tipoCambio * 100) / 100;

  const hayExceso = excesoTotal_KW > 0;

  return {
    activeKey,
    nombreFuente: datosCircuito.alias || 'Circuito',
    esVirtual: !!datosCircuito.esVirtual,
    maxHP,
    maxHFP,
    contratadaHP_KW,
    contratadaHFP_KW,
    toleranciaPct,
    limiteHP_KW,
    limiteHFP_KW,
    precioHP_KW,
    precioHFP_KW,
    excesoHP_KW: excesoCobradoHP_KW,
    excesoHFP_KW: excesoCobradoHFP_KW,
    excesoTotal_KW,
    excesoTotal_MW,
    costoHP_USD,
    costoHFP_USD,
    costoTotal_USD,
    costoTotal_PEN,
    tipoCambio,
    hayExceso,
    aplicaCriterio,
    modalidadExceso,
  };
};
