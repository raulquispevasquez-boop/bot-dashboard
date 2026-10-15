/**
 * Servicio de Desglose de Facturación por Drivers de Impacto
 * Divide cada sol del recibo de energía en 3 categorías de causa raíz:
 * 1. DRIVER ENERGÍA: Todo concepto que varía directamente con el volumen consumido (kWh / MWh).
 * 2. DRIVER POTENCIA: Todo concepto que varía con la demanda máxima o coincidente (kW).
 * 3. DRIVER COSTOS FIJOS: Cargos de estructura fijos mensuales independientes de kW y kWh.
 */

export const calcularDesgloseDriversImpacto = ({
  subtotalEnergiaPEN = 0,
  subtotalPotenciaPEN = 0,
  filasPeajesCalculadas = [],
  baseFoseGeneracion = 0,
  baseFoseTransmision = 0,
  baseFoseDistribucion = 0,
  foseGeneracion = 0,
  foseTransmision = 0,
  foseDistribucion = 0,
  lerPEN = 0,
  fisePEN = 0,
  subtotalFOSE_SinIGV = 0,
}) => {
  // Helper para buscar monto de peaje por ID
  const obtenerPeaje = (id) => {
    const item = filasPeajesCalculadas.find((f) => f.id === id);
    return item && item.facturadoSoles ? Number(item.facturadoSoles) : 0;
  };

  const peajePrincipal = obtenerPeaje('peaje_principal');
  const peajeAD15 = obtenerPeaje('peaje_secundario_ad15');
  const peajeAD7 = obtenerPeaje('peaje_secundario_ad7');
  const peajeCPSEE = obtenerPeaje('peaje_secundario_cpsee');
  const cargoFijo = obtenerPeaje('cargo_fijo');
  const mantenimiento = obtenerPeaje('mantenimiento_reposicion');
  const alumbrado = obtenerPeaje('alumbrado_publico');
  const vadHP = obtenerPeaje('vad_hp');
  const vadHFP = obtenerPeaje('vad_hfp');

  // ========================================================
  // Desglose proporcional de FOSE entre Energía, Potencia y Fijo
  // ========================================================
  // A. FOSE Generación: Suministro Energía vs Suministro Potencia
  const propGenEnergia = baseFoseGeneracion > 0 ? (subtotalEnergiaPEN / baseFoseGeneracion) : 0.5;
  const propGenPotencia = baseFoseGeneracion > 0 ? (subtotalPotenciaPEN / baseFoseGeneracion) : 0.5;
  const foseGenEnergia = Math.round(foseGeneracion * propGenEnergia * 100) / 100;
  const foseGenPotencia = Math.round((foseGeneracion - foseGenEnergia) * 100) / 100;

  // B. FOSE Transmisión: Peajes Energía (AD15 + AD7) vs Peaje Potencia (Principal SPT)
  const peajesTransmEnergia = peajeAD15 + peajeAD7 + peajeCPSEE;
  const propTransmEnergia = baseFoseTransmision > 0 ? (peajesTransmEnergia / baseFoseTransmision) : 0.3;
  const foseTransmEnergia = Math.round(foseTransmision * propTransmEnergia * 100) / 100;
  const foseTransmPotencia = Math.round((foseTransmision - foseTransmEnergia) * 100) / 100;

  // C. FOSE Distribución: VAD (Potencia) vs Cargo Fijo
  const vadTotal = vadHP + vadHFP;
  const propDistrPotencia = baseFoseDistribucion > 0 ? (vadTotal / baseFoseDistribucion) : 0.99;
  const foseDistrPotencia = Math.round(foseDistribucion * propDistrPotencia * 100) / 100;
  const foseDistrFijo = Math.round((foseDistribucion - foseDistrPotencia) * 100) / 100;

  // ========================================================
  // 1. DRIVER ENERGÍA (Variable por consumo kWh / MWh)
  // ========================================================
  const itemsEnergia = [
    { concepto: 'Suministro Energía Activa (HP + HFP)', monto: subtotalEnergiaPEN, motivo: 'Consumo kWh según tarifa de contrato en horas punta y fuera de punta' },
    { concepto: 'Peaje Secundario AD15-MT (Transmisión)', monto: peajeAD15, motivo: 'Peaje regulado Osinergmin proporcional a los kWh totales consumidos' },
    { concepto: 'Peaje Secundario AD7-MT (Transmisión)', monto: peajeAD7, motivo: 'Peaje regulado Osinergmin proporcional a los kWh totales consumidos' },
    ...(peajeCPSEE > 0 ? [{ concepto: 'Peaje Secundario CPSEE', monto: peajeCPSEE, motivo: 'Peaje secundario de transmisión variable por kWh' }] : []),
    { concepto: 'Ley Electrificación Rural (LER)', monto: lerPEN, motivo: 'Cargo normativo aplicado directamente sobre la energía en barra (MWh)' },
    { concepto: 'Fondo Inclusión Social Energético (FISE)', monto: fisePEN, motivo: 'Fondo social aplicado directamente sobre la energía activa (kWh)' },
    { concepto: 'FOSE atribuible a Energía', monto: foseGenEnergia + foseTransmEnergia, motivo: 'Recargo 2.30% sobre el valor venta del suministro y peajes de energía' },
  ];
  const totalEnergia = Math.round(itemsEnergia.reduce((sum, item) => sum + item.monto, 0) * 100) / 100;

  // ========================================================
  // 2. DRIVER POTENCIA (Demanda y Capacidad kW)
  // ========================================================
  const itemsPotencia = [
    { concepto: 'Suministro Potencia (Demanda Coincidente)', monto: subtotalPotenciaPEN, motivo: 'Potencia registrada en la hora coincidente del SEIN/COES multiplicada por tarifa USD/kW' },
    { concepto: 'Peaje Principal SPT (Transmisión)', monto: peajePrincipal, motivo: 'Sistema Principal de Transmisión liquidado sobre la Demanda Coincidente (kW)' },
    { concepto: 'VAD Horas Punta (Distribución)', monto: vadHP, motivo: 'Valor Agregado de Distribución en HP liquidado sobre la demanda coincidente en punta (kW)' },
    { concepto: 'VAD Horas Fuera de Punta (Distribución)', monto: vadHFP, motivo: 'Valor Agregado de Distribución en HFP liquidado sobre la máxima demanda en fuera de punta (kW)' },
    { concepto: 'FOSE atribuible a Potencia', monto: foseGenPotencia + foseTransmPotencia + foseDistrPotencia, motivo: 'Recargo 2.30% sobre suministro de potencia, peaje principal y VAD' },
  ];
  const totalPotencia = Math.round(itemsPotencia.reduce((sum, item) => sum + item.monto, 0) * 100) / 100;

  // ========================================================
  // 3. DRIVER COSTOS FIJOS Y ESTRUCTURALES
  // ========================================================
  const itemsFijos = [
    { concepto: 'Cargo Fijo Comercial', monto: cargoFijo, motivo: 'Costo administrativo mensual fijo fijado por pliego tarifario Osinergmin' },
    { concepto: 'Mantenimiento y Reposición', monto: mantenimiento, motivo: 'Cargo mensual fijo por mantenimiento de conexión y equipo de medición' },
    { concepto: 'Alumbrado Público', monto: alumbrado, motivo: 'Alícuota fija asignada según estrato de consumo y pliego municipal' },
    { concepto: 'FOSE atribuible a Cargo Fijo', monto: foseDistrFijo, motivo: 'Recargo FOSE sobre el cargo fijo mensual' },
  ];
  const totalFijo = Math.round(itemsFijos.reduce((sum, item) => sum + item.monto, 0) * 100) / 100;

  // Total General Consolidado Sin IGV
  const totalFacturaSinIGV = Math.round((totalEnergia + totalPotencia + totalFijo) * 100) / 100;

  // Porcentajes de participación
  const pctEnergia = totalFacturaSinIGV > 0 ? (totalEnergia / totalFacturaSinIGV) * 100 : 0;
  const pctPotencia = totalFacturaSinIGV > 0 ? (totalPotencia / totalFacturaSinIGV) * 100 : 0;
  const pctFijo = totalFacturaSinIGV > 0 ? (totalFijo / totalFacturaSinIGV) * 100 : 0;

  // Gran Resumen para Diagrama de Torta / Donut
  const datosGraficoTorta = [
    { name: 'Driver Consumo Energía (kWh/MWh)', value: totalEnergia, porcentaje: Math.round(pctEnergia * 10) / 10, color: '#0ea5e9' },
    { name: 'Driver Demanda Potencia (kW)', value: totalPotencia, porcentaje: Math.round(pctPotencia * 10) / 10, color: '#a855f7' },
    { name: 'Driver Costos Fijos Estructurales', value: totalFijo, porcentaje: Math.round(pctFijo * 10) / 10, color: '#f43f5e' },
  ];

  // Gran Resumen de Composición de Factura (Estructura Tradicional)
  const totalSuministro = subtotalEnergiaPEN + subtotalPotenciaPEN;
  const totalPeajes = peajePrincipal + peajeAD15 + peajeAD7 + peajeCPSEE + cargoFijo + mantenimiento + alumbrado + vadHP + vadHFP;
  const totalOtrosCargos = subtotalFOSE_SinIGV + lerPEN + fisePEN;

  const datosGraficoEstructura = [
    { name: 'Suministro Energía', monto: subtotalEnergiaPEN, pct: totalFacturaSinIGV > 0 ? Math.round((subtotalEnergiaPEN / totalFacturaSinIGV) * 1000) / 10 : 0, color: '#38bdf8' },
    { name: 'Suministro Potencia', monto: subtotalPotenciaPEN, pct: totalFacturaSinIGV > 0 ? Math.round((subtotalPotenciaPEN / totalFacturaSinIGV) * 1000) / 10 : 0, color: '#818cf8' },
    { name: 'Peajes Transmisión y VAD', monto: totalPeajes, pct: totalFacturaSinIGV > 0 ? Math.round((totalPeajes / totalFacturaSinIGV) * 1000) / 10 : 0, color: '#c084fc' },
    { name: 'Otros Cargos (FOSE, LER, FISE)', monto: totalOtrosCargos, pct: totalFacturaSinIGV > 0 ? Math.round((totalOtrosCargos / totalFacturaSinIGV) * 1000) / 10 : 0, color: '#fb7185' },
  ];

  return {
    totalEnergia,
    pctEnergia: Math.round(pctEnergia * 10) / 10,
    itemsEnergia,

    totalPotencia,
    pctPotencia: Math.round(pctPotencia * 10) / 10,
    itemsPotencia,

    totalFijo,
    pctFijo: Math.round(pctFijo * 10) / 10,
    itemsFijos,

    totalFacturaSinIGV,
    datosGraficoTorta,
    datosGraficoEstructura,

    totalSuministro,
    totalPeajes,
    totalOtrosCargos,
  };
};
