// Servicio de cálculo para Factor de Carga (FC) según las 3 referencias de mercado
// Cumple con la normativa eléctrica del COES/Osinergmin y límite < 600 líneas

const formatearKW = (val) => {
  const num = Number(val) || 0;
  return num.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

/**
 * Calcula el Factor de Carga (FC) para un circuito/suministro evaluado contra 3 potencias de referencia:
 * 1. Potencia Contratada (Aprovechamiento del Contrato)
 * 2. Máxima Demanda del Mes (Forma de la Curva de Carga / Utilización)
 * 3. Demanda Coincidente (Relación con el Peaje Principal SEIN/COES)
 *
 * Fórmula: FC = E_mes / (P_ref × h_mes)
 *
 * @param {object} resultadoEnergias - Resultados de energía (kWh y MWh)
 * @param {object} resultadoMaximasDemandas - Picos de demanda HP y HFP
 * @param {object} resultadoCoincidente - Demanda coincidente en hora punta SEIN
 * @param {object} variablesConfig - Configuración de variables (potenciaContratada, etc.)
 * @param {string} circuitoKey - Llave del circuito ('virtual_default', 'total', etc.)
 * @param {number} horasMes - Horas del periodo mensual (744 h para Agosto)
 * @returns {object} Resultados de FC para cada referencia con textos didácticos
 */
export const calcularFactoresDeCarga = ({
  resultadoEnergias,
  resultadoMaximasDemandas,
  resultadoCoincidente,
  variablesConfig = {},
  circuitoKey = 'virtual_default',
  horasMes = 744,
}) => {
  if (!resultadoEnergias || !resultadoEnergias.consolidado) {
    return null;
  }

  const { consolidado: energiasConsolidado, circuitos: energiasCircuitos = [] } = resultadoEnergias;
  const pContratadaConfig = variablesConfig?.potenciaContratada || {};
  const hMes = Number(horasMes) || 744;

  // 1. Identificar medidor o circuito seleccionado
  const medidorVirtual = energiasCircuitos.find((c) => c.esVirtual);
  const activeKey = circuitoKey === 'virtual_default'
    ? (medidorVirtual ? medidorVirtual.key : 'total')
    : circuitoKey;

  // 2. Extraer Energía Activa Mensual (E_mes)
  const datosEnergiaCircuito = activeKey === 'total'
    ? energiasConsolidado
    : (energiasCircuitos.find((c) => c.key === activeKey) || energiasConsolidado);

  const eMesKWh = Math.round(Number(datosEnergiaCircuito?.total_kWh) || 0);
  const eMesMWh = Math.round(((Number(datosEnergiaCircuito?.total_MWh) || (eMesKWh / 1000))) * 1000) / 1000;
  const aliasCircuito = datosEnergiaCircuito?.alias || 'Circuito Seleccionado';
  const esVirtual = !!datosEnergiaCircuito?.esVirtual;

  // 3. Obtener Referencia 1: Potencia Contratada (kW)
  const esDiferenciada = pContratadaConfig.modalidad === 'diferenciada';
  let potenciaContratadaKW = esDiferenciada
    ? (parseFloat(pContratadaConfig.potenciaHP_KW) || 700.00)
    : (parseFloat(pContratadaConfig.potenciaKW) || 700.00);
  potenciaContratadaKW = Number(potenciaContratadaKW) || 700.00;

  // 4. Obtener Referencia 2: Máxima Demanda del Mes (kW)
  let maximaDemandaMesKW = 0;
  let picoDetalle = { fecha: '—', hora: '—', periodo: 'HP/HFP' };

  if (resultadoMaximasDemandas) {
    const { consolidado: maxConsolidado, circuitos: maxCircuitos = [] } = resultadoMaximasDemandas;
    const datosMaxCircuito = activeKey === 'total'
      ? maxConsolidado
      : (maxCircuitos.find((c) => c.key === activeKey) || maxConsolidado);

    if (datosMaxCircuito) {
      const pHP = Number(datosMaxCircuito.maxHP?.potenciaKW) || 0;
      const pHFP = Number(datosMaxCircuito.maxHFP?.potenciaKW) || 0;
      if (pHP >= pHFP) {
        maximaDemandaMesKW = pHP;
        picoDetalle = {
          fecha: datosMaxCircuito.maxHP?.fechaDisplay || '—',
          hora: datosMaxCircuito.maxHP?.horaDisplay || '—',
          periodo: 'Horas Punta (HP)',
        };
      } else {
        maximaDemandaMesKW = pHFP;
        picoDetalle = {
          fecha: datosMaxCircuito.maxHFP?.fechaDisplay || '—',
          hora: datosMaxCircuito.maxHFP?.horaDisplay || '—',
          periodo: 'Fuera de Punta (HFP)',
        };
      }
    }
  }
  maximaDemandaMesKW = Number(maximaDemandaMesKW) || 0;

  // 5. Obtener Referencia 3: Demanda Coincidente (kW)
  let demandaCoincidenteKW = 0;
  let coincidenteDetalle = { fecha: '—', hora: '—' };

  if (resultadoCoincidente) {
    if (activeKey === 'total') {
      demandaCoincidenteKW = Number(resultadoCoincidente.totalFisicoKW ?? resultadoCoincidente.potenciaKW) || 0;
    } else {
      const circCoinc = resultadoCoincidente.circuitos?.find((c) => c.key === activeKey);
      if (circCoinc) {
        demandaCoincidenteKW = Number(circCoinc.potenciaKW ?? circCoinc.valorKW) || 0;
      } else {
        demandaCoincidenteKW = Number(resultadoCoincidente.potenciaKW) || 0;
      }
    }
    coincidenteDetalle = {
      fecha: resultadoCoincidente.fechaDisplay || '—',
      hora: resultadoCoincidente.horaDisplay || '—',
    };
  }
  demandaCoincidenteKW = Number(demandaCoincidenteKW) || 0;

  // 6. Función auxiliar para calcular cada Factor de Carga de forma segura
  const calcularFC = (potenciaRefKW) => {
    const pRef = Number(potenciaRefKW) || 0;
    if (pRef <= 0 || hMes <= 0) {
      return {
        fcDecimal: 0,
        fcPorcentaje: 0,
        energiaMaximaKWh: 0,
        energiaMaximaMWh: 0,
        ratioTexto: `${eMesKWh.toLocaleString('es-PE')} / 0`,
      };
    }

    const energiaMaximaKWh = Math.round(pRef * hMes);
    const energiaMaximaMWh = Math.round((energiaMaximaKWh / 1000) * 1000) / 1000;
    const ratio = energiaMaximaKWh > 0 ? eMesKWh / energiaMaximaKWh : 0;
    const fcDecimal = Math.round(ratio * 100) / 100;
    const fcPorcentaje = Math.round(ratio * 1000) / 10; // ej: 30.9%

    return {
      fcDecimal,
      fcPorcentaje,
      energiaMaximaKWh,
      energiaMaximaMWh,
      ratioTexto: `${eMesKWh.toLocaleString('es-PE')} / ${energiaMaximaKWh.toLocaleString('es-PE')}`,
    };
  };

  // 7. Cálculos para las 3 Referencias con tipado seguro
  const refContratada = {
    id: 'contratada',
    titulo: 'Potencia Contratada',
    potenciaKW: potenciaContratadaKW,
    potenciaEtiqueta: `${formatearKW(potenciaContratadaKW)} kW`,
    ...calcularFC(potenciaContratadaKW),
    uso: 'Aprovechamiento del contrato; es el valor que imprime Kallpa / suministrador.',
    significado: 'Evalúa qué porcentaje de la capacidad que pagas en tu contrato mensual fue aprovechada efectivamente en energía.',
    interpretacion: calcularFC(potenciaContratadaKW).fcDecimal < 0.5
      ? 'Aprovechamiento bajo: estás pagando reserva de potencia que no estás consumiendo en kWh.'
      : 'Aprovechamiento óptimo: tu consumo amortiza eficientemente la potencia contratada.',
    color: '#06b6d4', // Cyan
  };

  const refMaximaDemanda = {
    id: 'maxima_demanda',
    titulo: 'Máxima Demanda del Mes',
    potenciaKW: maximaDemandaMesKW,
    potenciaEtiqueta: `~${formatearKW(maximaDemandaMesKW)} kW`,
    ...calcularFC(maximaDemandaMesKW),
    picoDetalle,
    uso: 'Forma de la curva de carga y factor de utilización interno.',
    significado: 'Mide qué tan plana y eficiente es tu operación frente a tu propio pico máximo de potencia en el mes.',
    interpretacion: calcularFC(maximaDemandaMesKW).fcDecimal >= 0.7
      ? 'Curva aplanada y regular: operación continua sin arranques ni picos desproporcionados.'
      : 'Curva puntiaguda: existen picos aislados que encarecen tu demanda máxima mensual.',
    color: '#8b5cf6', // Violeta / Púrpura
  };

  const refCoincidente = {
    id: 'coincidente',
    titulo: 'Demanda Coincidente',
    potenciaKW: demandaCoincidenteKW,
    potenciaEtiqueta: `${formatearKW(demandaCoincidenteKW)} kW`,
    ...calcularFC(demandaCoincidenteKW),
    coincidenteDetalle,
    uso: 'Relación entre tu consumo y la demanda que paga el peaje principal.',
    significado: 'Evalúa la eficiencia de modulación en la hora pico del SEIN/COES, determinante del peaje de transmisión.',
    interpretacion: calcularFC(demandaCoincidenteKW).fcDecimal >= refMaximaDemanda.fcDecimal
      ? 'Excelente modulación: redujiste carga en la punta del sistema, optimizando el costo por peaje.'
      : 'Atención: tu demanda en hora pico SEIN fue alta respecto a tu consumo medio.',
    color: '#f59e0b', // Ámbar
  };

  return {
    activeKey,
    aliasCircuito,
    esVirtual,
    eMesKWh,
    eMesMWh,
    horasMes: hMes,
    referencias: [refContratada, refMaximaDemanda, refCoincidente],
    refContratada,
    refMaximaDemanda,
    refCoincidente,
  };
};
