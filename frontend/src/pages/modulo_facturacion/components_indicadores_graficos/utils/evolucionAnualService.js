/**
 * Servicio de Generación y Gestión de Historial de 12 Meses (Enero - Diciembre)
 * Proporciona series mensuales coherentes para:
 * 1. Evolución de Potencias (kW): 3 barras independientes por mes
 *    - Demanda Coincidente (kW)
 *    - Demanda Máxima VAD (kW)
 *    - Potencia Contratada / Generación (kW)
 * 2. Evolución de Energía (MWh / kWh): Barra apilada por mes
 *    - Horas Punta (HP)
 *    - Horas Fuera de Punta (HFP)
 *    - Total Mensual
 */

const NOMBRES_MESES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'
];

export const obtenerHistorial12Meses = ({
  potCoincidenteActual = 423.01,
  potVADActual = 688.61,
  potContratadaActual = 700.0,
  hpMWhActual = 44.976,
  hfpMWhActual = 143.369,
  mesActualIndex = 7, // Agosto = 7 (0-based)
  anio = 2026,
}) => {
  try {
    const guardado = localStorage.getItem('facturacion_cliente_libre_historial_12m_v1');
    if (guardado) {
      const parsed = JSON.parse(guardado);
      if (Array.isArray(parsed) && parsed.length === 12) {
        return parsed.map((m, idx) => {
          const esFuturo = idx > mesActualIndex;
          if (esFuturo) {
            return {
              ...m,
              esFuturo: true,
              demandaCoincidente: 0,
              demandaVAD: 0,
              potenciaGeneracion: 0,
              hpMWh: 0,
              hfpMWh: 0,
              totalMWh: 0,
              pctHP: 0,
              pctHFP: 0,
              hpKWh: 0,
              hfpKWh: 0,
              totalKWh: 0,
            };
          }
          return { ...m, esFuturo: false };
        });
      }
    }
  } catch (e) {
    console.warn('Error leyendo historial 12m guardado:', e);
  }

  // Factores de estacionalidad industrial típica en el Perú (ligera variación mes a mes para meses transcurridos)
  const factoresPotCoincidente = [0.93, 0.95, 0.98, 0.96, 0.97, 0.99, 0.98, 1.00, 1.02, 1.01, 1.03, 1.02];
  const factoresVAD = [0.94, 0.96, 0.99, 0.97, 0.98, 0.99, 0.97, 1.00, 1.01, 1.02, 1.03, 1.01];
  const factoresEnergiaHP = [0.91, 0.93, 0.97, 0.95, 0.96, 0.99, 0.97, 1.00, 1.01, 1.02, 1.04, 1.02];
  const factoresEnergiaHFP = [0.92, 0.94, 0.98, 0.96, 0.97, 0.98, 0.97, 1.00, 1.01, 1.03, 1.03, 1.01];

  const datos = NOMBRES_MESES.map((mes, idx) => {
    // Si es el mes actual, usar valores exactos medidos
    const esMesActual = idx === mesActualIndex;
    const esFuturo = idx > mesActualIndex;

    const coincidente = esMesActual
      ? Math.round(potCoincidenteActual * 100) / 100
      : esFuturo
      ? 0
      : Math.round(potCoincidenteActual * factoresPotCoincidente[idx] * 100) / 100;

    const vad = esMesActual
      ? Math.round(potVADActual * 100) / 100
      : esFuturo
      ? 0
      : Math.round(potVADActual * factoresVAD[idx] * 100) / 100;

    const potenciaGen = esFuturo ? 0 : Math.round(potContratadaActual * 100) / 100;

    const hpMWh = esMesActual
      ? Math.round(hpMWhActual * 1000) / 1000
      : esFuturo
      ? 0
      : Math.round(hpMWhActual * factoresEnergiaHP[idx] * 1000) / 1000;

    const hfpMWh = esMesActual
      ? Math.round(hfpMWhActual * 1000) / 1000
      : esFuturo
      ? 0
      : Math.round(hfpMWhActual * factoresEnergiaHFP[idx] * 1000) / 1000;

    const totalMWh = esFuturo ? 0 : Math.round((hpMWh + hfpMWh) * 1000) / 1000;
    const pctHP = totalMWh > 0 ? Math.round((hpMWh / totalMWh) * 1000) / 10 : 0;
    const pctHFP = totalMWh > 0 ? Math.round((hfpMWh / totalMWh) * 1000) / 10 : 0;

    return {
      mes,
      mesCompleto: `${mes} ${anio}`,
      esMesActual,
      esFuturo,
      // 1. Potencias (kW)
      demandaCoincidente: coincidente,
      demandaVAD: vad,
      potenciaGeneracion: potenciaGen,
      // 2. Energías (MWh)
      hpMWh,
      hfpMWh,
      totalMWh,
      pctHP,
      pctHFP,
      // En kWh para tooltips o detalle
      hpKWh: Math.round(hpMWh * 1000),
      hfpKWh: Math.round(hfpMWh * 1000),
      totalKWh: Math.round(totalMWh * 1000),
    };
  });

  return datos;
};
