import React, { useState, useMemo, useEffect, useRef } from 'react';
import { History, TrendingUp, Archive, Save, Calendar, Cpu, Lock, CheckCircle2, ChevronDown, Check, Sparkles, Target } from 'lucide-react';
import { getTrelloCardStyle } from '../utils/trelloCardStyles';
import ModalGuardadoPersistencia from '../ModalGuardadoPersistencia';
import { formatearMesNombre } from '../utils/periodoFacturacionUtils';
import SelectorMesFacturacion from '../components/SelectorMesFacturacion';
import { obtenerDatosPotenciaActivos } from '../../components_registro_potencia/utils/buscarPotenciaCoincidente';
import { calcularMaximasDemandas } from '../../components_calculos_factura/utils/calculoMaximasDemandasService';
import { adaptarNombreAPotencia } from '../../medidores_virtuales/useMedidoresVirtuales';

const ACCENT = '#f59e0b';

const CardHistoricoPotencias = ({
  data,
  onUpdatePotencia,
  periodoFacturacion = '2026-08',
  onUpdatePeriodo,
  variablesConfig,
  onInyectarPotencias,
  onSelectCircuito,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [circuitoSeleccionado, setCircuitoSeleccionado] = useState(data?.circuitoSeleccionado || 'total');
  const [tabActiva, setTabActiva] = useState('ultimos12Meses');
  const [modalPersistencia, setModalPersistencia] = useState({ isOpen: false, detalle: null });
  const [validacionActiva, setValidacionActiva] = useState(null);
  const filaRefs = useRef({});

  // Sincronizar circuito seleccionado si viene en data
  useEffect(() => {
    if (data?.circuitoSeleccionado && data.circuitoSeleccionado !== circuitoSeleccionado) {
      setCircuitoSeleccionado(data.circuitoSeleccionado);
    }
  }, [data?.circuitoSeleccionado]);

  const handleCambioCircuito = (nuevoCircuito) => {
    setCircuitoSeleccionado(nuevoCircuito);
    if (onSelectCircuito) {
      onSelectCircuito(nuevoCircuito);
    }
  };

  // 1. Obtener cálculo automático de máximas demandas desde los registros cargados en Botón 2
  const resultadoMaximasDemandas = useMemo(() => {
    try {
      const datosPotencia = obtenerDatosPotenciaActivos();
      if (!datosPotencia || !datosPotencia.registros || datosPotencia.registros.length === 0) {
        return null;
      }
      return calcularMaximasDemandas(datosPotencia.registros, datosPotencia.columnas, variablesConfig);
    } catch (e) {
      console.warn('Error calculando máximas demandas en CardHistoricoPotencias:', e);
      return null;
    }
  }, [variablesConfig]);

  const consolidado = resultadoMaximasDemandas?.consolidado;
  const circuitos = resultadoMaximasDemandas?.circuitos || [];

  // Circuito activo seleccionado
  const datosCircuitoActivo = circuitoSeleccionado === 'total'
    ? consolidado
    : (circuitos.find((c) => c.key === circuitoSeleccionado) || consolidado);

  const potenciaHP_Calculada = datosCircuitoActivo?.maxHP?.potenciaKW ?? 0;
  const potenciaHFP_Calculada = datosCircuitoActivo?.maxHFP?.potenciaKW ?? 0;
  const fechaHP_Calculada = datosCircuitoActivo?.maxHP?.fechaDisplay || '—';
  const horaHP_Calculada = datosCircuitoActivo?.maxHP?.horaDisplay || '—';
  const fechaHFP_Calculada = datosCircuitoActivo?.maxHFP?.fechaDisplay || '—';
  const horaHFP_Calculada = datosCircuitoActivo?.maxHFP?.horaDisplay || '—';

  // Inyectar automáticamente las potencias calculadas en el historial del circuito seleccionado junto con fecha y hora
  useEffect(() => {
    if (onInyectarPotencias && (potenciaHP_Calculada > 0 || potenciaHFP_Calculada > 0)) {
      onInyectarPotencias(
        circuitoSeleccionado,
        periodoFacturacion,
        potenciaHP_Calculada,
        potenciaHFP_Calculada,
        fechaHP_Calculada,
        horaHP_Calculada,
        fechaHFP_Calculada,
        horaHFP_Calculada
      );
    }
  }, [
    circuitoSeleccionado,
    periodoFacturacion,
    potenciaHP_Calculada,
    potenciaHFP_Calculada,
    fechaHP_Calculada,
    horaHP_Calculada,
    fechaHFP_Calculada,
    horaHFP_Calculada,
    onInyectarPotencias,
  ]);

  // Obtener historial del circuito seleccionado o fallback al historial general
  const historicoPorCircuito = data?.porCircuito || {};
  const historicoCircuito = historicoPorCircuito[circuitoSeleccionado] || {
    ultimos12Meses: data?.ultimos12Meses || [],
    anteriores: data?.anteriores || [],
  };

  const ultimos12Meses = historicoCircuito.ultimos12Meses || data?.ultimos12Meses || [];
  const anteriores = historicoCircuito.anteriores || data?.anteriores || [];
  const listaActual = (tabActiva === 'anteriores' ? anteriores : ultimos12Meses) || [];

  // Métricas rápidas de HP y HFP
  const potenciasHPValores = listaActual.map((item) => {
    if (item.periodo === periodoFacturacion) return potenciaHP_Calculada;
    return Number(item?.potenciaHP_KW ?? item?.potenciaKW) || 0;
  });
  const potenciasHFPValores = listaActual.map((item) => {
    if (item.periodo === periodoFacturacion) return potenciaHFP_Calculada;
    return Number(item?.potenciaHFP_KW ?? item?.potenciaKW) || 0;
  });

  const maxHP = potenciasHPValores.length > 0 ? Math.max(...potenciasHPValores) : 0;
  const maxHFP = potenciasHFPValores.length > 0 ? Math.max(...potenciasHFPValores) : 0;
  const maximoAbsoluto = Math.max(maxHP, maxHFP);

  // Metadatos exactos de fecha y hora para el pico en Horas Punta (HP)
  const itemMaxHP = useMemo(() => {
    if (potenciasHPValores.length === 0) return null;
    if (Math.abs(potenciaHP_Calculada - maxHP) < 0.001) {
      return {
        periodo: periodoFacturacion,
        mesNombre: formatearMesNombre(periodoFacturacion),
        potenciaHP_KW: potenciaHP_Calculada,
        fecha: fechaHP_Calculada,
        hora: horaHP_Calculada,
        esMesActivo: true,
      };
    }
    const item = listaActual.find(
      (it) => Math.abs(Number(it?.potenciaHP_KW ?? it?.potenciaKW ?? 0) - maxHP) < 0.001
    );
    return {
      periodo: item?.periodo || periodoFacturacion,
      mesNombre: item?.mesNombre || formatearMesNombre(item?.periodo || periodoFacturacion),
      potenciaHP_KW: maxHP,
      fecha: item?.fechaHP || fechaHP_Calculada,
      hora: item?.horaHP || horaHP_Calculada,
      esMesActivo: false,
    };
  }, [listaActual, potenciasHPValores, potenciaHP_Calculada, maxHP, periodoFacturacion, fechaHP_Calculada, horaHP_Calculada]);

  // Metadatos exactos de fecha y hora para el pico en Horas Fuera de Punta (HFP)
  const itemMaxHFP = useMemo(() => {
    if (potenciasHFPValores.length === 0) return null;
    if (Math.abs(potenciaHFP_Calculada - maxHFP) < 0.001) {
      return {
        periodo: periodoFacturacion,
        mesNombre: formatearMesNombre(periodoFacturacion),
        potenciaHFP_KW: potenciaHFP_Calculada,
        fecha: fechaHFP_Calculada,
        hora: horaHFP_Calculada,
        esMesActivo: true,
      };
    }
    const item = listaActual.find(
      (it) => Math.abs(Number(it?.potenciaHFP_KW ?? it?.potenciaKW ?? 0) - maxHFP) < 0.001
    );
    return {
      periodo: item?.periodo || periodoFacturacion,
      mesNombre: item?.mesNombre || formatearMesNombre(item?.periodo || periodoFacturacion),
      potenciaHFP_KW: maxHFP,
      fecha: item?.fechaHFP || fechaHFP_Calculada,
      hora: item?.horaHFP || horaHFP_Calculada,
      esMesActivo: false,
    };
  }, [listaActual, potenciasHFPValores, potenciaHFP_Calculada, maxHFP, periodoFacturacion, fechaHFP_Calculada, horaHFP_Calculada]);

  // Metadatos exactos para el Pico Máximo Absoluto del período
  const itemPico = useMemo(() => {
    if (maxHP >= maxHFP) {
      return {
        ...itemMaxHP,
        tipo: 'HP',
        tipoTexto: 'Horas Punta',
      };
    } else {
      return {
        ...itemMaxHFP,
        tipo: 'HFP',
        tipoTexto: 'Horas Fuera de Punta',
      };
    }
  }, [maxHP, maxHFP, itemMaxHP, itemMaxHFP]);

  const handleGuardarVariacionManual = () => {
    setModalPersistencia({
      isOpen: true,
      detalle: {
        mensaje: `El histórico de potencias HP y HFP para el medidor seleccionado ha sido validado y persistido en memoria local para el periodo ${formatearMesNombre(periodoFacturacion)}.`,
        totalActivos: listaActual.length,
        totalTotal: (ultimos12Meses || []).length + (anteriores || []).length,
      },
    });
  };

  const handleValidarMetrica = (tipo) => {
    let targetPeriodo = periodoFacturacion;
    let targetColumna = 'hp';
    let targetValor = 0;
    let targetTitulo = '';
    let targetFecha = '—';
    let targetHora = '—';

    if (tipo === 'hp') {
      targetTitulo = 'Potencia Máxima HP';
      targetColumna = 'hp';
      targetValor = maxHP;
      targetFecha = itemMaxHP?.fecha || fechaHP_Calculada;
      targetHora = itemMaxHP?.hora || horaHP_Calculada;

      if (Math.abs(potenciaHP_Calculada - maxHP) < 0.001) {
        targetPeriodo = periodoFacturacion;
      } else {
        const itemActual = listaActual.find(
          (item) => Math.abs(Number(item?.potenciaHP_KW ?? item?.potenciaKW ?? 0) - maxHP) < 0.001
        );
        if (itemActual) {
          targetPeriodo = itemActual.periodo;
          targetFecha = itemActual.fechaHP || targetFecha;
          targetHora = itemActual.horaHP || targetHora;
        } else {
          const otraLista = tabActiva === 'ultimos12Meses' ? anteriores : ultimos12Meses;
          const itemOtra = otraLista.find(
            (item) => Math.abs(Number(item?.potenciaHP_KW ?? item?.potenciaKW ?? 0) - maxHP) < 0.001
          );
          if (itemOtra) {
            targetPeriodo = itemOtra.periodo;
            targetFecha = itemOtra.fechaHP || targetFecha;
            targetHora = itemOtra.horaHP || targetHora;
            setTabActiva(tabActiva === 'ultimos12Meses' ? 'anteriores' : 'ultimos12Meses');
          }
        }
      }
    } else if (tipo === 'hfp') {
      targetTitulo = 'Potencia Máxima HFP';
      targetColumna = 'hfp';
      targetValor = maxHFP;
      targetFecha = itemMaxHFP?.fecha || fechaHFP_Calculada;
      targetHora = itemMaxHFP?.hora || horaHFP_Calculada;

      if (Math.abs(potenciaHFP_Calculada - maxHFP) < 0.001) {
        targetPeriodo = periodoFacturacion;
      } else {
        const itemActual = listaActual.find(
          (item) => Math.abs(Number(item?.potenciaHFP_KW ?? item?.potenciaKW ?? 0) - maxHFP) < 0.001
        );
        if (itemActual) {
          targetPeriodo = itemActual.periodo;
          targetFecha = itemActual.fechaHFP || targetFecha;
          targetHora = itemActual.horaHFP || targetHora;
        } else {
          const otraLista = tabActiva === 'ultimos12Meses' ? anteriores : ultimos12Meses;
          const itemOtra = otraLista.find(
            (item) => Math.abs(Number(item?.potenciaHFP_KW ?? item?.potenciaKW ?? 0) - maxHFP) < 0.001
          );
          if (itemOtra) {
            targetPeriodo = itemOtra.periodo;
            targetFecha = itemOtra.fechaHFP || targetFecha;
            targetHora = itemOtra.horaHFP || targetHora;
            setTabActiva(tabActiva === 'ultimos12Meses' ? 'anteriores' : 'ultimos12Meses');
          }
        }
      }
    } else if (tipo === 'pico') {
      targetTitulo = 'Pico Máximo Período';
      targetValor = maximoAbsoluto;
      targetFecha = itemPico?.fecha || '—';
      targetHora = itemPico?.hora || '—';
      if (maxHP >= maxHFP) {
        targetColumna = 'hp';
        if (Math.abs(potenciaHP_Calculada - maxHP) < 0.001) {
          targetPeriodo = periodoFacturacion;
        } else {
          const itemActual = listaActual.find(
            (item) => Math.abs(Number(item?.potenciaHP_KW ?? item?.potenciaKW ?? 0) - maxHP) < 0.001
          );
          if (itemActual) targetPeriodo = itemActual.periodo;
        }
      } else {
        targetColumna = 'hfp';
        if (Math.abs(potenciaHFP_Calculada - maxHFP) < 0.001) {
          targetPeriodo = periodoFacturacion;
        } else {
          const itemActual = listaActual.find(
            (item) => Math.abs(Number(item?.potenciaHFP_KW ?? item?.potenciaKW ?? 0) - maxHFP) < 0.001
          );
          if (itemActual) targetPeriodo = itemActual.periodo;
        }
      }
    } else if (tipo === 'mes') {
      targetTitulo = 'Mes a Facturar';
      targetColumna = 'ambas';
      targetPeriodo = periodoFacturacion;
      targetValor = Math.max(potenciaHP_Calculada, potenciaHFP_Calculada);
      targetFecha = potenciaHP_Calculada >= potenciaHFP_Calculada ? fechaHP_Calculada : fechaHFP_Calculada;
      targetHora = potenciaHP_Calculada >= potenciaHFP_Calculada ? horaHP_Calculada : horaHFP_Calculada;
    }

    setValidacionActiva({
      tipo,
      periodo: targetPeriodo,
      columna: targetColumna,
      valor: targetValor,
      titulo: targetTitulo,
      fecha: targetFecha,
      hora: targetHora,
    });

    // Desplazar suavemente a la fila objetivo en la tabla
    setTimeout(() => {
      const elFila = filaRefs.current[targetPeriodo];
      if (elFila) {
        elFila.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const nombreCircuitoActivo = circuitoSeleccionado === 'total'
    ? 'Toda la Planta (Total Consolidado)'
    : (adaptarNombreAPotencia(datosCircuitoActivo?.alias) || circuitoSeleccionado);

  return (
    <>
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          ...getTrelloCardStyle(ACCENT, isHovered),
          height: '100%',
          minHeight: '410px',
          overflow: 'visible',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: ACCENT, borderRadius: '12px 12px 0 0' }} />

        {/* 1. Cabecera con Título, Selector de Medidor, Mes a Facturar y Botones */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245, 158, 11, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <History size={17} color={ACCENT} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '0.88rem', color: '#f8fafc', fontWeight: 800 }}>
                Histórico de Potencias (HP / HFP)
              </h4>
              <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                Evaluación de demandas máximas en Horas Punta y Fuera de Punta
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* Selector de Medidores Físicos y Virtuales */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: '#090d16',
                border: '1px solid #a855f7',
                borderRadius: '6px',
                padding: '0.2rem 0.45rem',
              }}
            >
              <Cpu size={13} color="#c084fc" />
              <span style={{ fontSize: '0.71rem', color: '#cbd5e1', fontWeight: 700 }}>
                Medidor:
              </span>
              <select
                value={circuitoSeleccionado}
                onChange={(e) => handleCambioCircuito(e.target.value)}
                title="Seleccionar el medidor o medidor virtual a facturar"
                style={{
                  background: '#0f172a',
                  border: '1px solid rgba(168, 85, 247, 0.6)',
                  borderRadius: '4px',
                  color: '#c084fc',
                  fontSize: '0.73rem',
                  fontWeight: 800,
                  padding: '0.15rem 0.35rem',
                  cursor: 'pointer',
                  outline: 'none',
                  maxWidth: '170px',
                }}
              >
                <option value="total">⚡ Toda la Planta (Consolidado)</option>
                {circuitos.some((c) => c.esVirtual) && (
                  <optgroup label="🟣 Medidores Virtuales">
                    {circuitos.filter((c) => c.esVirtual).map((c) => (
                      <option key={c.key} value={c.key}>🟣 {adaptarNombreAPotencia(c.alias)}</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="⚡ Circuitos Físicos">
                  {circuitos.filter((c) => !c.esVirtual).map((c) => (
                    <option key={c.key} value={c.key}>{adaptarNombreAPotencia(c.alias)} {c.codigo ? `(${c.codigo})` : ''}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Selector de Mes a Facturar con lista y navegación rápida */}
            <SelectorMesFacturacion
              value={periodoFacturacion}
              onChange={onUpdatePeriodo}
              compact={true}
              label="Mes Facturar:"
            />

            <button
              type="button"
              onClick={handleGuardarVariacionManual}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: 'linear-gradient(135deg, #d97706, #f59e0b)',
                border: 'none',
                borderRadius: '6px',
                padding: '0.35rem 0.65rem',
                color: '#000',
                fontSize: '0.74rem',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
              }}
            >
              <Save size={13} />
              <span>Guardar</span>
            </button>

            {/* Pestañas: Últimos 12 meses vs Histórico anterior */}
            <div style={{ display: 'flex', background: '#090d16', border: '1px solid #334155', borderRadius: '6px', padding: '2px' }}>
              <button
                type="button"
                onClick={() => setTabActiva('ultimos12Meses')}
                style={{
                  padding: '0.32rem 0.65rem',
                  borderRadius: '4px',
                  border: 'none',
                  background: tabActiva === 'ultimos12Meses' ? '#f59e0b' : 'transparent',
                  color: tabActiva === 'ultimos12Meses' ? '#000' : '#cbd5e1',
                  fontWeight: 800,
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <TrendingUp size={13} />
                <span>Últimos 12 Meses</span>
              </button>
              <button
                type="button"
                onClick={() => setTabActiva('anteriores')}
                style={{
                  padding: '0.32rem 0.65rem',
                  borderRadius: '4px',
                  border: 'none',
                  background: tabActiva === 'anteriores' ? '#f59e0b' : 'transparent',
                  color: tabActiva === 'anteriores' ? '#000' : '#cbd5e1',
                  fontWeight: 800,
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <Archive size={13} />
                <span>Anteriores ({anteriores.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. Resumen Métricas Rápidas: HP, HFP, Máximo Absoluto y Medidor (Clickables para Validar en Tabla) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
          {/* Tarjeta Potencia Máxima HP */}
          <div
            onClick={() => handleValidarMetrica('hp')}
            title="Haz clic para ubicar y validar la Potencia Máxima HP en la tabla"
            style={{
              background: validacionActiva?.tipo === 'hp' ? 'rgba(245, 158, 11, 0.22)' : '#090d16',
              border: validacionActiva?.tipo === 'hp' ? '2px solid #f59e0b' : '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '7px',
              padding: '0.4rem 0.65rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: validacionActiva?.tipo === 'hp' ? '0 0 14px rgba(245, 158, 11, 0.45)' : 'none',
              transform: validacionActiva?.tipo === 'hp' ? 'scale(1.02)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Pot. Máxima HP</span>
              <span style={{ fontSize: '0.6rem', color: '#fbbf24', fontWeight: 800 }}>🔍 Validar ↓</span>
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#fbbf24', marginTop: '1px' }}>
              {maxHP.toLocaleString('es-PE', { maximumFractionDigits: 2 })} kW
            </div>
            {/* Fecha y Hora Exacta en que se produjo la Potencia Máxima HP */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                marginTop: '4px',
                fontSize: '0.63rem',
                color: '#fef08a',
                background: 'rgba(0, 0, 0, 0.45)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                padding: '2px 5px',
                borderRadius: '4px',
                width: 'fit-content',
                flexWrap: 'wrap',
              }}
            >
              <span>📅 {itemMaxHP?.fecha || fechaHP_Calculada}</span>
              <span style={{ fontWeight: 800 }}>⏰ {itemMaxHP?.hora || (horaHP_Calculada !== '—' ? `${horaHP_Calculada} hrs` : '—')}</span>
            </div>
          </div>

          {/* Tarjeta Potencia Máxima HFP */}
          <div
            onClick={() => handleValidarMetrica('hfp')}
            title="Haz clic para ubicar y validar la Potencia Máxima HFP en la tabla"
            style={{
              background: validacionActiva?.tipo === 'hfp' ? 'rgba(56, 189, 248, 0.22)' : '#090d16',
              border: validacionActiva?.tipo === 'hfp' ? '2px solid #38bdf8' : '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: '7px',
              padding: '0.4rem 0.65rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: validacionActiva?.tipo === 'hfp' ? '0 0 14px rgba(56, 189, 248, 0.45)' : 'none',
              transform: validacionActiva?.tipo === 'hfp' ? 'scale(1.02)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Pot. Máxima HFP</span>
              <span style={{ fontSize: '0.6rem', color: '#38bdf8', fontWeight: 800 }}>🔍 Validar ↓</span>
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#38bdf8', marginTop: '1px' }}>
              {maxHFP.toLocaleString('es-PE', { maximumFractionDigits: 2 })} kW
            </div>
            {/* Fecha y Hora Exacta en que se produjo la Potencia Máxima HFP */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                marginTop: '4px',
                fontSize: '0.63rem',
                color: '#bae6fd',
                background: 'rgba(0, 0, 0, 0.45)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                padding: '2px 5px',
                borderRadius: '4px',
                width: 'fit-content',
                flexWrap: 'wrap',
              }}
            >
              <span>📅 {itemMaxHFP?.fecha || fechaHFP_Calculada}</span>
              <span style={{ fontWeight: 800 }}>⏰ {itemMaxHFP?.hora || (horaHFP_Calculada !== '—' ? `${horaHFP_Calculada} hrs` : '—')}</span>
            </div>
          </div>

          {/* Tarjeta Pico Máximo Período */}
          <div
            onClick={() => handleValidarMetrica('pico')}
            title="Haz clic para ubicar y validar el Pico Máximo en la tabla"
            style={{
              background: validacionActiva?.tipo === 'pico' ? 'rgba(34, 197, 94, 0.22)' : '#090d16',
              border: validacionActiva?.tipo === 'pico' ? '2px solid #22c55e' : '1px solid rgba(34, 197, 94, 0.4)',
              borderRadius: '7px',
              padding: '0.4rem 0.65rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: validacionActiva?.tipo === 'pico' ? '0 0 14px rgba(34, 197, 94, 0.45)' : 'none',
              transform: validacionActiva?.tipo === 'pico' ? 'scale(1.02)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Pico Máximo Período</span>
              <span style={{ fontSize: '0.6rem', color: '#4ade80', fontWeight: 800 }}>🔍 Validar ↓</span>
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#4ade80', marginTop: '1px' }}>
              {maximoAbsoluto.toLocaleString('es-PE', { maximumFractionDigits: 2 })} kW
            </div>
            {/* Fecha, Hora y Régimen Exacto del Pico */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                marginTop: '4px',
                fontSize: '0.63rem',
                color: '#bbf7d0',
                background: 'rgba(0, 0, 0, 0.45)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                padding: '2px 5px',
                borderRadius: '4px',
                width: 'fit-content',
                flexWrap: 'wrap',
              }}
            >
              <span>📅 {itemPico?.fecha}</span>
              <span style={{ fontWeight: 800 }}>⏰ {itemPico?.hora} hrs ({itemPico?.tipo})</span>
            </div>
          </div>

          {/* Tarjeta Medidor Seleccionado */}
          <div
            onClick={() => handleValidarMetrica('mes')}
            title="Haz clic para ubicar la fila del Mes a Facturar actual en la tabla"
            style={{
              background: validacionActiva?.tipo === 'mes' ? 'rgba(168, 85, 247, 0.22)' : '#090d16',
              border: validacionActiva?.tipo === 'mes' ? '2px solid #a855f7' : '1px solid rgba(168, 85, 247, 0.4)',
              borderRadius: '7px',
              padding: '0.4rem 0.65rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: validacionActiva?.tipo === 'mes' ? '0 0 14px rgba(168, 85, 247, 0.45)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Medidor Seleccionado</span>
              <span style={{ fontSize: '0.6rem', color: '#c084fc', fontWeight: 800 }}>⚡ Activo</span>
            </div>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#c084fc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }} title={nombreCircuitoActivo}>
              {nombreCircuitoActivo}
            </div>
            <div style={{ fontSize: '0.63rem', color: '#94a3b8', marginTop: '5px' }}>
              {circuitos.length} opciones en planta
            </div>
          </div>
        </div>

        {/* Banner Informativo de Validación Activa */}
        {validacionActiva && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              background: 'rgba(15, 23, 42, 0.95)',
              border: `1px solid ${validacionActiva.columna === 'hp' ? '#f59e0b' : validacionActiva.columna === 'hfp' ? '#38bdf8' : '#22c55e'}`,
              borderRadius: '6px',
              padding: '0.35rem 0.75rem',
              fontSize: '0.74rem',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
              <Target size={14} color={validacionActiva.columna === 'hp' ? '#fbbf24' : validacionActiva.columna === 'hfp' ? '#38bdf8' : '#4ade80'} />
              <span style={{ color: '#f8fafc' }}>
                Validando en tabla:{' '}
                <strong style={{ color: validacionActiva.columna === 'hp' ? '#fbbf24' : validacionActiva.columna === 'hfp' ? '#38bdf8' : '#4ade80' }}>
                  {validacionActiva.titulo}
                </strong>{' '}
                ={' '}
                <strong style={{ color: '#fff', fontSize: '0.82rem' }}>
                  {Number(validacionActiva.valor).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kW
                </strong>
                {validacionActiva.fecha && validacionActiva.fecha !== '—' && (
                  <span style={{ marginLeft: '5px', color: '#fed7aa', background: 'rgba(0, 0, 0, 0.4)', padding: '1px 6px', borderRadius: '4px' }}>
                    📅 <strong>{validacionActiva.fecha}</strong> a las ⏰ <strong>{validacionActiva.hora} hrs</strong>
                  </span>
                )}{' '}
                en el período{' '}
                <strong style={{ color: '#38bdf8' }}>
                  {formatearMesNombre(validacionActiva.periodo)} ({validacionActiva.periodo})
                </strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setValidacionActiva(null)}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '4px',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '2px 7px',
                fontSize: '0.68rem',
                fontWeight: 700,
                transition: 'all 0.15s ease',
              }}
            >
              ✕ Cerrar validación
            </button>
          </div>
        )}

        {/* 3. Tabla con 2 Columnas: Pot. Max. HP y Pot. Max. HFP */}
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #334155', borderRadius: '7px', background: '#090d16', maxHeight: '270px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#0f172a', zIndex: 2, borderBottom: '1px solid #334155' }}>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.55rem 0.65rem', color: '#f8fafc', fontWeight: 700, width: '80px' }}>
                  Periodo
                </th>
                <th style={{ textAlign: 'left', padding: '0.55rem 0.65rem', color: '#f8fafc', fontWeight: 700 }}>
                  Mes / Año
                </th>
                <th style={{ textAlign: 'right', padding: '0.55rem 0.65rem', color: '#fbbf24', fontWeight: 700, width: '180px' }}>
                  Pot. Max. HP (kW)
                </th>
                <th style={{ textAlign: 'right', padding: '0.55rem 0.65rem', color: '#38bdf8', fontWeight: 700, width: '180px' }}>
                  Pot. Max. HFP (kW)
                </th>
              </tr>
            </thead>
            <tbody>
              {listaActual.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
                    No hay registros en este período.
                  </td>
                </tr>
              ) : (
                listaActual.map((item) => {
                  const esMesActivo = item.periodo === periodoFacturacion;
                  const valorHP = esMesActivo ? potenciaHP_Calculada : (item.potenciaHP_KW ?? item.potenciaKW ?? 0);
                  const valorHFP = esMesActivo ? potenciaHFP_Calculada : (item.potenciaHFP_KW ?? item.potenciaKW ?? 0);

                  const esFilaValidada = validacionActiva?.periodo === item.periodo;
                  const resaltarHP = esFilaValidada && (validacionActiva?.columna === 'hp' || validacionActiva?.columna === 'ambas');
                  const resaltarHFP = esFilaValidada && (validacionActiva?.columna === 'hfp' || validacionActiva?.columna === 'ambas');

                  return (
                    <tr
                      key={item.id}
                      ref={(el) => {
                        if (el) filaRefs.current[item.periodo] = el;
                      }}
                      style={{
                        borderBottom: '1px solid #1e293b',
                        background: esFilaValidada
                          ? (resaltarHP ? 'rgba(245, 158, 11, 0.22)' : 'rgba(56, 189, 248, 0.22)')
                          : (esMesActivo ? 'rgba(56, 189, 248, 0.08)' : 'transparent'),
                        borderLeft: esFilaValidada
                          ? `4px solid ${resaltarHP ? '#f59e0b' : '#38bdf8'}`
                          : (esMesActivo ? '4px solid #38bdf8' : '4px solid transparent'),
                        boxShadow: esFilaValidada ? 'inset 0 0 14px rgba(0, 0, 0, 0.6)' : 'none',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <td style={{ padding: '0.45rem 0.65rem', color: esMesActivo ? '#38bdf8' : '#64748b', fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: esMesActivo ? 800 : 500 }}>
                        {item.periodo}
                      </td>
                      <td style={{ padding: '0.45rem 0.65rem', color: '#f8fafc', fontWeight: esMesActivo ? 800 : 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span>{item.mesNombre}</span>
                          {esMesActivo && (
                            <span
                              style={{
                                fontSize: '0.62rem',
                                background: 'rgba(56, 189, 248, 0.2)',
                                border: '1px solid #38bdf8',
                                color: '#38bdf8',
                                padding: '1px 6px',
                                borderRadius: '10px',
                                fontWeight: 800,
                                letterSpacing: '0.02em',
                              }}
                            >
                              ⭐ Mes a Facturar
                            </span>
                          )}
                          {esFilaValidada && (
                            <span
                              style={{
                                fontSize: '0.62rem',
                                background: resaltarHP ? 'rgba(245, 158, 11, 0.25)' : 'rgba(56, 189, 248, 0.25)',
                                border: `1px solid ${resaltarHP ? '#f59e0b' : '#38bdf8'}`,
                                color: resaltarHP ? '#fbbf24' : '#38bdf8',
                                padding: '1px 6px',
                                borderRadius: '10px',
                                fontWeight: 800,
                              }}
                            >
                              📍 Fila Validada
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Columna Pot. Max. HP */}
                      <td style={{ padding: '0.35rem 0.65rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'flex-end' }}>
                            {resaltarHP && (
                              <span
                                style={{
                                  fontSize: '0.61rem',
                                  background: '#f59e0b',
                                  color: '#000',
                                  fontWeight: 800,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  boxShadow: '0 0 8px rgba(245, 158, 11, 0.8)',
                                }}
                              >
                                👈 HP
                              </span>
                            )}
                            {esMesActivo ? (
                              <div
                                title="Calculado automáticamente desde las mediciones en horario punta (no editable para el mes a facturar)"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  background: resaltarHP ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.15)',
                                  border: resaltarHP ? '2px solid #f59e0b' : '1px solid #f59e0b',
                                  borderRadius: '5px',
                                  padding: '0.25rem 0.45rem',
                                  color: '#fbbf24',
                                  fontSize: '0.78rem',
                                  fontWeight: 800,
                                  boxShadow: resaltarHP ? '0 0 10px rgba(245, 158, 11, 0.6)' : 'none',
                                }}
                              >
                                <Lock size={11} color="#f59e0b" />
                                <span>{Number(valorHP).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>kW</span>
                                <span style={{ fontSize: '0.58rem', background: 'rgba(245, 158, 11, 0.3)', padding: '0 3px', borderRadius: '3px', color: '#fbbf24' }}>Auto</span>
                              </div>
                            ) : (
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  padding: '1px',
                                  borderRadius: '5px',
                                  border: resaltarHP ? '2px solid #f59e0b' : 'none',
                                  boxShadow: resaltarHP ? '0 0 10px rgba(245, 158, 11, 0.6)' : 'none',
                                }}
                              >
                                <input
                                  type="number"
                                  step="any"
                                  value={item.potenciaHP_KW === 0 ? 0 : (item.potenciaHP_KW ?? item.potenciaKW ?? '')}
                                  onChange={(e) => onUpdatePotencia(item.id, e.target.value, tabActiva, 'potenciaHP_KW', circuitoSeleccionado)}
                                  style={{
                                    width: '85px',
                                    textAlign: 'right',
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    borderRadius: '5px',
                                    padding: '0.25rem 0.4rem',
                                    color: '#fbbf24',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    outline: 'none',
                                  }}
                                />
                                <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>kW</span>
                              </div>
                            )}
                          </div>

                          {/* Fecha y Hora Exacta en que se produjo la Potencia Máxima HP */}
                          {(item.fechaHP || (esMesActivo && fechaHP_Calculada && fechaHP_Calculada !== '—')) && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.61rem', color: '#fef08a', fontWeight: 600 }}>
                              <span>📅 {item.fechaHP || fechaHP_Calculada}</span>
                              <span style={{ fontWeight: 800 }}>⏰ {item.horaHP || (horaHP_Calculada !== '—' ? `${horaHP_Calculada} hrs` : '')}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Columna Pot. Max. HFP */}
                      <td style={{ padding: '0.35rem 0.65rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'flex-end' }}>
                            {resaltarHFP && (
                              <span
                                style={{
                                  fontSize: '0.61rem',
                                  background: '#38bdf8',
                                  color: '#000',
                                  fontWeight: 800,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  boxShadow: '0 0 8px rgba(56, 189, 248, 0.8)',
                                }}
                              >
                                👈 HFP
                              </span>
                            )}
                            {esMesActivo ? (
                              <div
                                title="Calculado automáticamente desde las mediciones fuera de punta (no editable para el mes a facturar)"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  background: resaltarHFP ? 'rgba(56, 189, 248, 0.3)' : 'rgba(56, 189, 248, 0.15)',
                                  border: resaltarHFP ? '2px solid #38bdf8' : '1px solid #38bdf8',
                                  borderRadius: '5px',
                                  padding: '0.25rem 0.45rem',
                                  color: '#38bdf8',
                                  fontSize: '0.78rem',
                                  fontWeight: 800,
                                  boxShadow: resaltarHFP ? '0 0 10px rgba(56, 189, 248, 0.6)' : 'none',
                                }}
                              >
                                <Lock size={11} color="#38bdf8" />
                                <span>{Number(valorHFP).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>kW</span>
                                <span style={{ fontSize: '0.58rem', background: 'rgba(56, 189, 248, 0.3)', padding: '0 3px', borderRadius: '3px', color: '#38bdf8' }}>Auto</span>
                              </div>
                            ) : (
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  padding: '1px',
                                  borderRadius: '5px',
                                  border: resaltarHFP ? '2px solid #38bdf8' : 'none',
                                  boxShadow: resaltarHFP ? '0 0 10px rgba(56, 189, 248, 0.6)' : 'none',
                                }}
                              >
                                <input
                                  type="number"
                                  step="any"
                                  value={item.potenciaHFP_KW === 0 ? 0 : (item.potenciaHFP_KW ?? item.potenciaKW ?? '')}
                                  onChange={(e) => onUpdatePotencia(item.id, e.target.value, tabActiva, 'potenciaHFP_KW', circuitoSeleccionado)}
                                  style={{
                                    width: '85px',
                                    textAlign: 'right',
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    borderRadius: '5px',
                                    padding: '0.25rem 0.4rem',
                                    color: '#38bdf8',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    outline: 'none',
                                  }}
                                />
                                <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>kW</span>
                              </div>
                            )}
                          </div>

                          {/* Fecha y Hora Exacta en que se produjo la Potencia Máxima HFP */}
                          {(item.fechaHFP || (esMesActivo && fechaHFP_Calculada && fechaHFP_Calculada !== '—')) && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.61rem', color: '#bae6fd', fontWeight: 600 }}>
                              <span>📅 {item.fechaHFP || fechaHFP_Calculada}</span>
                              <span style={{ fontWeight: 800 }}>⏰ {item.horaHFP || (horaHFP_Calculada !== '—' ? `${horaHFP_Calculada} hrs` : '')}</span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ModalGuardadoPersistencia
        isOpen={modalPersistencia.isOpen}
        onClose={() => setModalPersistencia({ isOpen: false, detalle: null })}
        detalle={modalPersistencia.detalle}
      />
    </>
  );
};

export default CardHistoricoPotencias;
