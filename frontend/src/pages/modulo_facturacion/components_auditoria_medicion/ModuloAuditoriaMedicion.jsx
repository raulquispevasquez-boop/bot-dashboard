import React, { useState, useMemo, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
  ChevronDown,
  RefreshCw,
  Sliders,
  ShieldAlert,
  Zap,
  Sparkles,
  TrendingUp,
  Maximize2,
  X,
  Calculator,
  Search,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';

import {
  obtenerCortesReales,
  obtenerConfigImputacion,
  guardarConfigImputacion,
  procesarAuditoriaSeries,
  ejecutarImputacionR2,
  formatearFechaDDMMYYYY,
} from './utils/auditoriaMedicionService';
import GestorCortesEnergia from './components/GestorCortesEnergia';
import ModalCriteriosIdentificacionDatos from './components/ModalCriteriosIdentificacionDatos';
import { obtenerTextoCSVEnergia } from '../components_calculos_factura/utils/calculoEnergiaService';
import { parsearCSV } from '../components_registro_energia/utils/analisisEnergiaUtils';
import { obtenerDatosPotenciaActivos } from '../components_registro_potencia/utils/buscarPotenciaCoincidente';
import { aplicarMedidoresVirtuales } from '../medidores_virtuales/useMedidoresVirtuales';

const formatearNumero = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || isNaN(Number(valor))) return '—';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

const ModuloAuditoriaMedicion = () => {
  const [cortes, setCortes] = useState(() => obtenerCortesReales());
  const [configImputacion, setConfigImputacion] = useState(() => obtenerConfigImputacion());
  const [modalCortesAbierto, setModalCortesAbierto] = useState(false);
  const [modalInfoCriteriosAbierto, setModalInfoCriteriosAbierto] = useState(false);
  const [circuitoSeleccionado, setCircuitoSeleccionado] = useState('virtual_default');
  const [diaZoomSeleccionado, setDiaZoomSeleccionado] = useState(null); // null = mes completo, or 'DD/MM/YYYY'
  const [graficoMaximizado, setGraficoMaximizado] = useState(null); // 'energia' | 'potencia' | 'reconstruccion' | null

  // Cargar datos de Energía y Potencia
  const dataCSV = useMemo(() => obtenerTextoCSVEnergia(), []);
  const datosPotencia = useMemo(() => obtenerDatosPotenciaActivos(), []);

  // Parsear registros de energía
  const { registrosEnergia, columnasEnergia } = useMemo(() => {
    let factor = 0.001;
    try {
      const fg = localStorage.getItem('facturacion_cliente_libre_energia_factor');
      if (fg !== null && !isNaN(parseFloat(fg))) factor = parseFloat(fg);
    } catch (e) {}

    const { registros: regBase, columnas: colBase } = parsearCSV(dataCSV.texto, factor);
    let listaMV = [];
    try {
      const gMV = localStorage.getItem('facturacion_cliente_libre_medidores_virtuales_v1');
      if (gMV) listaMV = JSON.parse(gMV);
    } catch (e) {}
    const { registros, columnas } = aplicarMedidoresVirtuales(regBase, colBase, listaMV);
    return { registrosEnergia: registros, columnasEnergia: columnas };
  }, [dataCSV]);

  // Circuito activo
  const columnaKey = useMemo(() => {
    if (circuitoSeleccionado === 'virtual_default') {
      const virt = columnasEnergia.find((c) => c.esVirtual);
      if (virt) return virt.key;
      return 'total';
    }
    return circuitoSeleccionado;
  }, [circuitoSeleccionado, columnasEnergia]);

  // Escuchar cambios de cortes reales
  useEffect(() => {
    const handleCortes = (e) => {
      setCortes(e.detail || obtenerCortesReales());
    };
    window.addEventListener('cortes_reales_updated', handleCortes);
    return () => window.removeEventListener('cortes_reales_updated', handleCortes);
  }, []);

  // 1. Procesar Auditoría de Serie de Energía (kWh)
  const auditoriaEnergia = useMemo(() => {
    return procesarAuditoriaSeries({
      registros: registrosEnergia,
      columnas: columnasEnergia,
      columnaKey,
      cortes,
      criterioImputacion: configImputacion.criterioImputacion || 'estricto_telemetria',
      tipoSerie: 'energia',
    });
  }, [registrosEnergia, columnasEnergia, columnaKey, cortes, configImputacion.criterioImputacion]);

  // 2. Procesar Auditoría de Serie de Potencia (kW)
  const auditoriaPotencia = useMemo(() => {
    return procesarAuditoriaSeries({
      registros: datosPotencia.registros,
      columnas: datosPotencia.columnas,
      columnaKey,
      cortes,
      criterioImputacion: configImputacion.criterioImputacion || 'estricto_telemetria',
      tipoSerie: 'potencia',
    });
  }, [datosPotencia.registros, datosPotencia.columnas, columnaKey, cortes, configImputacion.criterioImputacion]);

  // 3. Ejecutar Algoritmo de Imputación R² con Perfil Trapezoidal
  const resultadoR2 = useMemo(() => {
    return ejecutarImputacionR2({
      serie: auditoriaEnergia.serie,
      cortes,
      perfilTrapecio: auditoriaEnergia.perfilTrapecio,
      tipoSerie: 'energia',
    });
  }, [auditoriaEnergia.serie, auditoriaEnergia.perfilTrapecio, cortes]);

  // Toggle de imputación
  const handleToggleImputacion = () => {
    const nuevo = {
      ...configImputacion,
      modoImputacionActivo: !configImputacion.modoImputacionActivo,
    };
    setConfigImputacion(nuevo);
    guardarConfigImputacion(nuevo);
  };

  // Filtrado de datos según Zoom Diario o Mes Completo
  const datosGraficos = useMemo(() => {
    const serie = resultadoR2.serieReconstruida;
    if (!serie || serie.length === 0) return [];
    if (diaZoomSeleccionado) {
      return serie.filter((p) => p.fecha === diaZoomSeleccionado);
    }
    // Para el mes completo, muestreo balanceado preservando puntos con fallas
    const paso = Math.ceil(serie.length / 380);
    return serie.filter((p, idx) => idx % paso === 0 || p.esHueco);
  }, [resultadoR2.serieReconstruida, diaZoomSeleccionado]);

  const datosGraficoPotencia = useMemo(() => {
    const serie = auditoriaPotencia.serie;
    if (!serie || serie.length === 0) return [];
    if (diaZoomSeleccionado) {
      return serie.filter((p) => p.fecha === diaZoomSeleccionado);
    }
    const paso = Math.ceil(serie.length / 380);
    return serie.filter((p, idx) => idx % paso === 0 || p.esHueco);
  }, [auditoriaPotencia.serie, diaZoomSeleccionado]);

  // Áreas sombreadas visibles en la vista actual (Mes completo o Día específico con Zoom)
  const areasVisibles = useMemo(() => {
    if (!diaZoomSeleccionado) {
      return auditoriaEnergia.areasSombreadas;
    }
    // Función auxiliar para convertir DD/MM/YYYY a YYYY-MM-DD para comparar fechas con precisión
    const aIsoDate = (dStr) => {
      if (!dStr) return '';
      const p = dStr.split('/');
      if (p.length === 3) return `${p[2]}-${p[1]}-${p[0]}`;
      return dStr;
    };
    const isoDia = aIsoDate(diaZoomSeleccionado);
    const areasDelDia = [];

    (auditoriaEnergia.areasSombreadas || []).forEach((a) => {
      const isoInicio = aIsoDate(a.fechaInicio);
      const isoFin = aIsoDate(a.fechaFin);
      if (isoInicio <= isoDia && isoFin >= isoDia) {
        const dInicio = isoInicio < isoDia ? `${diaZoomSeleccionado} 00:00` : a.displayInicio;
        const dFin = isoFin > isoDia ? `${diaZoomSeleccionado} 23:45` : a.displayFin;
        areasDelDia.push({
          ...a,
          id: `${a.id}_zoom_${diaZoomSeleccionado}`,
          displayInicio: dInicio,
          displayFin: dFin,
        });
      }
    });

    return areasDelDia;
  }, [auditoriaEnergia.areasSombreadas, diaZoomSeleccionado]);

  // Días destacados con problemas detectados automáticamente para acceso rápido
  const diasConProblemas = useMemo(() => {
    const mapDias = new Map();
    (auditoriaEnergia.huecos || []).forEach((h) => {
      if (h.fechaInicio && !mapDias.has(h.fechaInicio)) {
        const medidores = h.medidoresAfectados?.join(', ') || 'Medidor';
        mapDias.set(h.fechaInicio, {
          fecha: h.fechaInicio,
          label: `${h.fechaInicio.slice(0, 5)}: ${h.tipo === 'corte_real' ? 'Corte' : 'Falla'} (${medidores})`,
        });
      }
    });
    return Array.from(mapDias.values()).slice(0, 6);
  }, [auditoriaEnergia.huecos]);

  // Navegación día anterior / siguiente
  const handleCambiarDia = (delta) => {
    const dias = auditoriaEnergia.diasDisponibles;
    if (!dias || dias.length === 0) return;
    if (!diaZoomSeleccionado) {
      setDiaZoomSeleccionado(dias[0]);
      return;
    }
    const idx = dias.indexOf(diaZoomSeleccionado);
    const nuevoIdx = Math.max(0, Math.min(dias.length - 1, idx + delta));
    setDiaZoomSeleccionado(dias[nuevoIdx]);
  };

  // Tooltip personalizado detallado con fechas DD/MM/YYYY HH:mm y estado de pérdida
  const CustomTooltipGrafico = ({ active, payload, label, unidad = 'kWh' }) => {
    if (!active || !payload || !payload.length) return null;
    const punto = payload[0]?.payload;
    return (
      <div
        style={{
          background: '#090d16',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '0.65rem 0.85rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.85)',
          fontSize: '0.74rem',
          maxWidth: '320px',
        }}
      >
        <div style={{ fontWeight: 800, color: '#f8fafc', borderBottom: '1px solid #1e293b', paddingBottom: '0.35rem', marginBottom: '0.45rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📅 {punto?.fechaHora || label}</span>
          <span style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Slot {punto?.slotDia ? punto.slotDia + 1 : ''}/96</span>
        </div>

        {punto?.esHueco && (
          <div
            style={{
              background: punto.tipoEstado === 'corte_real' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
              border: `1px solid ${punto.tipoEstado === 'corte_real' ? '#ef4444' : '#f59e0b'}`,
              borderRadius: '5px',
              padding: '0.35rem 0.5rem',
              color: punto.tipoEstado === 'corte_real' ? '#fca5a5' : '#fde68a',
              fontWeight: 700,
              fontSize: '0.70rem',
              marginBottom: '0.5rem',
              lineHeight: 1.3,
            }}
          >
            ⚠️ {punto.etiquetaPerdida || punto.motivo || 'Pérdida de datos en telemetría'}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: '#cbd5e1' }}>
            <span>Valor Medido Real:</span>
            <strong style={{ color: punto?.esHueco ? '#f87171' : '#38bdf8', fontFamily: 'monospace' }}>
              {formatearNumero(punto?.valorOriginal, 2)} {unidad}
            </strong>
          </div>

          {punto?.fueImputado && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: '#a7f3d0' }}>
                <span>Aporte Imputado Trapecio:</span>
                <strong style={{ color: '#10b981', fontFamily: 'monospace' }}>
                  +{formatearNumero(punto?.valorImputado, 2)} {unidad}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: '#ffffff', borderTop: '1px dashed #334155', paddingTop: '0.3rem' }}>
                <span style={{ fontWeight: 800 }}>Reconstruido Total (R²):</span>
                <strong style={{ color: '#34d399', fontFamily: 'monospace', fontWeight: 900 }}>
                  {formatearNumero(punto?.valorFinal, 2)} {unidad}
                </strong>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
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
      {/* 1. Barra Superior con Título y Controles */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.65rem',
          borderBottom: '1px solid #1e293b',
          paddingBottom: '0.65rem',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              padding: '0.5rem',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Activity size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                Auditoría y Tratamiento de Medición
              </h2>
              <span
                style={{
                  fontSize: '0.66rem',
                  color: '#f87171',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '12px',
                  fontWeight: 700,
                }}
              >
                Auditoría Multi-Medidor & R²
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.73rem', color: '#94a3b8' }}>
              Detección de pérdidas por medidor físico/virtual, resaltado en rojo transparente e imputación trapezoidal homóloga
            </p>
          </div>
        </div>

        {/* Acciones y Selectores */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Selector de Circuito / Medidor */}
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
                fontSize: '0.73rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
              }}
            >
              <option value="virtual_default">🟣 Medidor Virtual Activo (Consolidado Planta)</option>
              <option value="total">⚡ Toda la Planta (Total Consolidado)</option>
              {columnasEnergia
                .filter((c) => !c.esVirtual)
                .map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.alias}
                  </option>
                ))}
            </select>
            <ChevronDown size={14} color="#94a3b8" style={{ position: 'absolute', right: '7px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          </div>

          {/* Botón Gestor de Cortes Reales */}
          <button
            type="button"
            onClick={() => setModalCortesAbierto(true)}
            style={{
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(185, 28, 28, 0.25) 100%)',
              border: '1px solid #ef4444',
              borderRadius: '6px',
              color: '#fca5a5',
              padding: '0.35rem 0.75rem',
              fontSize: '0.73rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <ShieldAlert size={14} />
            <span>Gestionar Cortes Reales ({cortes.filter((c) => c.activo).length})</span>
          </button>

          {/* Toggle de Criterio de Auditoría: Anti-Englobe (Estricto Telemetría) vs Ceros Anómalos */}
          <button
            type="button"
            onClick={() => {
              const nuevoCriterio = (configImputacion.criterioImputacion || 'estricto_telemetria') === 'imputar_ceros' ? 'estricto_telemetria' : 'imputar_ceros';
              const nuevo = { ...configImputacion, criterioImputacion: nuevoCriterio };
              setConfigImputacion(nuevo);
              guardarConfigImputacion(nuevo);
            }}
            title="Protección contra sobrefacturación: Si un medidor marca 0 Amperios (equipo apagado), no se imputa. Solo se imputa cuando hay pérdida real de señal (null / vacío / salto)."
            style={{
              background: (configImputacion.criterioImputacion || 'estricto_telemetria') === 'estricto_telemetria'
                ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.15) 0%, rgba(30, 58, 138, 0.25) 100%)'
                : 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(180, 83, 9, 0.25) 100%)',
              border: `1px solid ${(configImputacion.criterioImputacion || 'estricto_telemetria') === 'estricto_telemetria' ? '#38bdf8' : '#f59e0b'}`,
              borderRadius: '6px',
              color: (configImputacion.criterioImputacion || 'estricto_telemetria') === 'estricto_telemetria' ? '#38bdf8' : '#fbbf24',
              padding: '0.35rem 0.75rem',
              fontSize: '0.73rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <ShieldAlert size={14} />
            <span>
              {(configImputacion.criterioImputacion || 'estricto_telemetria') === 'estricto_telemetria'
                ? '🛡️ Anti-Englobe: Respetar 0A (Solo Señal Perdida)'
                : '⚡ Criterio Extendido (Imputar Ceros de Avería)'}
            </span>
          </button>

          {/* Botón InfoModal: Criterios de Identificación en Subida de Datos */}
          <button
            type="button"
            onClick={() => setModalInfoCriteriosAbierto(true)}
            title="1. ¿Cómo se identifica esto técnicamente en la subida de datos? Haz clic para ver la matriz y detalle del tratamiento."
            style={{
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.15) 0%, rgba(30, 58, 138, 0.25) 100%)',
              border: '1.5px solid #38bdf8',
              borderRadius: '6px',
              color: '#38bdf8',
              padding: '0.35rem 0.75rem',
              fontSize: '0.73rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 0 12px rgba(56, 189, 248, 0.3)',
              transition: 'all 0.15s ease',
            }}
          >
            <HelpCircle size={15} />
            <span>1. ¿Cómo se identifica en la subida? (i)</span>
          </button>

          {/* Toggle Principal de Facturación: Real vs Imputado */}
          <button
            type="button"
            onClick={handleToggleImputacion}
            style={{
              background: configImputacion.modoImputacionActivo
                ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              border: `1px solid ${configImputacion.modoImputacionActivo ? '#10b981' : '#475569'}`,
              borderRadius: '6px',
              color: '#ffffff',
              padding: '0.35rem 0.85rem',
              fontSize: '0.73rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              boxShadow: configImputacion.modoImputacionActivo ? '0 0 12px rgba(16, 185, 129, 0.35)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <Sparkles size={14} color={configImputacion.modoImputacionActivo ? '#a7f3d0' : '#94a3b8'} />
            <span>
              {configImputacion.modoImputacionActivo
                ? '✓ Imputación Trapezoidal R² Activa'
                : 'Modo: Facturación Medida Real (Sin Imputar)'}
            </span>
          </button>

          {/* Botón Acción Directa: Facturar con Datos Auditados */}
          <button
            type="button"
            onClick={() => {
              if (!configImputacion.modoImputacionActivo) {
                const nuevo = { ...configImputacion, modoImputacionActivo: true };
                setConfigImputacion(nuevo);
                guardarConfigImputacion(nuevo);
              }
              window.dispatchEvent(new CustomEvent('cambiar_boton_cliente_libre', { detail: { botonId: 4 } }));
            }}
            title="Aplica la imputación R² y abre los Cálculos de Factura C.L"
            style={{
              background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
              border: '1px solid #3b82f6',
              borderRadius: '6px',
              color: '#ffffff',
              padding: '0.35rem 0.85rem',
              fontSize: '0.73rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              boxShadow: '0 2px 10px rgba(37, 99, 235, 0.35)',
            }}
          >
            <Calculator size={14} />
            <span>Facturar con Datos Auditados (R²) ➔</span>
          </button>
        </div>
      </div>

      {/* 2. Barra de Control de Zoom Diario (Requerimiento Clave) */}
      <div
        style={{
          background: '#090e1a',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '0.5rem 0.75rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.65rem',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#94a3b8', fontSize: '0.74rem', fontWeight: 700 }}>
            <ZoomIn size={15} color="#38bdf8" />
            <span>Navegación / Zoom Temporal:</span>
          </div>

          {/* Botón Ver Mes Completo */}
          <button
            type="button"
            onClick={() => setDiaZoomSeleccionado(null)}
            style={{
              background: !diaZoomSeleccionado ? '#1e293b' : '#0f172a',
              border: `1px solid ${!diaZoomSeleccionado ? '#38bdf8' : '#334155'}`,
              color: !diaZoomSeleccionado ? '#ffffff' : '#94a3b8',
              borderRadius: '6px',
              padding: '0.28rem 0.65rem',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <Calendar size={13} />
            <span>📅 Ver Mes Completo (Agosto 2026)</span>
          </button>

          {/* Selector de Día Específico */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <button
              type="button"
              onClick={() => handleCambiarDia(-1)}
              title="Día Anterior"
              disabled={!diaZoomSeleccionado || diaZoomSeleccionado === auditoriaEnergia.diasDisponibles[0]}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                color: '#cbd5e1',
                borderRadius: '5px',
                padding: '0.25rem 0.4rem',
                cursor: 'pointer',
                opacity: (!diaZoomSeleccionado || diaZoomSeleccionado === auditoriaEnergia.diasDisponibles[0]) ? 0.4 : 1,
              }}
            >
              <ChevronLeft size={14} />
            </button>

            <select
              value={diaZoomSeleccionado || ''}
              onChange={(e) => setDiaZoomSeleccionado(e.target.value || null)}
              style={{
                background: diaZoomSeleccionado ? '#172554' : '#0f172a',
                border: `1px solid ${diaZoomSeleccionado ? '#3b82f6' : '#334155'}`,
                borderRadius: '5px',
                padding: '0.28rem 0.55rem',
                color: '#ffffff',
                fontSize: '0.72rem',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">🔍 Zoom al Día: Seleccionar (01/08 a 31/08)...</option>
              {auditoriaEnergia.diasDisponibles.map((dia) => (
                <option key={dia} value={dia}>
                  📆 Día {dia} {dia >= '11/08/2026' ? '⚠️ (Pérdida Activa)' : '✓ (Normal)'}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => handleCambiarDia(1)}
              title="Día Siguiente"
              disabled={!diaZoomSeleccionado || diaZoomSeleccionado === auditoriaEnergia.diasDisponibles[auditoriaEnergia.diasDisponibles.length - 1]}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                color: '#cbd5e1',
                borderRadius: '5px',
                padding: '0.25rem 0.4rem',
                cursor: 'pointer',
                opacity: (!diaZoomSeleccionado || diaZoomSeleccionado === auditoriaEnergia.diasDisponibles[auditoriaEnergia.diasDisponibles.length - 1]) ? 0.4 : 1,
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Acceso Rápido a Días Críticos con Anomalías */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Días Críticos:</span>
          {diasConProblemas.map((d) => (
            <button
              key={d.fecha}
              type="button"
              onClick={() => setDiaZoomSeleccionado(d.fecha)}
              style={{
                background: diaZoomSeleccionado === d.fecha ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.12)',
                border: `1px solid ${diaZoomSeleccionado === d.fecha ? '#ef4444' : 'rgba(239, 68, 68, 0.35)'}`,
                borderRadius: '4px',
                padding: '0.2rem 0.45rem',
                color: '#fca5a5',
                fontSize: '0.67rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🔴 {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Banner de Métricas de Calidad de Datos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.65rem', flexShrink: 0 }}>
        {/* KPI 1: Disponibilidad */}
        <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.55rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Disponibilidad Telemetría:</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: auditoriaEnergia.metricas.disponibilidadPct > 98 ? '#10b981' : '#f59e0b', fontFamily: 'monospace' }}>
              {auditoriaEnergia.metricas.disponibilidadPct}%
            </div>
          </div>
          <span style={{ fontSize: '0.65rem', color: '#64748b' }}>{auditoriaEnergia.metricas.registrosValidos} / {auditoriaEnergia.metricas.totalRegistros} válidos</span>
        </div>

        {/* KPI 2: Huecos Detectados vs 0A Protegidos */}
        <div
          onClick={() => setModalInfoCriteriosAbierto(true)}
          title="Haz clic para ver la matriz técnica: ¿Cómo se identifica en la subida de datos y cuál es su tratamiento?"
          style={{
            background: '#090d16',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            padding: '0.55rem 0.85rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#38bdf8'; e.currentTarget.style.boxShadow = '0 0 10px rgba(56, 189, 248, 0.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <div>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>Pérdidas de Señal (Imputables):</span>
              <Info size={12} color="#38bdf8" />
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#f87171', fontFamily: 'monospace' }}>
              {auditoriaEnergia.metricas.huecosPerdidaSenal} fallas
            </div>
          </div>
          <span style={{ fontSize: '0.65rem', color: '#cbd5e1' }}>
            <span style={{ color: '#38bdf8', fontWeight: 700 }}>{auditoriaEnergia.metricas.intervalosCeroAmperios} lecturas 0A (protegidas)</span> | <span style={{ color: '#ef4444' }}>{auditoriaEnergia.metricas.huecosCorteReal} cortes</span>
          </span>
        </div>

        {/* KPI 3: Coeficiente R² */}
        <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.55rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Coeficiente R² de Ajuste:</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#38bdf8', fontFamily: 'monospace' }}>
              R² = {resultadoR2.r2}
            </div>
          </div>
          <span style={{ fontSize: '0.65rem', color: '#38bdf8', fontWeight: 700, background: 'rgba(56, 189, 248, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
            Ajuste Trapezoidal
          </span>
        </div>

        {/* KPI 4: Energía Recuperada */}
        <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.55rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Energía Faltante Imputada:</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#a78bfa', fontFamily: 'monospace' }}>
              +{formatearNumero(resultadoR2.energiaRecuperada_kWh, 1)} kWh
            </div>
          </div>
          <span style={{ fontSize: '0.65rem', color: '#a78bfa' }}>
            +{(resultadoR2.energiaRecuperada_kWh / 1000).toFixed(2)} MWh {configImputacion.criterioImputacion === 'imputar_ceros' ? '(Ceros incluidos)' : '(Solo señal perdida)'}
          </span>
        </div>
      </div>

      {/* 4. Área de Scroll con los 3 Gráficos Temporales */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
          paddingRight: '0.35rem',
        }}
      >
        {/* GRÁFICO 1: SERIE TEMPORAL DE ENERGÍA (kWh) CON ÁREAS ROJAS TRANSPARENTES */}
        <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Zap size={16} color="#38bdf8" />
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase' }}>
                1. Serie Temporal de Energía Activa (kWh por Intervalo de 15 Minutos)
              </span>
              {diaZoomSeleccionado && (
                <span style={{ fontSize: '0.68rem', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.15)', border: '1px solid #38bdf8', padding: '1px 6px', borderRadius: '8px', fontWeight: 700 }}>
                  🔍 Vista Día: {diaZoomSeleccionado} (96 lecturas)
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span style={{ fontSize: '0.68rem', color: '#f87171', fontWeight: 600 }}>
                ■ Áreas rojas transparentes = Pérdida de datos por medidor físico / corte
              </span>
              <button
                type="button"
                onClick={() => setGraficoMaximizado('energia')}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  borderRadius: '5px',
                  padding: '0.2rem 0.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                }}
              >
                <Maximize2 size={13} />
                <span>Maximizar</span>
              </button>
            </div>
          </div>

          <div style={{ height: '215px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={datosGraficos} margin={{ top: 15, right: 15, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="displayTime" stroke="#64748b" tick={{ fontSize: 9 }} tickFormatter={(val) => diaZoomSeleccionado ? val.slice(11, 16) : val.slice(0, 5)} />
                <YAxis stroke="#64748b" tick={{ fontSize: 9 }} unit=" kWh" />
                <Tooltip content={<CustomTooltipGrafico unidad="kWh" />} />
                <Legend wrapperStyle={{ fontSize: '0.72rem' }} />

                {/* ÁREAS ROJAS TRANSPARENTES DE PÉRDIDA DE DATOS */}
                {areasVisibles.map((area, idx) => {
                  const isCorte = area.tipo === 'corte_real';
                  const labelPos = idx % 2 === 0 ? 'insideTop' : 'insideBottom';
                  const textoLabel = area.etiquetaCorta || area.etiqueta;

                  if (area.displayInicio === area.displayFin) {
                    return (
                      <ReferenceLine
                        key={area.id || idx}
                        x={area.displayInicio}
                        stroke="#ef4444"
                        strokeWidth={2}
                        strokeDasharray="3 3"
                        label={{ value: textoLabel, fill: isCorte ? '#f87171' : '#fca5a5', fontSize: 9, position: 'top' }}
                      />
                    );
                  }
                  return (
                    <ReferenceArea
                      key={area.id || idx}
                      x1={area.displayInicio}
                      x2={area.displayFin}
                      fill="rgba(239, 68, 68, 0.22)"
                      stroke="#ef4444"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      label={{ value: textoLabel, fill: isCorte ? '#f87171' : '#fca5a5', fontSize: 9, fontWeight: 700, position: labelPos }}
                    />
                  );
                })}

                <Area type="monotone" dataKey="valorOriginal" name="Energía Medida (kWh)" stroke="#38bdf8" fill="rgba(56, 189, 248, 0.15)" strokeWidth={1.8} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* GRÁFICO 2: CURVA DE CARGA DE POTENCIA (kW) SINCRONIZADA */}
        <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <TrendingUp size={16} color="#c084fc" />
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase' }}>
                2. Curva de Carga de Demanda de Potencia Activa (kW)
              </span>
              {diaZoomSeleccionado && (
                <span style={{ fontSize: '0.68rem', color: '#c084fc', background: 'rgba(192, 132, 252, 0.15)', border: '1px solid #c084fc', padding: '1px 6px', borderRadius: '8px', fontWeight: 700 }}>
                  Perfil Diario Cuarto-Horario
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                Verificación de caída simultánea de potencia en demanda
              </span>
              <button
                type="button"
                onClick={() => setGraficoMaximizado('potencia')}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  borderRadius: '5px',
                  padding: '0.2rem 0.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                }}
              >
                <Maximize2 size={13} />
                <span>Maximizar</span>
              </button>
            </div>
          </div>

          <div style={{ height: '215px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={datosGraficoPotencia} margin={{ top: 15, right: 15, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="displayTime" stroke="#64748b" tick={{ fontSize: 9 }} tickFormatter={(val) => diaZoomSeleccionado ? val.slice(11, 16) : val.slice(0, 5)} />
                <YAxis stroke="#64748b" tick={{ fontSize: 9 }} unit=" kW" />
                <Tooltip content={<CustomTooltipGrafico unidad="kW" />} />
                <Legend wrapperStyle={{ fontSize: '0.72rem' }} />

                {/* ÁREAS ROJAS TRANSPARENTES */}
                {areasVisibles.map((area, idx) => {
                  const isCorte = area.tipo === 'corte_real';
                  const labelPos = idx % 2 === 0 ? 'insideTop' : 'insideBottom';
                  const textoLabel = area.etiquetaCorta || area.etiqueta;

                  if (area.displayInicio === area.displayFin) {
                    return (
                      <ReferenceLine
                        key={area.id || idx}
                        x={area.displayInicio}
                        stroke="#ef4444"
                        strokeWidth={2}
                        strokeDasharray="3 3"
                        label={{ value: textoLabel, fill: isCorte ? '#f87171' : '#fca5a5', fontSize: 9, position: 'top' }}
                      />
                    );
                  }
                  return (
                    <ReferenceArea
                      key={area.id || idx}
                      x1={area.displayInicio}
                      x2={area.displayFin}
                      fill="rgba(239, 68, 68, 0.22)"
                      stroke="#ef4444"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      label={{ value: textoLabel, fill: isCorte ? '#f87171' : '#fca5a5', fontSize: 9, fontWeight: 700, position: labelPos }}
                    />
                  );
                })}

                <Line type="monotone" dataKey="valorOriginal" name="Demanda Medida (kW)" stroke="#c084fc" strokeWidth={1.8} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* GRÁFICO 3: ALGORITMO DE RECONSTRUCCIÓN E IMPUTACIÓN R² TRAPEZOIDAL */}
        <div style={{ background: '#090d16', border: '1px solid #10b981', borderRadius: '8px', padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.45rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Sparkles size={16} color="#10b981" />
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase' }}>
                3. Reconstrucción Inteligente con Perfil Trapezoidal Diario y Algoritmo R²
              </span>
              <span style={{ fontSize: '0.66rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '1px 6px', borderRadius: '10px', fontWeight: 800 }}>
                R² = {resultadoR2.r2}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div style={{ fontSize: '0.68rem', color: '#a7f3d0' }}>
                Modelo: {resultadoR2.nombreMetodo}
              </div>
              <button
                type="button"
                onClick={() => setGraficoMaximizado('reconstruccion')}
                style={{
                  background: '#1e293b',
                  border: '1px solid #10b981',
                  color: '#a7f3d0',
                  borderRadius: '5px',
                  padding: '0.2rem 0.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                }}
              >
                <Maximize2 size={13} />
                <span>Maximizar</span>
              </button>
            </div>
          </div>

          <div style={{ height: '235px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={datosGraficos} margin={{ top: 15, right: 15, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="displayTime" stroke="#64748b" tick={{ fontSize: 9 }} tickFormatter={(val) => diaZoomSeleccionado ? val.slice(11, 16) : val.slice(0, 5)} />
                <YAxis stroke="#64748b" tick={{ fontSize: 9 }} unit=" kWh" />
                <Tooltip content={<CustomTooltipGrafico unidad="kWh" />} />
                <Legend wrapperStyle={{ fontSize: '0.72rem' }} />

                {/* ÁREAS ROJAS TRANSPARENTES DE PÉRDIDA */}
                {areasVisibles.map((area, idx) => {
                  const isCorte = area.tipo === 'corte_real';
                  const labelPos = idx % 2 === 0 ? 'insideTop' : 'insideBottom';
                  const textoLabel = area.etiquetaCorta || area.etiqueta;

                  if (area.displayInicio === area.displayFin) {
                    return (
                      <ReferenceLine
                        key={area.id || idx}
                        x={area.displayInicio}
                        stroke="#ef4444"
                        strokeWidth={2}
                        strokeDasharray="3 3"
                        label={{ value: textoLabel, fill: isCorte ? '#f87171' : '#fca5a5', fontSize: 9, position: 'top' }}
                      />
                    );
                  }
                  return (
                    <ReferenceArea
                      key={area.id || idx}
                      x1={area.displayInicio}
                      x2={area.displayFin}
                      fill="rgba(239, 68, 68, 0.22)"
                      stroke="#ef4444"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      label={{ value: textoLabel, fill: isCorte ? '#f87171' : '#fca5a5', fontSize: 9, fontWeight: 700, position: labelPos }}
                    />
                  );
                })}

                <Line type="monotone" dataKey="valorOriginal" name="Serie Real con Caídas/Huecos" stroke="#94a3b8" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
                <Line type="monotone" dataKey="valorFinal" name="Serie Reconstruida con Perfil Trapezoidal R²" stroke="#10b981" strokeWidth={2.4} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Ficha Técnica de la Estimación Trapezoidal */}
          <div
            style={{
              marginTop: '0.65rem',
              background: '#041712',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '6px',
              padding: '0.55rem 0.85rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              fontSize: '0.72rem',
            }}
          >
            <div>
              <strong style={{ color: '#10b981' }}>Perfil Trapezoidal & Validez Normativa:</strong> El consumo diario industrial sigue la curva trapezoidal homóloga (meseta diurna de alta producción). El coeficiente{' '}
              <strong>R² = {resultadoR2.r2}</strong> garantiza la reconstrucción del faltante de los medidores fuera de servicio.
            </div>
            <div style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>
              Energía Faltante Recuperada: <strong style={{ color: '#10b981' }}>+{formatearNumero(resultadoR2.energiaRecuperada_kWh, 1)} kWh</strong>
            </div>
          </div>
        </div>

        {/* 5. Tabla de Auditoría Detallada de Tramos con Huecos */}
        <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.75rem 1rem' }}>
          <div style={{ fontSize: '0.80rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span>Auditoría de Eventos con Pérdida de Datos o Cortes ({auditoriaEnergia.huecos.length} eventos reportados)</span>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
              Haz clic en "Zoom al Día" para ver las 96 lecturas y la meseta trapezoidal
            </span>
          </div>

          <div style={{ border: '1px solid #1e293b', borderRadius: '6px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#172033', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: '0.45rem 0.65rem' }}>#</th>
                  <th style={{ padding: '0.45rem 0.65rem' }}>Período / Intervalo (DD/MM/YYYY HH:mm)</th>
                  <th style={{ padding: '0.45rem 0.65rem' }}>Duración</th>
                  <th style={{ padding: '0.45rem 0.65rem' }}>Medidor(es) Afectado(s)</th>
                  <th style={{ padding: '0.45rem 0.65rem' }}>Clasificación</th>
                  <th style={{ padding: '0.45rem 0.65rem' }}>Tratamiento</th>
                  <th style={{ padding: '0.45rem 0.65rem' }}>Acción Zoom</th>
                </tr>
              </thead>
              <tbody>
                {auditoriaEnergia.huecos.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '1rem', textAlign: 'center', color: '#10b981', fontWeight: 600 }}>
                      ✓ Telemetría óptima. No se detectaron pérdidas de datos ni huecos de medición en este circuito.
                    </td>
                  </tr>
                ) : (
                  auditoriaEnergia.huecos.map((h, i) => (
                    <tr key={h.id || i} style={{ borderBottom: '1px solid #1e293b', background: h.tipo === 'corte_real' ? '#140c10' : '#090f1d' }}>
                      <td style={{ padding: '0.45rem 0.65rem', fontFamily: 'monospace', color: '#64748b' }}>{i + 1}</td>
                      <td style={{ padding: '0.45rem 0.65rem', fontFamily: 'monospace', color: '#f8fafc' }}>
                        {h.fechaInicio} {h.horaInicio} ➔ {h.fechaFin} {h.horaFin}
                      </td>
                      <td style={{ padding: '0.45rem 0.65rem', color: '#cbd5e1' }}>
                        {h.cantidadPuntos * 15} min ({h.cantidadPuntos} lecturas)
                      </td>
                      <td style={{ padding: '0.45rem 0.65rem' }}>
                        <span
                          style={{
                            fontSize: '0.67rem',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontWeight: 800,
                            background: 'rgba(239, 68, 68, 0.18)',
                            color: '#fca5a5',
                            border: '1px solid #ef4444',
                          }}
                        >
                          {h.medidoresAfectados?.join(' + ') || 'PLANTA AGUA HELADA'}
                        </span>
                      </td>
                      <td style={{ padding: '0.45rem 0.65rem' }}>
                        <span
                          style={{
                            fontSize: '0.66rem',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontWeight: 700,
                            background: h.tipo === 'corte_real' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(56, 189, 248, 0.18)',
                            color: h.tipo === 'corte_real' ? '#f87171' : '#38bdf8',
                            border: `1px solid ${h.tipo === 'corte_real' ? '#ef4444' : '#38bdf8'}`,
                          }}
                        >
                          {h.tipo === 'corte_real' ? '🔴 Corte Real / Outage' : '🟡 Falla de Telemetría'}
                        </span>
                      </td>
                      <td style={{ padding: '0.45rem 0.65rem', color: h.tipo === 'corte_real' ? '#fca5a5' : '#86efac', fontWeight: 700 }}>
                        {h.tipo === 'corte_real' ? 'Excluido (0 kW real)' : 'Imputado con Perfil R²'}
                      </td>
                      <td style={{ padding: '0.45rem 0.65rem' }}>
                        <button
                          type="button"
                          onClick={() => setDiaZoomSeleccionado(h.fechaInicio)}
                          style={{
                            background: '#1e293b',
                            border: '1px solid #38bdf8',
                            color: '#38bdf8',
                            borderRadius: '4px',
                            padding: '0.15rem 0.45rem',
                            fontSize: '0.67rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                          }}
                        >
                          <Search size={11} />
                          <span>Zoom {h.fechaInicio.slice(0, 5)}</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Gestor de Cortes Reales */}
      <GestorCortesEnergia
        abierto={modalCortesAbierto}
        onClose={() => setModalCortesAbierto(false)}
        onCortesActualizados={(nuevosCortes) => setCortes(nuevosCortes)}
      />

      {/* Modal Informativo: ¿Cómo se identifica esto técnicamente en la subida de datos? */}
      <ModalCriteriosIdentificacionDatos
        abierto={modalInfoCriteriosAbierto}
        onClose={() => setModalInfoCriteriosAbierto(false)}
        metricas={auditoriaEnergia.metricas}
        criterioActual={configImputacion.criterioImputacion}
      />

      {/* Modal de Gráfica Maximizada */}
      {graficoMaximizado && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(11, 17, 32, 0.88)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              background: '#090d16',
              border: '1.5px solid #38bdf8',
              borderRadius: '12px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
              width: '100%',
              maxWidth: '1200px',
              height: '88vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '1.25rem',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Maximize2 size={18} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#ffffff' }}>
                  {graficoMaximizado === 'energia' && '1. Serie Temporal de Energía Activa (kWh) - Vista Maximizada'}
                  {graficoMaximizado === 'potencia' && '2. Curva de Carga de Demanda de Potencia (kW) - Vista Maximizada'}
                  {graficoMaximizado === 'reconstruccion' && '3. Curva Reconstruida con Perfil Trapezoidal R² - Vista Maximizada'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGraficoMaximizado(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '0.4rem',
                  borderRadius: '6px',
                }}
              >
                <X size={22} />
              </button>
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                {graficoMaximizado === 'energia' ? (
                  <ComposedChart data={datosGraficos} margin={{ top: 15, right: 25, left: 10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="displayTime" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} unit=" kWh" />
                    <Tooltip content={<CustomTooltipGrafico unidad="kWh" />} />
                    <Legend wrapperStyle={{ fontSize: '0.85rem' }} />
                    {areasVisibles.map((area, idx) => (
                      <ReferenceArea
                        key={area.id || idx}
                        x1={area.displayInicio}
                        x2={area.displayFin}
                        fill="rgba(239, 68, 68, 0.22)"
                        stroke="#ef4444"
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        label={{
                          value: area.etiquetaCorta || area.etiqueta,
                          fill: area.tipo === 'corte_real' ? '#f87171' : '#fca5a5',
                          fontSize: 10,
                          fontWeight: 700,
                          position: idx % 2 === 0 ? 'insideTop' : 'insideBottom',
                        }}
                      />
                    ))}
                    <Area type="monotone" dataKey="valorOriginal" name="Energía Medida (kWh)" stroke="#38bdf8" fill="rgba(56, 189, 248, 0.25)" strokeWidth={2} />
                  </ComposedChart>
                ) : graficoMaximizado === 'potencia' ? (
                  <ComposedChart data={datosGraficoPotencia} margin={{ top: 15, right: 25, left: 10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="displayTime" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} unit=" kW" />
                    <Tooltip content={<CustomTooltipGrafico unidad="kW" />} />
                    <Legend wrapperStyle={{ fontSize: '0.85rem' }} />
                    {areasVisibles.map((area, idx) => (
                      <ReferenceArea
                        key={area.id || idx}
                        x1={area.displayInicio}
                        x2={area.displayFin}
                        fill="rgba(239, 68, 68, 0.22)"
                        stroke="#ef4444"
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        label={{
                          value: area.etiquetaCorta || area.etiqueta,
                          fill: area.tipo === 'corte_real' ? '#f87171' : '#fca5a5',
                          fontSize: 10,
                          fontWeight: 700,
                          position: idx % 2 === 0 ? 'insideTop' : 'insideBottom',
                        }}
                      />
                    ))}
                    <Line type="monotone" dataKey="valorOriginal" name="Demanda Medida (kW)" stroke="#c084fc" strokeWidth={2.2} dot={false} />
                  </ComposedChart>
                ) : (
                  <ComposedChart data={datosGraficos} margin={{ top: 15, right: 25, left: 10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="displayTime" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} unit=" kWh" />
                    <Tooltip content={<CustomTooltipGrafico unidad="kWh" />} />
                    <Legend wrapperStyle={{ fontSize: '0.85rem' }} />
                    {areasVisibles.map((area, idx) => (
                      <ReferenceArea
                        key={area.id || idx}
                        x1={area.displayInicio}
                        x2={area.displayFin}
                        fill="rgba(239, 68, 68, 0.22)"
                        stroke="#ef4444"
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        label={{
                          value: area.etiquetaCorta || area.etiqueta,
                          fill: area.tipo === 'corte_real' ? '#f87171' : '#fca5a5',
                          fontSize: 10,
                          fontWeight: 700,
                          position: idx % 2 === 0 ? 'insideTop' : 'insideBottom',
                        }}
                      />
                    ))}
                    <Line type="monotone" dataKey="valorOriginal" name="Serie Real con Caídas/Huecos" stroke="#94a3b8" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="valorFinal" name="Serie Reconstruida con Perfil Trapezoidal R²" stroke="#10b981" strokeWidth={2.5} dot={false} />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModuloAuditoriaMedicion;
