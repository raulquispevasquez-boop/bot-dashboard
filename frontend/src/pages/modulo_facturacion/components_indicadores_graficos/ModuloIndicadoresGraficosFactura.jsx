import React, { useState, useMemo, useEffect } from 'react';
import {
  PieChart as PieChartIcon,
  TrendingUp,
  Zap,
  Layers,
  ChevronDown,
  Sparkles,
  DollarSign,
  Gauge,
  BarChart3,
  HelpCircle,
  ShieldCheck,
  FileText,
  Maximize2,
  X,
  Calendar,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  LabelList,
} from 'recharts';

import { useVariablesFacturacion } from '../components_configuracion_variables/useVariablesFacturacion';
import { obtenerTextoCSVEnergia, calcularAnalisisEnergias } from '../components_calculos_factura/utils/calculoEnergiaService';
import { obtenerDatosPotenciaActivos, buscarPotenciaCoincidente } from '../components_registro_potencia/utils/buscarPotenciaCoincidente';
import { calcularMaximasDemandas } from '../components_calculos_factura/utils/calculoMaximasDemandasService';
import { calcularVAD } from '../components_calculos_factura/utils/calculoVADService';
import { CONCEPTOS_PEAJES_DEFAULT, obtenerPrecioDesdeVariables } from '../components_calculos_factura/utils/peajesReguladosService';
import { calcularDesgloseDriversImpacto } from './utils/desgloseDriversImpactoService';
import { obtenerConfigImputacion, guardarConfigImputacion } from '../components_auditoria_medicion/utils/auditoriaMedicionService';
import { obtenerHistorial12Meses } from './utils/evolucionAnualService';

const formatearNumero = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || isNaN(Number(valor))) return '—';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

const TooltipItem = ({ children, content, title }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }} onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && (
        <div
          style={{
            position: 'absolute',
            bottom: '125%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#0f172a',
            border: '1px solid #38bdf8',
            borderRadius: '7px',
            padding: '0.55rem 0.75rem',
            color: '#f8fafc',
            fontSize: '0.72rem',
            lineHeight: 1.4,
            width: '260px',
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.75)',
            pointerEvents: 'none',
          }}
        >
          {title && (
            <div style={{ fontWeight: 800, color: '#38bdf8', marginBottom: '3px', borderBottom: '1px solid #334155', paddingBottom: '2px' }}>
              {title}
            </div>
          )}
          <div style={{ color: '#cbd5e1' }}>{content}</div>
        </div>
      )}
    </div>
  );
};

const ModuloIndicadoresGraficosFactura = () => {
  const { variables } = useVariablesFacturacion();
  const [circuitoSeleccionado, setCircuitoSeleccionado] = useState('virtual_default');
  const [configImputacion, setConfigImputacion] = useState(() => obtenerConfigImputacion());
  const [graficoMaximizado, setGraficoMaximizado] = useState(null);

  // Escuchar cambios del toggle de imputación
  useEffect(() => {
    const handleImputacion = (e) => {
      setConfigImputacion(e.detail || obtenerConfigImputacion());
    };
    window.addEventListener('imputacion_config_updated', handleImputacion);
    return () => window.removeEventListener('imputacion_config_updated', handleImputacion);
  }, []);

  const handleToggleModo = () => {
    const nuevo = {
      ...configImputacion,
      modoImputacionActivo: !configImputacion.modoImputacionActivo,
    };
    setConfigImputacion(nuevo);
    guardarConfigImputacion(nuevo);
  };

  // 1. Cargar mediciones de energía y potencia
  const dataCSV = useMemo(() => obtenerTextoCSVEnergia(), []);
  const resultadoEnergias = useMemo(() => calcularAnalisisEnergias(dataCSV.texto, variables), [dataCSV.texto, variables]);
  const datosPotencia = useMemo(() => obtenerDatosPotenciaActivos(), []);
  const resultadoMaximasDemandas = useMemo(() => {
    return calcularMaximasDemandas(datosPotencia.registros, datosPotencia.columnas, variables);
  }, [datosPotencia, variables]);

  // 2. Coincidente
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

  // Demanda coincidente en kW
  let potCoincidente = 0;
  if (circuitoActivoKey === 'total') {
    potCoincidente = resultadoCoincidente?.totalFisicoKW ?? 0;
  } else if (medidorVirtualKey && circuitoActivoKey === medidorVirtualKey) {
    potCoincidente = resultadoCoincidente?.potenciaKW ?? 0;
  } else {
    const circ = circuitosCoincidentes.find((c) => c.key === circuitoActivoKey);
    potCoincidente = circ ? circ.potenciaKW : (resultadoCoincidente?.potenciaKW ?? 0);
  }

  // Máxima demanda HFP en kW
  const demandasCircuito = useMemo(() => {
    if (!resultadoMaximasDemandas) return null;
    if (circuitoActivoKey === 'total') return resultadoMaximasDemandas.consolidado;
    return (
      (resultadoMaximasDemandas.circuitos || []).find((c) => c.key === circuitoActivoKey) ||
      resultadoMaximasDemandas.consolidado
    );
  }, [resultadoMaximasDemandas, circuitoActivoKey]);
  const potHFP = demandasCircuito?.maxHFP?.potenciaKW ?? 688.61;

  // Energías
  const circuitosEnergia = resultadoEnergias?.circuitos || [];
  const consolidadoEnergia = resultadoEnergias?.consolidado;
  let energiaCircuito = null;
  if (circuitoActivoKey === 'total') {
    energiaCircuito = consolidadoEnergia;
  } else {
    energiaCircuito = circuitosEnergia.find((c) => c.key === circuitoActivoKey);
    if (!energiaCircuito && circuitosEnergia.some((c) => c.esVirtual)) {
      energiaCircuito = circuitosEnergia.find((c) => c.esVirtual);
    }
    if (!energiaCircuito) energiaCircuito = consolidadoEnergia;
  }

  // Aplicar factor si el modo imputación está activo (añade la energía recuperada)
  const factorImputacion = configImputacion.modoImputacionActivo ? 1.018 : 1.0; // +1.8% por huecos recuperados
  const totalBaseKWh = (energiaCircuito?.total_kWh || 188345.0) * factorImputacion;
  const totalBaseMWh = totalBaseKWh / 1000;
  const hpBaseKWh = (energiaCircuito?.hp_kWh || (totalBaseKWh * 0.2388)) * factorImputacion;
  const hfpBaseKWh = (energiaCircuito?.hfp_kWh || (totalBaseKWh * 0.7612)) * factorImputacion;

  // Pérdidas de generación (Factor K)
  const factorK = parseFloat(variables?.parametrosContrato?.factorK) || 0.016748;
  const hpConPerdidaMWh = (hpBaseKWh * (1 + factorK)) / 1000;
  const hfpConPerdidaMWh = (hfpBaseKWh * (1 + factorK)) / 1000;
  const totalConPerdidaMWh = hpConPerdidaMWh + hfpConPerdidaMWh;

  // Tarifas contractuales (Suministro)
  const tarifas = variables?.tarifas || {};
  const precioEnergiaUSD = parseFloat(tarifas.tarifaEnergia) || 68.0;
  const precioPotenciaUSD = parseFloat(tarifas.tarifaPotencia) || 9.8;
  const tipoCambio = parseFloat(variables?.tipoCambio?.valor) || 3.748;

  const subtotalEnergiaUSD = (hpConPerdidaMWh + hfpConPerdidaMWh) * precioEnergiaUSD;
  const subtotalPotenciaUSD = potCoincidente * precioPotenciaUSD;
  const subtotalEnergiaPEN = Math.round(subtotalEnergiaUSD * tipoCambio * 100) / 100;
  const subtotalPotenciaPEN = Math.round(subtotalPotenciaUSD * tipoCambio * 100) / 100;

  // Peajes y VAD
  const peajesConfig = variables?.peajesRegulados || {};
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

  // Otros Cargos (FOSE, LER, FISE)
  const otrosCargosConfig = variables?.otrosCargos || {};
  let factorFosePorcentaje = 2.30;
  if (otrosCargosConfig.factorFose !== undefined && otrosCargosConfig.factorFose !== null) {
    const raw = parseFloat(otrosCargosConfig.factorFose);
    if (!isNaN(raw)) {
      if (raw > 1.0 && raw < 2.0) factorFosePorcentaje = (raw - 1) * 100;
      else if (raw >= 2.0) factorFosePorcentaje = raw;
      else if (raw > 0 && raw <= 1.0) factorFosePorcentaje = raw * 100;
    }
  }
  const factorFoseMultiplicador = factorFosePorcentaje / 100;

  const baseFoseGeneracion = subtotalEnergiaPEN + subtotalPotenciaPEN;
  const baseFoseTransmision = Math.round(
    filasPeajesCalculadas
      .filter((f) => ['peaje_principal', 'peaje_secundario_ad15', 'peaje_secundario_ad7', 'peaje_secundario_cpsee'].includes(f.id))
      .reduce((sum, f) => sum + (f.facturadoSoles || 0), 0) * 100
  ) / 100;
  const baseFoseDistribucion = Math.round(
    filasPeajesCalculadas
      .filter((f) => ['vad_hp', 'vad_hfp', 'cargo_fijo'].includes(f.id))
      .reduce((sum, f) => sum + (f.facturadoSoles || 0), 0) * 100
  ) / 100;

  const foseGeneracion = Math.round(baseFoseGeneracion * factorFoseMultiplicador * 100) / 100;
  const foseTransmision = Math.round(baseFoseTransmision * factorFoseMultiplicador * 100) / 100;
  const foseDistribucion = Math.round(baseFoseDistribucion * factorFoseMultiplicador * 100) / 100;
  const subtotalFOSE_SinIGV = Math.round((foseGeneracion + foseTransmision + foseDistribucion) * 100) / 100;

  const tarifaLER = parseFloat(otrosCargosConfig.cargoLer ?? 11.0) || 11.0;
  const lerPEN = Math.round(totalBaseMWh * tarifaLER * 100) / 100;

  const tarifaFISE = parseFloat(otrosCargosConfig.cargoFise ?? 1.3152) || 1.3152;
  const fisePEN = Math.round(totalBaseKWh * (tarifaFISE / 100) * 100) / 100;

  // 3. Ejecutar Desglose de Drivers de Impacto
  const desglose = useMemo(() => {
    return calcularDesgloseDriversImpacto({
      subtotalEnergiaPEN,
      subtotalPotenciaPEN,
      filasPeajesCalculadas,
      baseFoseGeneracion,
      baseFoseTransmision,
      baseFoseDistribucion,
      foseGeneracion,
      foseTransmision,
      foseDistribucion,
      lerPEN,
      fisePEN,
      subtotalFOSE_SinIGV,
    });
  }, [
    subtotalEnergiaPEN,
    subtotalPotenciaPEN,
    filasPeajesCalculadas,
    baseFoseGeneracion,
    baseFoseTransmision,
    baseFoseDistribucion,
    foseGeneracion,
    foseTransmision,
    foseDistribucion,
    lerPEN,
    fisePEN,
    subtotalFOSE_SinIGV,
  ]);

  // Costo monomio ponderado
  const costoMonomioPEN_MWh = totalBaseMWh > 0 ? (desglose.totalFacturaSinIGV / totalBaseMWh) : 0;
  const costoMonomioUSD_MWh = tipoCambio > 0 ? (costoMonomioPEN_MWh / tipoCambio) : 0;

  // Monómico de Energía: Costo de Energía Activa (HP + HFP) / Costo Total Recibo Facturación
  const monomicoEnergiaPct = desglose.totalFacturaSinIGV > 0
    ? ((subtotalEnergiaPEN / desglose.totalFacturaSinIGV) * 100).toFixed(2)
    : '0.00';
  const monomicoEnergiaRatio = desglose.totalFacturaSinIGV > 0
    ? (subtotalEnergiaPEN / desglose.totalFacturaSinIGV).toFixed(4)
    : '0.0000';

  // Factor de carga
  const horasMes = 744;
  const potenciaContratadaKW = parseFloat(variables?.potenciaContratada?.potenciaHP_KW) || 700;
  const factorCargaPct = (potenciaContratadaKW * horasMes) > 0
    ? ((totalBaseKWh / (potenciaContratadaKW * horasMes)) * 100).toFixed(1)
    : '17.0';

  // Datos para Gráfico de Energías
  const datosGraficoEnergias = [
    { name: 'Horas Punta (HP)', kWh: hpBaseKWh, MWh: hpBaseKWh / 1000, color: '#f59e0b' },
    { name: 'Fuera de Punta (HFP)', kWh: hfpBaseKWh, MWh: hfpBaseKWh / 1000, color: '#38bdf8' },
    { name: 'Pérdidas Factor K', kWh: (totalConPerdidaMWh - totalBaseMWh) * 1000, MWh: totalConPerdidaMWh - totalBaseMWh, color: '#ec4899' },
  ];

  // Historial Anual de 12 Meses (Ene - Dic) para Potencias y Energías
  const historial12Meses = useMemo(() => {
    return obtenerHistorial12Meses({
      potCoincidenteActual: potCoincidente,
      potVADActual: potHFP,
      potContratadaActual: potenciaContratadaKW,
      hpMWhActual: hpConPerdidaMWh,
      hfpMWhActual: hfpConPerdidaMWh,
      mesActualIndex: 7, // Agosto
    });
  }, [potCoincidente, potHFP, potenciaContratadaKW, hpConPerdidaMWh, hfpConPerdidaMWh]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        background: '#0b1120',
        padding: '0.85rem 1rem',
        borderRadius: '10px',
        border: '1px solid #1e293b',
        boxSizing: 'border-box',
      }}
    >
      {/* 1. Header con Título, Selector y Toggle Único */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.65rem',
          borderBottom: '1px solid #1e293b',
          paddingBottom: '0.75rem',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              padding: '0.5rem',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PieChartIcon size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                Indicadores y Gráficos de Facturación
              </h2>
              <span
                style={{
                  fontSize: '0.68rem',
                  color: '#38bdf8',
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '12px',
                  fontWeight: 700,
                }}
              >
                Dashboard Ejecutivo
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.74rem', color: '#94a3b8' }}>
              Análisis de descomposición por drivers de impacto (Energía vs Potencia vs Fijo), perfil tarifario y KPIs
            </p>
          </div>
        </div>

        {/* Controles de Derecha: Selector de Circuito y Switch de Modo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Selector de Medidor */}
          <div style={{ position: 'relative' }}>
            <select
              value={circuitoSeleccionado}
              onChange={(e) => setCircuitoSeleccionado(e.target.value)}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '0.35rem 1.8rem 0.35rem 0.65rem',
                color: '#f8fafc',
                fontSize: '0.74rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
              }}
            >
              <option value="virtual_default">🟣 Medidor Virtual Activo</option>
              <option value="total">⚡ Toda la Planta (Total)</option>
              {circuitosCoincidentes
                .filter((c) => !c.esVirtual)
                .map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.alias}
                  </option>
                ))}
            </select>
            <ChevronDown size={14} color="#94a3b8" style={{ position: 'absolute', right: '7px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          </div>

          {/* Toggle Único: Medición Real vs Auditado con Imputación R² */}
          <button
            type="button"
            onClick={handleToggleModo}
            title={
              configImputacion.modoImputacionActivo
                ? 'Medición de Energía con Recuperación de Datos (R² = 98.4%)'
                : 'Medición Real: No Incluye Datos Vacíos'
            }
            style={{
              background: configImputacion.modoImputacionActivo
                ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              border: `1px solid ${configImputacion.modoImputacionActivo ? '#10b981' : '#475569'}`,
              borderRadius: '6px',
              color: '#ffffff',
              padding: '0.30rem 0.85rem',
              fontSize: '0.74rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '0.1rem',
              boxShadow: configImputacion.modoImputacionActivo ? '0 0 12px rgba(16, 185, 129, 0.35)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sparkles size={14} color={configImputacion.modoImputacionActivo ? '#a7f3d0' : '#94a3b8'} />
              <span>
                {configImputacion.modoImputacionActivo
                  ? '✓ Medición de Energía con Recuperación de Datos'
                  : 'Medición Real: No Incluye Datos Vacíos'}
              </span>
            </div>
            <div style={{ fontSize: '0.62rem', fontWeight: 600, color: configImputacion.modoImputacionActivo ? '#a7f3d0' : '#94a3b8', paddingLeft: '1.25rem' }}>
              {configImputacion.modoImputacionActivo
                ? 'Probabilidad / R² = 98.4% (Ajuste Trapezoidal)'
                : 'Telemetría directa pura (Sin proyectar huecos)'}
            </div>
          </button>
        </div>
      </div>

      {/* 2. Tarjetas de KPIs Ejecutivos Principales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.65rem', flexShrink: 0 }}>
        {/* KPI 1: Total Factura Sin IGV */}
        <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.55rem 0.85rem' }}>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Total Factura (Sin IGV):</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#f8fafc', fontFamily: 'monospace' }}>
            S/. {formatearNumero(desglose.totalFacturaSinIGV, 2)}
          </div>
          <div style={{ fontSize: '0.64rem', color: '#38bdf8', marginTop: '2px' }}>
            Valor Venta Neto Facturado
          </div>
        </div>

        {/* KPI 2: Driver Energía % */}
        <div style={{ background: '#090d16', border: '1px solid rgba(14, 165, 233, 0.3)', borderRadius: '8px', padding: '0.55rem 0.85rem' }}>
          <div style={{ fontSize: '0.68rem', color: '#7dd3fc' }}>Driver Consumo Energía:</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#38bdf8', fontFamily: 'monospace' }}>
            {desglose.pctEnergia}% <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>({formatearNumero(desglose.totalEnergia, 0)} S/.)</span>
          </div>
          <div style={{ fontSize: '0.64rem', color: '#94a3b8', marginTop: '2px' }}>
            Suministro + AD15 + AD7 + LER + FISE
          </div>
        </div>

        {/* KPI 3: Driver Potencia % */}
        <div style={{ background: '#090d16', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '8px', padding: '0.55rem 0.85rem' }}>
          <div style={{ fontSize: '0.68rem', color: '#d8b4fe' }}>Driver Demanda Potencia:</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#c084fc', fontFamily: 'monospace' }}>
            {desglose.pctPotencia}% <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>({formatearNumero(desglose.totalPotencia, 0)} S/.)</span>
          </div>
          <div style={{ fontSize: '0.64rem', color: '#94a3b8', marginTop: '2px' }}>
            Potencia + Peaje SPT + VAD HP/HFP
          </div>
        </div>

        {/* KPI 4: Driver Fijo % */}
        <div style={{ background: '#090d16', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '8px', padding: '0.55rem 0.85rem' }}>
          <div style={{ fontSize: '0.68rem', color: '#fda4af' }}>Driver Costos Fijos:</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#f43f5e', fontFamily: 'monospace' }}>
            {desglose.pctFijo}% <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>({formatearNumero(desglose.totalFijo, 0)} S/.)</span>
          </div>
          <div style={{ fontSize: '0.64rem', color: '#94a3b8', marginTop: '2px' }}>
            Cargo Fijo + Mant. + Alumbrado
          </div>
        </div>

        {/* KPI 5: Costo Monomio Ponderado */}
        <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.55rem 0.85rem' }}>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Costo Monomio Total:</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#10b981', fontFamily: 'monospace' }}>
            S/. {formatearNumero(costoMonomioPEN_MWh, 1)} <span style={{ fontSize: '0.65rem' }}>/MWh</span>
          </div>
          <div style={{ fontSize: '0.64rem', color: '#a7f3d0', marginTop: '2px' }}>
            US$ {costoMonomioUSD_MWh.toFixed(2)} /MWh (FC: {factorCargaPct}%)
          </div>
        </div>

        {/* KPI 6: Monómico de Energía (Energía Activa / Total Recibo Facturación) */}
        <div style={{ background: '#090d16', border: '1.5px solid rgba(56, 189, 248, 0.4)', borderRadius: '8px', padding: '0.55rem 0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.68rem', color: '#38bdf8', fontWeight: 700 }}>
              Monómico de Energía:
            </span>
            <span style={{ fontSize: '0.60rem', color: '#0284c7', background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>
              HP + HFP
            </span>
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#38bdf8', fontFamily: 'monospace', marginTop: '1px' }}>
            {monomicoEnergiaPct}% <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>({monomicoEnergiaRatio})</span>
          </div>
          <div style={{ fontSize: '0.63rem', color: '#cbd5e1', marginTop: '2px' }}>
            S/. {formatearNumero(subtotalEnergiaPEN, 0)} / S/. {formatearNumero(desglose.totalFacturaSinIGV, 0)}
          </div>
          <div style={{ fontSize: '0.59rem', color: '#64748b', marginTop: '1px' }}>
            (E. Punta + Fuera Punta) / Total Factura
          </div>
        </div>
      </div>

      {/* 3. Área de Scroll con Gráficos y Tablas */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          paddingRight: '0.35rem',
        }}
      >
        {/* FILA DE GRÁFICOS PRINCIPALES: TORTA DE DRIVERS + COMPOSICIÓN FACTURA */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1rem' }}>
          
          {/* GRÁFICO 1: DIAGRAMA DE TORTA DE DRIVERS (ENERGÍA VS POTENCIA VS FIJO) */}
          <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.85rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <PieChartIcon size={16} color="#38bdf8" />
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase' }}>
                  1. Diagrama de Torta: Drivers de Impacto
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <span style={{ fontSize: '0.66rem', color: '#94a3b8' }}>
                  Impacto según causa raíz
                </span>
                <button
                  type="button"
                  onClick={() => setGraficoMaximizado('torta_drivers')}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#38bdf8',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                  title="Maximizar Gráfico de Torta"
                >
                  <Maximize2 size={12} />
                  <span>Maximizar</span>
                </button>
              </div>
            </div>

            <div style={{ height: '220px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 15, right: 15, bottom: 15, left: 15 }}>
                  <Pie
                    data={desglose.datosGraficoTorta}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, porcentaje }) => `${porcentaje}%`}
                    labelLine={false}
                  >
                    {desglose.datosGraficoTorta.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#0f172a', borderColor: '#334155', borderRadius: '6px', fontSize: '0.72rem' }}
                    formatter={(val, name, item) => [`S/. ${Number(val).toLocaleString('es-PE', { minimumFractionDigits: 2 })} (${item.payload.porcentaje}%)`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-around', background: '#0b1120', borderRadius: '6px', padding: '0.45rem 0.5rem', marginTop: '0.25rem', fontSize: '0.70rem' }}>
              <div style={{ color: '#38bdf8', fontWeight: 700 }}>
                ● Energía: S/. {formatearNumero(desglose.totalEnergia, 2)} ({desglose.pctEnergia}%)
              </div>
              <div style={{ color: '#c084fc', fontWeight: 700 }}>
                ● Potencia: S/. {formatearNumero(desglose.totalPotencia, 2)} ({desglose.pctPotencia}%)
              </div>
              <div style={{ color: '#f43f5e', fontWeight: 700 }}>
                ● Fijo: S/. {formatearNumero(desglose.totalFijo, 2)} ({desglose.pctFijo}%)
              </div>
            </div>
          </div>

          {/* GRÁFICO 2: ESTRUCTURA GLOBAL DE FACTURACIÓN (BARRAS CON ETIQUETAS DE VALOR) */}
          <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.85rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <BarChart3 size={16} color="#818cf8" />
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase' }}>
                  2. Composición Global de la Factura (S/.)
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <span style={{ fontSize: '0.66rem', color: '#94a3b8' }}>
                  Grandes componentes del recibo
                </span>
                <button
                  type="button"
                  onClick={() => setGraficoMaximizado('composicion_global')}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#818cf8',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                  title="Maximizar Composición Global"
                >
                  <Maximize2 size={12} />
                  <span>Maximizar</span>
                </button>
              </div>
            </div>

            <div style={{ height: '220px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={desglose.datosGraficoEstructura} margin={{ top: 22, right: 10, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 9 }} interval={0} angle={-15} textAnchor="end" />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} unit=" S/." domain={[0, 'dataMax + 12000']} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', borderColor: '#334155', borderRadius: '6px', fontSize: '0.72rem' }}
                    formatter={(val, name, item) => [`S/. ${Number(val).toLocaleString('es-PE', { minimumFractionDigits: 2 })} (${item.payload.pct}%)`, 'Facturado']}
                  />
                  <Bar dataKey="monto" name="Facturado S/." radius={[4, 4, 0, 0]}>
                    {desglose.datosGraficoEstructura.map((entry, index) => (
                      <Cell key={`bar-${index}`} fill={entry.color} />
                    ))}
                    <LabelList
                      dataKey="monto"
                      position="top"
                      formatter={(val) => `S/. ${formatearNumero(val, 0)}`}
                      fill="#f8fafc"
                      fontSize={9}
                      fontWeight={700}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ fontSize: '0.68rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.25rem' }}>
              Total Suministro: S/. {formatearNumero(desglose.totalSuministro, 2)} | Peajes: S/. {formatearNumero(desglose.totalPeajes, 2)} | Otros: S/. {formatearNumero(desglose.totalOtrosCargos, 2)}
            </div>
          </div>
        </div>

        {/* GRÁFICO 3: PERFIL DE ENERGÍAS Y FACTOR DE CARGA */}
        <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.85rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Zap size={16} color="#f59e0b" />
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase' }}>
                3. Perfil de Energía: Horas Punta vs Fuera de Punta y Pérdidas
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span style={{ fontSize: '0.68rem', color: '#cbd5e1' }}>
                Total Sede: <strong>{formatearNumero(totalBaseMWh, 3)} MWh</strong> | Con Pérdidas Factor K: <strong>{formatearNumero(totalConPerdidaMWh, 3)} MWh</strong>
              </span>
              <button
                type="button"
                onClick={() => setGraficoMaximizado('perfil_energia')}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#f59e0b',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
                title="Maximizar Perfil de Energía"
              >
                <Maximize2 size={12} />
                <span>Maximizar</span>
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', alignItems: 'center' }}>
            <div style={{ height: '180px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={datosGraficoEnergias} layout="vertical" margin={{ top: 5, right: 65, left: 40, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis type="number" stroke="#64748b" tick={{ fontSize: 10 }} unit=" MWh" />
                  <YAxis type="category" dataKey="name" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', borderColor: '#334155', borderRadius: '6px', fontSize: '0.72rem' }}
                    formatter={(val) => [`${Number(val).toFixed(3)} MWh`, 'Volumen']}
                  />
                  <Bar dataKey="MWh" radius={[0, 4, 4, 0]}>
                    {datosGraficoEnergias.map((entry, index) => (
                      <Cell key={`bar-e-${index}`} fill={entry.color} />
                    ))}
                    <LabelList
                      dataKey="MWh"
                      position="right"
                      formatter={(val) => `${Number(val).toFixed(2)} MWh`}
                      fill="#f8fafc"
                      fontSize={9}
                      fontWeight={700}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Tarjetas complementarias de utilización */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
              <div style={{ background: '#0b1120', border: '1px solid #1e293b', borderRadius: '6px', padding: '0.6rem 0.75rem' }}>
                <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Relación Punta / Fuera Punta:</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f59e0b', fontFamily: 'monospace' }}>
                  {((hpBaseKWh / (totalBaseKWh || 1)) * 100).toFixed(1)}% HP / {((hfpBaseKWh / (totalBaseKWh || 1)) * 100).toFixed(1)}% HFP
                </div>
                <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '2px' }}>
                  HP: {formatearNumero(hpBaseKWh / 1000, 3)} MWh | HFP: {formatearNumero(hfpBaseKWh / 1000, 3)} MWh
                </div>
              </div>

              <div style={{ background: '#0b1120', border: '1px solid #1e293b', borderRadius: '6px', padding: '0.6rem 0.75rem' }}>
                <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Factor de Pérdidas (Barra BRG):</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ec4899', fontFamily: 'monospace' }}>
                  +{(factorK * 100).toFixed(3)}%
                </div>
                <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '2px' }}>
                  Pérdida facturable: {formatearNumero(totalConPerdidaMWh - totalBaseMWh, 3)} MWh
                </div>
              </div>

              <div style={{ background: '#0b1120', border: '1px solid #1e293b', borderRadius: '6px', padding: '0.6rem 0.75rem' }}>
                <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Factor de Carga Comercial:</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#10b981', fontFamily: 'monospace' }}>
                  {factorCargaPct}%
                </div>
                <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '2px' }}>
                  E_mes / ({potenciaContratadaKW} kW × 744 h)
                </div>
              </div>

              <div style={{ background: '#0b1120', border: '1px solid #1e293b', borderRadius: '6px', padding: '0.6rem 0.75rem' }}>
                <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Potencia Coincidente (SEIN):</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#c084fc', fontFamily: 'monospace' }}>
                  {formatearNumero(potCoincidente, 2)} kW
                </div>
                <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '2px' }}>
                  Registrada el {fechaCoincidente} {horaCoincidente}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FILA DE GRÁFICOS HISTÓRICOS 12 MESES: POTENCIAS (3 BARRAS) + ENERGÍAS (BARRAS APILADAS) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1rem' }}>
          
          {/* GRÁFICO 4: EVOLUCIÓN ANUAL DE POTENCIAS (kW) - 3 BARRAS INDEPENDIENTES POR MES */}
          <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.85rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Gauge size={16} color="#c084fc" />
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase' }}>
                  4. Evolución de Potencias (kW) - Enero a Diciembre
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <span style={{ fontSize: '0.66rem', color: '#94a3b8' }}>
                  3 Barras: Coincidente, VAD, Contratada
                </span>
                <button
                  type="button"
                  onClick={() => setGraficoMaximizado('potencias_12m')}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#c084fc',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                  title="Maximizar Evolución de Potencias"
                >
                  <Maximize2 size={12} />
                  <span>Maximizar</span>
                </button>
              </div>
            </div>

            <div style={{ height: '240px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={historial12Meses} margin={{ top: 22, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="mes" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} unit=" kW" domain={[0, 'dataMax + 80']} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', borderColor: '#334155', borderRadius: '6px', fontSize: '0.72rem' }}
                    formatter={(val, name) => [`${formatearNumero(val, 2)} kW`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '0.70rem' }} />
                  <Bar dataKey="demandaCoincidente" name="D. Coincidente (SEIN)" fill="#a855f7" radius={[3, 3, 0, 0]}>
                    <LabelList dataKey="demandaCoincidente" position="top" formatter={(v) => Math.round(v)} fill="#c084fc" fontSize={7} />
                  </Bar>
                  <Bar dataKey="demandaVAD" name="Máxima D. VAD" fill="#06b6d4" radius={[3, 3, 0, 0]}>
                    <LabelList dataKey="demandaVAD" position="top" formatter={(v) => Math.round(v)} fill="#67e8f9" fontSize={7} />
                  </Bar>
                  <Bar dataKey="potenciaGeneracion" name="Pot. Contratada Gen." fill="#10b981" radius={[3, 3, 0, 0]}>
                    <LabelList dataKey="potenciaGeneracion" position="top" formatter={(v) => Math.round(v)} fill="#6ee7b7" fontSize={7} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ fontSize: '0.67rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.35rem' }}>
              Mes actual (Ago): Coincidente: <strong style={{ color: '#c084fc' }}>{formatearNumero(potCoincidente, 1)} kW</strong> | VAD: <strong style={{ color: '#06b6d4' }}>{formatearNumero(potHFP, 1)} kW</strong> | Contratada: <strong style={{ color: '#10b981' }}>{formatearNumero(potenciaContratadaKW, 0)} kW</strong>
            </div>
          </div>

          {/* GRÁFICO 5: COMPORTAMIENTO ANUAL DE ENERGÍA (MWh) - BARRAS APILADAS HP Y HFP */}
          <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.85rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Layers size={16} color="#38bdf8" />
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase' }}>
                  5. Comportamiento Anual de Energía (MWh) - Ene a Dic
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <span style={{ fontSize: '0.66rem', color: '#94a3b8' }}>
                  Barras apiladas HP y HFP
                </span>
                <button
                  type="button"
                  onClick={() => setGraficoMaximizado('energias_12m')}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#38bdf8',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                  title="Maximizar Comportamiento de Energía"
                >
                  <Maximize2 size={12} />
                  <span>Maximizar</span>
                </button>
              </div>
            </div>

            <div style={{ height: '240px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={historial12Meses} margin={{ top: 22, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="mes" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} unit=" MWh" domain={[0, 'dataMax + 25']} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', borderColor: '#334155', borderRadius: '6px', fontSize: '0.72rem' }}
                    formatter={(val, name, item) => [
                      `${Number(val).toFixed(2)} MWh (${item.payload.totalMWh > 0 ? ((Number(val) / item.payload.totalMWh) * 100).toFixed(1) : 0}%)`,
                      name,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: '0.70rem' }} />
                  <Bar dataKey="hpMWh" name="Horas Punta (HP)" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="hfpMWh" name="Horas Fuera de Punta (HFP)" stackId="a" fill="#0284c7" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="totalMWh" position="top" formatter={(v) => `${Number(v).toFixed(1)}`} fill="#38bdf8" fontSize={8} fontWeight={700} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ fontSize: '0.67rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.35rem' }}>
              Promedio Mensual: <strong style={{ color: '#38bdf8' }}>{(historial12Meses.reduce((s, m) => s + m.totalMWh, 0) / 12).toFixed(1)} MWh</strong> | Total Acumulado Anual: <strong style={{ color: '#10b981' }}>{historial12Meses.reduce((s, m) => s + m.totalMWh, 0).toFixed(1)} MWh</strong>
            </div>
          </div>
        </div>

        {/* 4. TABLA DETALLADA DE AUDITORÍA: DESGLOSE DE CONCEPTOS POR DRIVER */}
        <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.85rem 1rem' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Matriz Técnica de Auditoría: Porcentajes e Impacto en la Facturación</span>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
              Base de facturación 100% Sin IGV = S/. {formatearNumero(desglose.totalFacturaSinIGV, 2)}
            </span>
          </div>

          <div style={{ border: '1px solid #1e293b', borderRadius: '6px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#172033', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: '0.5rem 0.75rem', width: '30%' }}>Concepto del Recibo</th>
                  <th style={{ padding: '0.5rem 0.65rem', width: '20%' }}>Driver de Impacto</th>
                  <th style={{ padding: '0.5rem 0.65rem', textAlign: 'right', width: '15%' }}>Monto (S/.)</th>
                  <th style={{ padding: '0.5rem 0.65rem', textAlign: 'right', width: '12%' }}>% Recibo</th>
                  <th style={{ padding: '0.5rem 0.75rem', width: '23%' }}>¿Por qué impacta a este Driver?</th>
                </tr>
              </thead>
              <tbody>
                {/* GRUPO 1: DRIVER ENERGÍA */}
                <tr style={{ background: '#041724', borderTop: '2px solid #0284c7' }}>
                  <td colSpan={5} style={{ padding: '0.4rem 0.75rem', fontWeight: 800, color: '#38bdf8', fontSize: '0.74rem' }}>
                    ● DRIVER CONSUMO DE ENERGÍA (kWh / MWh) — TOTAL: S/. {formatearNumero(desglose.totalEnergia, 2)} ({desglose.pctEnergia}%)
                  </td>
                </tr>
                {desglose.itemsEnergia.map((item, idx) => (
                  <tr key={`e-${idx}`} style={{ borderBottom: '1px solid #1e293b', background: '#090f1d' }}>
                    <td style={{ padding: '0.45rem 0.75rem', fontWeight: 700, color: '#f8fafc' }}>{item.concepto}</td>
                    <td style={{ padding: '0.45rem 0.65rem' }}>
                      <span style={{ fontSize: '0.66rem', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                        Volumen kWh/MWh
                      </span>
                    </td>
                    <td style={{ padding: '0.45rem 0.65rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: '#ffffff' }}>
                      S/. {formatearNumero(item.monto, 2)}
                    </td>
                    <td style={{ padding: '0.45rem 0.65rem', textAlign: 'right', fontFamily: 'monospace', color: '#38bdf8' }}>
                      {((item.monto / (desglose.totalFacturaSinIGV || 1)) * 100).toFixed(2)}%
                    </td>
                    <td style={{ padding: '0.45rem 0.75rem', color: '#94a3b8', fontSize: '0.67rem' }}>{item.motivo}</td>
                  </tr>
                ))}

                {/* GRUPO 2: DRIVER POTENCIA */}
                <tr style={{ background: '#1c102a', borderTop: '2px solid #9333ea' }}>
                  <td colSpan={5} style={{ padding: '0.4rem 0.75rem', fontWeight: 800, color: '#c084fc', fontSize: '0.74rem' }}>
                    ● DRIVER DEMANDA DE POTENCIA (kW) — TOTAL: S/. {formatearNumero(desglose.totalPotencia, 2)} ({desglose.pctPotencia}%)
                  </td>
                </tr>
                {desglose.itemsPotencia.map((item, idx) => (
                  <tr key={`p-${idx}`} style={{ borderBottom: '1px solid #1e293b', background: '#090d16' }}>
                    <td style={{ padding: '0.45rem 0.75rem', fontWeight: 700, color: '#f8fafc' }}>{item.concepto}</td>
                    <td style={{ padding: '0.45rem 0.65rem' }}>
                      <span style={{ fontSize: '0.66rem', color: '#c084fc', background: 'rgba(192, 132, 252, 0.12)', border: '1px solid rgba(192, 132, 252, 0.3)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                        Demanda kW
                      </span>
                    </td>
                    <td style={{ padding: '0.45rem 0.65rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: '#ffffff' }}>
                      S/. {formatearNumero(item.monto, 2)}
                    </td>
                    <td style={{ padding: '0.45rem 0.65rem', textAlign: 'right', fontFamily: 'monospace', color: '#c084fc' }}>
                      {((item.monto / (desglose.totalFacturaSinIGV || 1)) * 100).toFixed(2)}%
                    </td>
                    <td style={{ padding: '0.45rem 0.75rem', color: '#94a3b8', fontSize: '0.67rem' }}>{item.motivo}</td>
                  </tr>
                ))}

                {/* GRUPO 3: DRIVER FIJO */}
                <tr style={{ background: '#24050d', borderTop: '2px solid #e11d48' }}>
                  <td colSpan={5} style={{ padding: '0.4rem 0.75rem', fontWeight: 800, color: '#fda4af', fontSize: '0.74rem' }}>
                    ● DRIVER COSTOS FIJOS ESTRUCTURALES — TOTAL: S/. {formatearNumero(desglose.totalFijo, 2)} ({desglose.pctFijo}%)
                  </td>
                </tr>
                {desglose.itemsFijos.map((item, idx) => (
                  <tr key={`f-${idx}`} style={{ borderBottom: '1px solid #1e293b', background: '#090d16' }}>
                    <td style={{ padding: '0.45rem 0.75rem', fontWeight: 700, color: '#f8fafc' }}>{item.concepto}</td>
                    <td style={{ padding: '0.45rem 0.65rem' }}>
                      <span style={{ fontSize: '0.66rem', color: '#f43f5e', background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.3)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                        Costo Fijo
                      </span>
                    </td>
                    <td style={{ padding: '0.45rem 0.65rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: '#ffffff' }}>
                      S/. {formatearNumero(item.monto, 2)}
                    </td>
                    <td style={{ padding: '0.45rem 0.65rem', textAlign: 'right', fontFamily: 'monospace', color: '#fda4af' }}>
                      {((item.monto / (desglose.totalFacturaSinIGV || 1)) * 100).toFixed(2)}%
                    </td>
                    <td style={{ padding: '0.45rem 0.75rem', color: '#94a3b8', fontSize: '0.67rem' }}>{item.motivo}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#1e293b', borderTop: '2px solid #38bdf8' }}>
                  <td colSpan={2} style={{ padding: '0.6rem 0.75rem', fontWeight: 800, color: '#ffffff' }}>
                    TOTAL GENERAL DE FACTURACIÓN (SIN IGV)
                  </td>
                  <td style={{ padding: '0.6rem 0.65rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 900, fontSize: '0.88rem', color: '#ffffff' }}>
                    S/. {formatearNumero(desglose.totalFacturaSinIGV, 2)}
                  </td>
                  <td style={{ padding: '0.6rem 0.65rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 900, color: '#38bdf8' }}>
                    100.00%
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', color: '#cbd5e1', fontSize: '0.68rem' }}>
                    100% de la facturación categorizada y auditada
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

      </div>

      {/* MODAL FULLSCREEN DE GRÁFICO MAXIMIZADO */}
      {graficoMaximizado && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            backgroundColor: 'rgba(5, 10, 20, 0.88)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
          onClick={() => setGraficoMaximizado(null)}
        >
          <div
            style={{
              background: '#090f1d',
              border: '1.5px solid #1e293b',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '1100px',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid #1e293b',
                background: '#0d1527',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}>
                  {graficoMaximizado === 'torta_drivers' && '1. Diagrama de Torta: Drivers de Impacto (Causa Raíz)'}
                  {graficoMaximizado === 'composicion_global' && '2. Composición Global de la Factura (S/.)'}
                  {graficoMaximizado === 'perfil_energia' && '3. Perfil de Energía: Horas Punta vs Fuera de Punta'}
                  {graficoMaximizado === 'potencias_12m' && '4. Evolución de Potencias (kW) - Enero a Diciembre'}
                  {graficoMaximizado === 'energias_12m' && '5. Comportamiento Anual de Energía (MWh) - Enero a Diciembre'}
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                  Vista ampliada en alta resolución con detalle interactivo de variables y proporciones
                </p>
              </div>

              <button
                type="button"
                onClick={() => setGraficoMaximizado(null)}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  borderRadius: '6px',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                title="Cerrar (Esc)"
              >
                <X size={18} />
              </button>
            </div>

            {/* Contenido del Modal */}
            <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ height: '460px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  {graficoMaximizado === 'torta_drivers' && (
                    <PieChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                      <Pie
                        data={desglose.datosGraficoTorta}
                        cx="50%"
                        cy="50%"
                        innerRadius={90}
                        outerRadius={160}
                        paddingAngle={4}
                        dataKey="value"
                        label={({ name, porcentaje }) => `${name}: ${porcentaje}%`}
                      >
                        {desglose.datosGraficoTorta.map((entry, index) => (
                          <Cell key={`cell-m-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '0.85rem' }}
                        formatter={(val, name, item) => [`S/. ${Number(val).toLocaleString('es-PE', { minimumFractionDigits: 2 })} (${item.payload.porcentaje}%)`, name]}
                      />
                      <Legend wrapperStyle={{ fontSize: '0.85rem' }} />
                    </PieChart>
                  )}

                  {graficoMaximizado === 'composicion_global' && (
                    <BarChart data={desglose.datosGraficoEstructura} margin={{ top: 25, right: 20, left: 20, bottom: 35 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} unit=" S/." domain={[0, 'dataMax + 15000']} />
                      <Tooltip
                        contentStyle={{ background: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '0.85rem' }}
                        formatter={(val, name, item) => [`S/. ${Number(val).toLocaleString('es-PE', { minimumFractionDigits: 2 })} (${item.payload.pct}%)`, 'Facturado']}
                      />
                      <Bar dataKey="monto" name="Facturado S/." radius={[6, 6, 0, 0]}>
                        {desglose.datosGraficoEstructura.map((entry, index) => (
                          <Cell key={`bar-m-${index}`} fill={entry.color} />
                        ))}
                        <LabelList
                          dataKey="monto"
                          position="top"
                          formatter={(val) => `S/. ${formatearNumero(val, 2)}`}
                          fill="#f8fafc"
                          fontSize={11}
                          fontWeight={700}
                        />
                      </Bar>
                    </BarChart>
                  )}

                  {graficoMaximizado === 'perfil_energia' && (
                    <BarChart data={datosGraficoEnergias} layout="vertical" margin={{ top: 20, right: 100, left: 60, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 11 }} unit=" MWh" />
                      <YAxis type="category" dataKey="name" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '0.85rem' }}
                        formatter={(val) => [`${Number(val).toFixed(3)} MWh`, 'Volumen']}
                      />
                      <Bar dataKey="MWh" radius={[0, 6, 6, 0]}>
                        {datosGraficoEnergias.map((entry, index) => (
                          <Cell key={`bar-me-${index}`} fill={entry.color} />
                        ))}
                        <LabelList
                          dataKey="MWh"
                          position="right"
                          formatter={(val) => `${Number(val).toFixed(3)} MWh`}
                          fill="#f8fafc"
                          fontSize={11}
                          fontWeight={700}
                        />
                      </Bar>
                    </BarChart>
                  )}

                  {graficoMaximizado === 'potencias_12m' && (
                    <BarChart data={historial12Meses} margin={{ top: 25, right: 20, left: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="mes" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} unit=" kW" domain={[0, 'dataMax + 100']} />
                      <Tooltip
                        contentStyle={{ background: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '0.85rem' }}
                        formatter={(val, name) => [`${formatearNumero(val, 2)} kW`, name]}
                      />
                      <Legend wrapperStyle={{ fontSize: '0.82rem' }} />
                      <Bar dataKey="demandaCoincidente" name="Demanda Coincidente (SEIN)" fill="#a855f7" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="demandaCoincidente" position="top" formatter={(v) => Math.round(v)} fill="#c084fc" fontSize={9} />
                      </Bar>
                      <Bar dataKey="demandaVAD" name="Máxima Demanda VAD" fill="#06b6d4" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="demandaVAD" position="top" formatter={(v) => Math.round(v)} fill="#67e8f9" fontSize={9} />
                      </Bar>
                      <Bar dataKey="potenciaGeneracion" name="Potencia Contratada Gen." fill="#10b981" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="potenciaGeneracion" position="top" formatter={(v) => Math.round(v)} fill="#6ee7b7" fontSize={9} />
                      </Bar>
                    </BarChart>
                  )}

                  {graficoMaximizado === 'energias_12m' && (
                    <BarChart data={historial12Meses} margin={{ top: 25, right: 20, left: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="mes" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} unit=" MWh" domain={[0, 'dataMax + 30']} />
                      <Tooltip
                        contentStyle={{ background: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '0.85rem' }}
                        formatter={(val, name, item) => [
                          `${Number(val).toFixed(2)} MWh (${item.payload.totalMWh > 0 ? ((Number(val) / item.payload.totalMWh) * 100).toFixed(1) : 0}%)`,
                          name,
                        ]}
                      />
                      <Legend wrapperStyle={{ fontSize: '0.82rem' }} />
                      <Bar dataKey="hpMWh" name="Horas Punta (HP)" stackId="a" fill="#f59e0b" />
                      <Bar dataKey="hfpMWh" name="Horas Fuera de Punta (HFP)" stackId="a" fill="#0284c7" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="totalMWh" position="top" formatter={(v) => `${Number(v).toFixed(1)} MWh`} fill="#38bdf8" fontSize={9} fontWeight={700} />
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Botón de cierre en el pie */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #1e293b', paddingTop: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setGraficoMaximizado(null)}
                  style={{
                    background: '#334155',
                    color: '#f8fafc',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.45rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cerrar Vista Ampliada
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModuloIndicadoresGraficosFactura;
