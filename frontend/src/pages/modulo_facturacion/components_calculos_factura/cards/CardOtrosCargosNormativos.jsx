import React, { useState, useMemo } from 'react';
import { ShieldCheck, Info, HelpCircle, CheckCircle2, ChevronDown, Sliders, Zap } from 'lucide-react';
import { getTrelloCardStyle } from '../../components_configuracion_variables/utils/trelloCardStyles';
import { buscarPotenciaCoincidente } from '../../components_registro_potencia/utils/buscarPotenciaCoincidente';
import {
  CONCEPTOS_PEAJES_DEFAULT,
  obtenerPrecioDesdeVariables,
} from '../utils/peajesReguladosService';
import { calcularVAD } from '../utils/calculoVADService';

const ACCENT = '#f43f5e'; // Rojo carmesí / rosa oscuro para cargos normativos e impositivos

const formatearNumero = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || valor === '' || isNaN(Number(valor))) return '—';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

/**
 * Componente Tooltip flotante reusable para explicaciones al pasar el cursor
 */
const TooltipItem = ({ children, content, title }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          style={{
            position: 'absolute',
            bottom: '125%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#0f172a',
            border: '1px solid #e11d48',
            borderRadius: '7px',
            padding: '0.55rem 0.75rem',
            color: '#f8fafc',
            fontSize: '0.72rem',
            lineHeight: 1.4,
            width: '270px',
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.75)',
            pointerEvents: 'none',
          }}
        >
          {title && (
            <div style={{ fontWeight: 800, color: '#fda4af', marginBottom: '3px', borderBottom: '1px solid #334155', paddingBottom: '2px' }}>
              {title}
            </div>
          )}
          <div style={{ color: '#cbd5e1' }}>{content}</div>
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              borderWidth: '5px',
              borderStyle: 'solid',
              borderColor: '#e11d48 transparent transparent transparent',
            }}
          />
        </div>
      )}
    </div>
  );
};

/**
 * Tarjeta de Otros Cargos: FOSE, LER, FISE
 * Estructurada en 3 secciones dedicadas idénticas a la facturación oficial del recibo,
 * con valores unitarios enlazados en vivo con la configuración de variables (Botón 3).
 */
const CardOtrosCargosNormativos = ({ variables, resultadoEnergias, resultadoMaximasDemandas }) => {
  const [hovered, setHovered] = useState(false);
  const [circuitoSeleccionado, setCircuitoSeleccionado] = useState('virtual_default');

  const peajesConfig = variables?.peajesRegulados || {};
  const otrosCargosConfig = variables?.otrosCargos || {};

  // 1. Obtener la Demanda Coincidente (kW) registrada en la fecha y hora seleccionada en Botón 3
  const demanda = variables?.demandaCoincidente || {};
  const fechaCoincidente = demanda.fecha || '2026-08-26';
  const horaCoincidente = demanda.hora || '19:00';

  const resultadoCoincidente = useMemo(() => {
    return buscarPotenciaCoincidente(fechaCoincidente, horaCoincidente);
  }, [fechaCoincidente, horaCoincidente]);

  const circuitosCoincidentes = resultadoCoincidente?.circuitos || [];
  const medidorVirtualKey = resultadoCoincidente?.medidorVirtualKey;
  const circuitoActivoKey = circuitoSeleccionado === 'virtual_default'
    ? (medidorVirtualKey || 'total')
    : circuitoSeleccionado;

  // 2. Demanda Coincidente para el circuito seleccionado
  let potCoincidente = 0;
  if (circuitoActivoKey === 'barra_brg') {
    potCoincidente = resultadoCoincidente?.potenciaKW ?? 423.01;
  } else if (circuitoActivoKey === 'total') {
    potCoincidente = resultadoCoincidente?.totalFisicoKW ?? 0;
  } else if (medidorVirtualKey && circuitoActivoKey === medidorVirtualKey) {
    potCoincidente = resultadoCoincidente?.potenciaKW ?? 0;
  } else {
    const circ = circuitosCoincidentes.find((c) => c.key === circuitoActivoKey);
    potCoincidente = circ ? circ.potenciaKW : (resultadoCoincidente?.potenciaKW ?? 0);
  }

  // Máxima Demanda HFP para cálculo de VAD HFP
  const demandasCircuito = useMemo(() => {
    if (!resultadoMaximasDemandas) return null;
    if (circuitoActivoKey === 'total' || circuitoActivoKey === 'barra_brg') {
      return resultadoMaximasDemandas.consolidado;
    }
    return (
      (resultadoMaximasDemandas.circuitos || []).find((c) => c.key === circuitoActivoKey) ||
      resultadoMaximasDemandas.consolidado
    );
  }, [resultadoMaximasDemandas, circuitoActivoKey]);
  const potHFP = demandasCircuito?.maxHFP?.potenciaKW ?? 688.61;

  // 3. Energía Sin Pérdidas y Con Pérdidas para el circuito seleccionado
  const circuitosEnergia = resultadoEnergias?.circuitos || [];
  const consolidadoEnergia = resultadoEnergias?.consolidado;

  let energiaCircuito = null;
  if (circuitoActivoKey === 'barra_brg') {
    const valMWh = parseFloat(variables?.energiaKallpa?.valor) || 575.410;
    energiaCircuito = {
      total_kWh: valMWh * 1000,
      hp_kWh: (valMWh * 1000) * 0.2388,
      hfp_kWh: (valMWh * 1000) * 0.7612,
    };
  } else if (circuitoActivoKey === 'total') {
    energiaCircuito = consolidadoEnergia;
  } else {
    energiaCircuito = circuitosEnergia.find((c) => c.key === circuitoActivoKey);
    if (!energiaCircuito && circuitosEnergia.some((c) => c.esVirtual)) {
      energiaCircuito = circuitosEnergia.find((c) => c.esVirtual);
    }
    if (!energiaCircuito) {
      energiaCircuito = consolidadoEnergia;
    }
  }

  const totalBaseKWh = energiaCircuito?.total_kWh || 188345.0;
  const totalBaseMWh = totalBaseKWh / 1000;
  const hpBaseKWh = energiaCircuito?.hp_kWh || (totalBaseKWh * 0.2388);
  const hfpBaseKWh = energiaCircuito?.hfp_kWh || (totalBaseKWh * 0.7612);

  // Pérdidas de generación según contrato
  const factorAdicionalMultiplicador = parseFloat(variables?.parametrosContrato?.factorK) || 0.016748;
  const hpConPerdidaMWh = (hpBaseKWh * (1 + factorAdicionalMultiplicador)) / 1000;
  const hfpConPerdidaMWh = (hfpBaseKWh * (1 + factorAdicionalMultiplicador)) / 1000;

  // 4. Parámetros Económicos y Tarifas Contractuales (Suministro: Generación)
  const tarifas = variables?.tarifas || {};
  const precioEnergiaUSD = parseFloat(tarifas.tarifaEnergia) || 68.0;
  const precioPotenciaUSD = parseFloat(tarifas.tarifaPotencia) || 9.8;
  const tipoCambio = parseFloat(variables?.tipoCambio?.valor) || 3.748;

  const subtotalEnergiaUSD = (hpConPerdidaMWh + hfpConPerdidaMWh) * precioEnergiaUSD;
  const subtotalPotenciaUSD = potCoincidente * precioPotenciaUSD;
  const subtotalSuministroUSD = subtotalEnergiaUSD + subtotalPotenciaUSD;
  const subtotalSuministroPEN = Math.round(subtotalSuministroUSD * tipoCambio * 100) / 100;

  // 5. Cálculo de VAD y Peajes Regulados (Transmisión y Distribución)
  const vadData = useMemo(() => {
    return calcularVAD({
      periodoFacturacion: variables?.periodoFacturacion || '2026-08',
      historicoPotencias: variables?.historicoPotencias || {},
      circuitoKey: circuitoActivoKey,
      peajesConfig,
    });
  }, [variables?.periodoFacturacion, variables?.historicoPotencias, peajesConfig, circuitoActivoKey]);

  const filasPeajesCalculadas = useMemo(() => {
    return CONCEPTOS_PEAJES_DEFAULT.map((item) => {
      let cantNum = null;
      let precioNum = null;
      const precioDesdeConfig = obtenerPrecioDesdeVariables(item.id, peajesConfig);

      switch (item.id) {
        case 'peaje_principal':
          cantNum = potCoincidente > 0 ? potCoincidente : null;
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 35.533;
          break;
        case 'peaje_secundario_ad15':
          cantNum = totalBaseKWh > 0 ? totalBaseKWh : null;
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 0.188;
          break;
        case 'peaje_secundario_ad7':
          cantNum = totalBaseKWh > 0 ? totalBaseKWh : null;
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 4.574;
          break;
        case 'peaje_secundario_cpsee':
          cantNum = null;
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 0.000;
          break;
        case 'cargo_fijo':
          cantNum = 1;
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 6.380;
          break;
        case 'mantenimiento_reposicion':
          cantNum = 1;
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 10.500;
          break;
        case 'alumbrado_publico':
          cantNum = 1;
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 2520.000;
          break;
        case 'vad_hp':
          cantNum = vadData?.vadHP?.demandaFacturableKW ?? (potCoincidente > 0 ? potCoincidente : null);
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 13.438;
          break;
        case 'vad_hfp':
          cantNum = vadData?.vadHFP?.demandaFacturableKW ?? (potHFP > 0 ? potHFP : null);
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 14.460;
          break;
        default:
          cantNum = null;
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 0;
          break;
      }

      let facturadoSoles = null;
      if (cantNum !== null && precioNum !== null) {
        if (['peaje_secundario_ad15', 'peaje_secundario_ad7'].includes(item.id)) {
          facturadoSoles = Math.round(cantNum * (precioNum / 100) * 100) / 100;
        } else {
          facturadoSoles = Math.round(cantNum * precioNum * 100) / 100;
        }
      }

      return { ...item, facturadoSoles };
    });
  }, [peajesConfig, potCoincidente, totalBaseKWh, potHFP, vadData]);

  // 6. VALORES UNITARIOS DESDE CONFIGURACIÓN DE VARIABLES (BOTÓN 3)
  // Factor FOSE (%)
  let factorFosePorcentaje = 2.30;
  if (otrosCargosConfig.factorFose !== undefined && otrosCargosConfig.factorFose !== null) {
    const rawFose = parseFloat(otrosCargosConfig.factorFose);
    if (!isNaN(rawFose)) {
      if (rawFose > 1.0 && rawFose < 2.0) {
        factorFosePorcentaje = (rawFose - 1) * 100; // ej: 1.0345 -> 3.45%
      } else if (rawFose >= 2.0) {
        factorFosePorcentaje = rawFose; // ej: 2.30 -> 2.30%
      } else if (rawFose > 0 && rawFose <= 1.0) {
        factorFosePorcentaje = rawFose * 100; // ej: 0.023 -> 2.30%
      }
    }
  }
  const factorFoseMultiplicador = factorFosePorcentaje / 100;

  // Precios LER y FISE directamente desde la configuración de variables
  const precioLER_MWh = parseFloat(otrosCargosConfig.cargoLer ?? 11.0000) || 11.0000;
  const precioFISE_ctmKWh = parseFloat(otrosCargosConfig.cargoFise ?? 1.315200) || 1.315200;

  // 7. DESGLOSE DE BASES FOSE (Generación, Transmisión, Distribución)
  let baseFoseGeneracion = 0;
  let baseFoseTransmision = 0;
  let baseFoseDistribucion = 0;

  if (circuitoActivoKey === 'barra_brg') {
    // Referencia contrato Barra BRG Kallpa (Image 1)
    baseFoseGeneracion = 104404.34;
    baseFoseTransmision = 64464.01;
    baseFoseDistribucion = 18432.94;
  } else {
    // Dinámico calculado para el medidor seleccionado (Virtual o Físico)
    baseFoseGeneracion = subtotalSuministroPEN;
    baseFoseTransmision = Math.round(
      filasPeajesCalculadas
        .filter((f) => ['peaje_principal', 'peaje_secundario_ad15', 'peaje_secundario_ad7', 'peaje_secundario_cpsee'].includes(f.id))
        .reduce((sum, f) => sum + (f.facturadoSoles || 0), 0) * 100
    ) / 100;
    baseFoseDistribucion = Math.round(
      filasPeajesCalculadas
        .filter((f) => ['vad_hp', 'vad_hfp', 'cargo_fijo'].includes(f.id))
        .reduce((sum, f) => sum + (f.facturadoSoles || 0), 0) * 100
    ) / 100;
  }

  // Recargos FOSE por segmento
  const foseGeneracion = Math.round(baseFoseGeneracion * factorFoseMultiplicador * 100) / 100;
  const foseTransmision = Math.round(baseFoseTransmision * factorFoseMultiplicador * 100) / 100;
  const foseDistribucion = Math.round(baseFoseDistribucion * factorFoseMultiplicador * 100) / 100;

  const subtotalFOSE_SinIGV = Math.round((foseGeneracion + foseTransmision + foseDistribucion) * 100) / 100;
  const igvFOSE = Math.round(subtotalFOSE_SinIGV * 0.18 * 100) / 100;
  const totalFOSE = Math.round((subtotalFOSE_SinIGV + igvFOSE) * 100) / 100;

  // 8. CÁLCULO LER (Ley General de Electrificación Rural - Ley 28749)
  const baseMWh_LER = circuitoActivoKey === 'barra_brg'
    ? (parseFloat(variables?.energiaKallpa?.valor) || 575.410)
    : totalBaseMWh;
  const facturadoLER = Math.round(baseMWh_LER * precioLER_MWh * 100) / 100;

  // 9. CÁLCULO FISE (Fondo de Inclusión Social Energético - Ley 29852)
  const baseKWh_FISE = circuitoActivoKey === 'barra_brg'
    ? ((parseFloat(variables?.energiaKallpa?.valor) || 575.410) * 1000)
    : totalBaseKWh;
  const facturadoFISE = Math.round(baseKWh_FISE * (precioFISE_ctmKWh / 100) * 100) / 100;

  // 10. TOTALES CONSOLIDADOS (FOSE + LER + FISE)
  const subTotalSinIGV = Math.round((subtotalFOSE_SinIGV + facturadoLER + facturadoFISE) * 100) / 100;
  const totalIGV = igvFOSE;
  const totalGeneral = Math.round((totalFOSE + facturadoLER + facturadoFISE) * 100) / 100;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...getTrelloCardStyle(ACCENT, hovered),
        width: '100%',
        maxWidth: '100%',
        minWidth: '370px',
        flex: '1 1 100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* 1. Barra de Encabezado Superior */}
      <div
        style={{
          background: 'linear-gradient(135deg, #4c0519 0%, #881337 50%, #1e112a 100%)',
          borderRadius: '7px 7px 0 0',
          padding: '0.65rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.6rem',
          borderBottom: '2px solid #9f1239',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div
            style={{
              padding: '0.35rem',
              borderRadius: '6px',
              background: 'rgba(251, 113, 133, 0.2)',
              color: '#ffe4e6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldCheck size={18} />
          </div>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '0.96rem',
                fontWeight: 800,
                color: '#ffffff',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              OTROS CARGOS NORMATIVOS (FOSE, LER, FISE)
            </h3>
            <span style={{ fontSize: '0.7rem', color: '#fecdd3' }}>
              Subsidios Cruzados y Fondos de Electrificación e Inclusión Energética
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Selector de Circuito / Barra BRG */}
          <div style={{ position: 'relative' }}>
            <select
              value={circuitoActivoKey}
              onChange={(e) => setCircuitoSeleccionado(e.target.value)}
              style={{
                background: '#150a24',
                border: '1px solid #e11d48',
                borderRadius: '6px',
                padding: '0.22rem 1.6rem 0.22rem 0.55rem',
                color: '#ffe4e6',
                fontSize: '0.72rem',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
              }}
            >
              {resultadoCoincidente?.medidorVirtualKey && (
                <option value={resultadoCoincidente.medidorVirtualKey}>
                  🟣 {resultadoCoincidente.nombreFuente || 'Medidor Virtual'}
                </option>
              )}
              <option value="total">⚡ Toda la Planta (Total Consolidado)</option>
              <option value="barra_brg">🏛️ Barra BRG Kallpa (Contrato / {formatearNumero(variables?.energiaKallpa?.valor || 575.410, 3)} MWh)</option>
              {circuitosCoincidentes
                .filter((c) => !c.esVirtual)
                .map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.alias} {c.codigo ? `(${c.codigo})` : ''}
                  </option>
                ))}
            </select>
            <ChevronDown
              size={13}
              color="#fda4af"
              style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
          </div>

          <span
            title="Factor de recargo FOSE aprobado por Osinergmin y configurado en Botón 3"
            style={{
              fontSize: '0.68rem',
              background: 'rgba(244, 63, 94, 0.2)',
              border: '1px solid rgba(244, 63, 94, 0.4)',
              color: '#fda4af',
              padding: '0.2rem 0.6rem',
              borderRadius: '12px',
              fontWeight: 800,
            }}
          >
            Recargo FOSE: {factorFosePorcentaje.toFixed(2)}%
          </span>
          <span
            style={{
              fontSize: '0.67rem',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#ffffff',
              padding: '0.2rem 0.55rem',
              borderRadius: '12px',
              fontWeight: 700,
            }}
          >
            Marco Osinergmin
          </span>
        </div>
      </div>

      {/* 2. Banner de Información y Bases Normativas */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(76, 5, 25, 0.25) 0%, rgba(30, 27, 75, 0.35) 100%)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          borderRadius: '8px',
          padding: '0.55rem 0.85rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.55rem',
          margin: '0.4rem 0.2rem 0.6rem 0.2rem',
        }}
      >
        <Info size={17} color="#fb7185" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '0.74rem', color: '#e2e8f0', lineHeight: 1.45 }}>
          <strong style={{ color: '#fda4af' }}>Bases de Cálculo Normativas:</strong>{' '}
          El <strong>FOSE</strong> se liquida aplicando el <strong>{factorFosePorcentaje.toFixed(2)}%</strong> sobre los cargos tarifarios de <strong>Generación</strong>, <strong>Transmisión</strong> y <strong>Distribución</strong>{' '}
          <span style={{ color: '#f43f5e', fontWeight: 700 }}>
            (excluyendo Mantenimiento y Reposición, Alumbrado Público y cargos no tarifarios según Ley 31429)
          </span>.{' '}
          El <strong>LER</strong> y <strong>FISE</strong> se aplican directamente sobre la <strong>Energía retirada ({formatearNumero(baseMWh_LER, 3)} MWh / {formatearNumero(baseKWh_FISE, 0)} kWh)</strong>.
        </div>
      </div>

      {/* 3. Contenedor de las 3 Secciones Separadas (FOSE, LER, FISE) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', margin: '0 0.2rem' }}>
        
        {/* ========================================================= */}
        {/* SECCIÓN 1: RECARGO POR FONDO DE COMPENSACIÓN SOCIAL (FOSE) */}
        {/* ========================================================= */}
        <div style={{ border: '1px solid #334155', borderRadius: '7px', overflow: 'hidden', background: '#090d16' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#240f42', color: '#ffffff' }}>
                <th
                  rowSpan={2}
                  style={{
                    padding: '0.5rem 0.75rem',
                    textAlign: 'left',
                    fontWeight: 800,
                    width: '28%',
                    border: '1px solid #3b1d6b',
                    fontSize: '0.76rem',
                  }}
                >
                  Recargo por Fondo de Compensación Social Eléctrica
                </th>
                <th
                  colSpan={3}
                  style={{
                    padding: '0.4rem 0.5rem',
                    textAlign: 'center',
                    fontWeight: 800,
                    border: '1px solid #3b1d6b',
                    color: '#e9d5ff',
                    fontSize: '0.74rem',
                  }}
                >
                  Facturación de Cargos Tarifarios (S/)
                </th>
                <th
                  rowSpan={2}
                  style={{
                    padding: '0.5rem 0.75rem',
                    textAlign: 'right',
                    fontWeight: 800,
                    width: '22%',
                    border: '1px solid #3b1d6b',
                    fontSize: '0.76rem',
                  }}
                >
                  Facturado S/
                </th>
              </tr>
              <tr style={{ background: '#240f42', color: '#ffffff' }}>
                <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center', fontWeight: 800, fontSize: '0.72rem', border: '1px solid #3b1d6b', width: '16%', color: '#93c5fd' }}>
                  Generación
                </th>
                <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center', fontWeight: 800, fontSize: '0.72rem', border: '1px solid #3b1d6b', width: '17%', color: '#c084fc' }}>
                  Transmisión
                </th>
                <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center', fontWeight: 800, fontSize: '0.72rem', border: '1px solid #3b1d6b', width: '17%', color: '#6ee7b7' }}>
                  Distribución(')
                </th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: '#0b1120' }}>
                {/* Columna Concepto FOSE */}
                <td style={{ padding: '0.65rem 0.75rem', border: '1px solid #1e293b', verticalAlign: 'top' }}>
                  <TooltipItem
                    title="Fondo de Compensación Social Eléctrica (FOSE)"
                    content="Ley N° 27510, modificada por Ley N° 31429 y Ley N° 31598. Subsidio cruzado para usuarios residenciales menores de 140 kWh/mes. Excluye Alumbrado Público y Mantenimiento."
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'help' }}>
                      <span style={{ fontWeight: 800, color: '#f8fafc', fontSize: '0.82rem' }}>FOSE</span>
                      <HelpCircle size={13} color="#fb7185" />
                    </div>
                  </TooltipItem>
                  <div style={{ fontSize: '0.66rem', color: '#94a3b8', marginTop: '0.25rem', lineHeight: 1.35 }}>
                    *Según Ley 31429 que modifica a los artículos 1, 2 y 3 de Ley 27510 y Ley 31598
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#fda4af', lineHeight: 1.35, marginTop: '0.2rem', fontStyle: 'italic' }}>
                    (') No incluyen cargos por Mantenimiento y reposición, Alumbrado público y otros cargos no tarifarios.
                  </div>
                </td>

                {/* Subcolumna GENERACIÓN */}
                <td style={{ padding: '0.6rem 0.55rem', textAlign: 'center', border: '1px solid #1e293b', verticalAlign: 'top', background: '#090f1d' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    Suministro Energía y Potencia
                  </div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 900, color: '#ffffff', fontSize: '0.86rem', marginTop: '0.25rem' }}>
                    S/. {formatearNumero(baseFoseGeneracion, 2)}
                  </div>
                  <div style={{ fontSize: '0.66rem', color: '#c084fc', fontFamily: 'monospace', marginTop: '0.35rem', background: 'rgba(192, 132, 252, 0.12)', border: '1px solid rgba(192, 132, 252, 0.3)', borderRadius: '4px', padding: '0.15rem 0.35rem', display: 'inline-block' }}>
                    Recargo ({factorFosePorcentaje.toFixed(2)}%): <strong style={{ color: '#ffffff' }}>S/. {formatearNumero(foseGeneracion, 2)}</strong>
                  </div>
                </td>

                {/* Subcolumna TRANSMISIÓN */}
                <td style={{ padding: '0.6rem 0.55rem', textAlign: 'center', border: '1px solid #1e293b', verticalAlign: 'top', background: '#090f1d' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    Peajes SPT y SST (AD15/AD7)
                  </div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 900, color: '#ffffff', fontSize: '0.86rem', marginTop: '0.25rem' }}>
                    S/. {formatearNumero(baseFoseTransmision, 2)}
                  </div>
                  <div style={{ fontSize: '0.66rem', color: '#c084fc', fontFamily: 'monospace', marginTop: '0.35rem', background: 'rgba(192, 132, 252, 0.12)', border: '1px solid rgba(192, 132, 252, 0.3)', borderRadius: '4px', padding: '0.15rem 0.35rem', display: 'inline-block' }}>
                    Recargo ({factorFosePorcentaje.toFixed(2)}%): <strong style={{ color: '#ffffff' }}>S/. {formatearNumero(foseTransmision, 2)}</strong>
                  </div>
                </td>

                {/* Subcolumna DISTRIBUCIÓN(') */}
                <td style={{ padding: '0.6rem 0.55rem', textAlign: 'center', border: '1px solid #1e293b', verticalAlign: 'top', background: '#090f1d' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    VAD (HP/HFP) + Cargo Fijo
                  </div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 900, color: '#ffffff', fontSize: '0.86rem', marginTop: '0.25rem' }}>
                    S/. {formatearNumero(baseFoseDistribucion, 2)}
                  </div>
                  <div style={{ fontSize: '0.66rem', color: '#c084fc', fontFamily: 'monospace', marginTop: '0.35rem', background: 'rgba(192, 132, 252, 0.12)', border: '1px solid rgba(192, 132, 252, 0.3)', borderRadius: '4px', padding: '0.15rem 0.35rem', display: 'inline-block' }}>
                    Recargo ({factorFosePorcentaje.toFixed(2)}%): <strong style={{ color: '#ffffff' }}>S/. {formatearNumero(foseDistribucion, 2)}</strong>
                  </div>
                </td>

                {/* Columna FACTURADO S/ */}
                <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', border: '1px solid #1e293b', verticalAlign: 'middle' }}>
                  <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Recargo Base FOSE:</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 900, color: '#f8fafc', fontSize: '0.90rem', marginTop: '0.15rem' }}>
                    S/. {formatearNumero(subtotalFOSE_SinIGV, 2)}
                  </div>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr style={{ background: '#170617', borderTop: '2px solid #be123c' }}>
                <td colSpan={4} style={{ padding: '0.45rem 0.75rem', fontWeight: 800, textAlign: 'right', color: '#f8fafc', border: '1px solid #1e293b', fontSize: '0.76rem' }}>
                  Sub Total S/. (FOSE Sin IGV)
                </td>
                <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 900, color: '#fda4af', border: '1px solid #1e293b', fontSize: '0.86rem', background: '#24050d' }}>
                  S/. {formatearNumero(subtotalFOSE_SinIGV, 2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ========================================================= */}
        {/* SECCIÓN 2: CARGO POR LEY GENERAL ELECTRIFICACIÓN RURAL (LER) */}
        {/* ========================================================= */}
        <div style={{ border: '1px solid #334155', borderRadius: '7px', overflow: 'hidden', background: '#090d16' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#240f42', color: '#ffffff' }}>
                <th style={{ padding: '0.45rem 0.75rem', textAlign: 'left', fontWeight: 800, width: '42%', border: '1px solid #3b1d6b', fontSize: '0.76rem' }}>
                  Cargo Por Ley General De Electrificación Rural
                </th>
                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontWeight: 800, width: '20%', border: '1px solid #3b1d6b', fontSize: '0.76rem' }}>
                  Energía MWh
                </th>
                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontWeight: 800, width: '20%', border: '1px solid #3b1d6b', fontSize: '0.76rem' }}>
                  Precio LER* S/./MWh
                </th>
                <th style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontWeight: 800, width: '18%', border: '1px solid #3b1d6b', fontSize: '0.76rem' }}>
                  Facturado S/
                </th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: '#0b1120' }}>
                <td style={{ padding: '0.55rem 0.75rem', border: '1px solid #1e293b', verticalAlign: 'middle' }}>
                  <TooltipItem
                    title="Ley General De Electrificación Rural (LER)"
                    content="Ley N° 28749 y D.S. N° 025-2007-EM. Financia obras de electrificación rural en zonas no atendidas. Se aplica directamente sobre la energía activa retirada."
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'help' }}>
                      <span style={{ fontWeight: 800, color: '#f8fafc', fontSize: '0.80rem' }}>Cargo Por Ley General De Electrificación Rural</span>
                      <HelpCircle size={13} color="#38bdf8" />
                    </div>
                  </TooltipItem>
                  <div style={{ fontSize: '0.66rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                    *Según D.S. Nº 025-2007-EM - Reglamento de la Ley 28749
                  </div>
                </td>
                <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center', border: '1px solid #1e293b', fontFamily: 'monospace', fontWeight: 800, color: '#ffffff', fontSize: '0.84rem', verticalAlign: 'middle' }}>
                  <div>{formatearNumero(baseMWh_LER, 3)} MWh</div>
                  <div style={{ fontSize: '0.64rem', color: '#94a3b8', fontWeight: 400 }}>Energía activa retirada</div>
                </td>
                <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center', border: '1px solid #1e293b', verticalAlign: 'middle' }}>
                  <div style={{ fontFamily: 'monospace', fontWeight: 800, color: '#38bdf8', fontSize: '0.84rem' }}>
                    S/. {formatearNumero(precioLER_MWh, 4)} /MWh
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontFamily: 'monospace', marginTop: '0.15rem' }}>
                    {formatearNumero(baseMWh_LER, 3)} × {formatearNumero(precioLER_MWh, 4)}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#7dd3fc', marginTop: '0.1rem' }}>
                    Tarifa Osinergmin (Botón 3)
                  </div>
                </td>
                <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', border: '1px solid #1e293b', fontFamily: 'monospace', fontWeight: 900, color: '#f8fafc', fontSize: '0.86rem', verticalAlign: 'middle' }}>
                  S/. {formatearNumero(facturadoLER, 2)}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr style={{ background: '#0a1628', borderTop: '2px solid #0284c7' }}>
                <td colSpan={3} style={{ padding: '0.4rem 0.75rem', fontWeight: 800, textAlign: 'right', color: '#f8fafc', border: '1px solid #1e293b', fontSize: '0.76rem' }}>
                  Total S/.
                </td>
                <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 900, color: '#38bdf8', border: '1px solid #1e293b', fontSize: '0.86rem', background: '#071b33' }}>
                  S/. {formatearNumero(facturadoLER, 2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ========================================================= */}
        {/* SECCIÓN 3: FONDO DE INCLUSIÓN SOCIAL ENERGÉTICO (FISE)    */}
        {/* ========================================================= */}
        <div style={{ border: '1px solid #334155', borderRadius: '7px', overflow: 'hidden', background: '#090d16' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#240f42', color: '#ffffff' }}>
                <th style={{ padding: '0.45rem 0.75rem', textAlign: 'left', fontWeight: 800, width: '42%', border: '1px solid #3b1d6b', fontSize: '0.76rem' }}>
                  Fondo De Inclusión Social Energético
                </th>
                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontWeight: 800, width: '20%', border: '1px solid #3b1d6b', fontSize: '0.76rem' }}>
                  Energía kWh
                </th>
                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontWeight: 800, width: '20%', border: '1px solid #3b1d6b', fontSize: '0.76rem' }}>
                  Precio FISE* ctm S/./kWh
                </th>
                <th style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontWeight: 800, width: '18%', border: '1px solid #3b1d6b', fontSize: '0.76rem' }}>
                  Facturado S/
                </th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: '#0b1120' }}>
                <td style={{ padding: '0.55rem 0.75rem', border: '1px solid #1e293b', verticalAlign: 'middle' }}>
                  <TooltipItem
                    title="Fondo De Inclusión Social Energético (FISE)"
                    content="Ley N° 29852, D.S. N° 021-2012-EM y Resolución Osinergmin N° 011-2023-OS/CD. Destinado a la masificación del gas natural y compensación social."
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'help' }}>
                      <span style={{ fontWeight: 800, color: '#f8fafc', fontSize: '0.80rem' }}>Fondo De Inclusión Social Energético</span>
                      <HelpCircle size={13} color="#a78bfa" />
                    </div>
                  </TooltipItem>
                  <div style={{ fontSize: '0.66rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                    *Según Ley 29852, Decreto Supremo Nº 021-2012-EM y Resolución OSINERGMIN Nº 011-2023-OS/CD
                  </div>
                </td>
                <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center', border: '1px solid #1e293b', fontFamily: 'monospace', fontWeight: 800, color: '#ffffff', fontSize: '0.84rem', verticalAlign: 'middle' }}>
                  <div>{formatearNumero(baseKWh_FISE, 0)} kWh</div>
                  <div style={{ fontSize: '0.64rem', color: '#94a3b8', fontWeight: 400 }}>Energía activa retirada</div>
                </td>
                <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center', border: '1px solid #1e293b', verticalAlign: 'middle' }}>
                  <div style={{ fontFamily: 'monospace', fontWeight: 800, color: '#c084fc', fontSize: '0.84rem' }}>
                    {formatearNumero(precioFISE_ctmKWh, 4)} ctm. S/./kWh
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontFamily: 'monospace', marginTop: '0.15rem' }}>
                    {formatearNumero(baseKWh_FISE, 0)} × {formatearNumero(precioFISE_ctmKWh, 4)} ÷ 100
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#c084fc', marginTop: '0.1rem' }}>
                    Tarifa: S/. {(precioFISE_ctmKWh / 100).toFixed(6)} /kWh (Botón 3)
                  </div>
                </td>
                <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', border: '1px solid #1e293b', fontFamily: 'monospace', fontWeight: 900, color: '#f8fafc', fontSize: '0.86rem', verticalAlign: 'middle' }}>
                  S/. {formatearNumero(facturadoFISE, 2)}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr style={{ background: '#1c102a', borderTop: '2px solid #9333ea' }}>
                <td colSpan={3} style={{ padding: '0.4rem 0.75rem', fontWeight: 800, textAlign: 'right', color: '#f8fafc', border: '1px solid #1e293b', fontSize: '0.76rem' }}>
                  Total S/.
                </td>
                <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 900, color: '#c084fc', border: '1px solid #1e293b', fontSize: '0.86rem', background: '#250f38' }}>
                  S/. {formatearNumero(facturadoFISE, 2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

      </div>

      {/* 4. Barra Consolidada de Subtotal Otros Cargos */}
      <div
        style={{
          marginTop: '0.75rem',
          marginRight: '0.2rem',
          marginLeft: '0.2rem',
          borderRadius: '7px',
          overflow: 'hidden',
          border: '1px solid #9f1239',
          background: 'linear-gradient(135deg, #24050d 0%, #350a1a 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
        }}
      >
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffffff', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            SUBTOTAL OTROS CARGOS (FOSE + LER + FISE) S/. (SIN IGV)
          </div>
          <div style={{ fontSize: '0.68rem', color: '#fda4af', marginTop: '0.15rem' }}>
            Cargos regulados y subsidios aplicables al periodo facturado (Valor Venta)
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: '#cbd5e1' }}>FOSE Sin IGV:</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.90rem', color: '#ffffff' }}>
              S/. {formatearNumero(subtotalFOSE_SinIGV, 2)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.65rem', color: '#cbd5e1' }}>LER + FISE:</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.90rem', color: '#cbd5e1' }}>
              S/. {formatearNumero(facturadoLER + facturadoFISE, 2)}
            </div>
          </div>

          <div
            style={{
              background: '#4c0519',
              border: '1px solid #fb7185',
              borderRadius: '6px',
              padding: '0.35rem 0.75rem',
              textAlign: 'right',
            }}
          >
            <div style={{ fontSize: '0.65rem', color: '#ffe4e6', fontWeight: 700 }}>Total Otros Cargos (Sin IGV):</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '1.05rem', color: '#fda4af' }}>
              S/. {formatearNumero(subTotalSinIGV, 2)}
            </div>
          </div>
        </div>
      </div>

      {/* 5. Pie de Control y Auditoría */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.6rem 0.5rem 0.2rem 0.5rem',
          fontSize: '0.7rem',
          color: '#64748b',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <CheckCircle2 size={13} color="#10b981" />
          <span>Factor de recargo FOSE y precios LER/FISE 100% sincronizados con Botón 3</span>
        </span>
        <span style={{ color: '#fda4af', fontWeight: 600 }}>
          3 conceptos normativos auditables
        </span>
      </div>
    </div>
  );
};

export default CardOtrosCargosNormativos;
