import React, { useState, useMemo } from 'react';
import { Activity, HelpCircle, ChevronDown, CheckCircle2, Target, TrendingUp, Info, Zap } from 'lucide-react';
import { getTrelloCardStyle } from '../../components_configuracion_variables/utils/trelloCardStyles';
import { adaptarNombreAPotencia } from '../../medidores_virtuales/useMedidoresVirtuales';
import { calcularFactoresDeCarga } from '../utils/calculoFactorCargaService';
import { buscarPotenciaCoincidente } from '../../components_registro_potencia/utils/buscarPotenciaCoincidente';
import { obtenerHorasDelMes } from '../../components_configuracion_variables/utils/periodoFacturacionUtils';
import ModalExplicacionFactorCarga from '../modals/ModalExplicacionFactorCarga';

const ACCENT = '#06b6d4';

const formatearNumero = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || isNaN(valor)) return '0.00';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

const CardCalculoFactorCarga = ({ resultadoEnergias, resultadoMaximasDemandas, variables }) => {
  const [hovered, setHovered] = useState(false);
  const [circuitoSeleccionado, setCircuitoSeleccionado] = useState('virtual_default');
  const [modalAbierto, setModalAbierto] = useState(false);

  // Obtener la demanda coincidente registrada en la fecha y hora configurada
  const demanda = variables?.demandaCoincidente || {};
  const fechaCoincidente = demanda.fecha || '2026-08-26';
  const horaCoincidente = demanda.hora || '19:00';

  const resultadoCoincidente = useMemo(() => {
    return buscarPotenciaCoincidente(fechaCoincidente, horaCoincidente);
  }, [fechaCoincidente, horaCoincidente]);

  const horasPeriodoMes = useMemo(() => {
    return obtenerHorasDelMes(variables?.periodoFacturacion || '2026-08');
  }, [variables?.periodoFacturacion]);

  // Cálculo de los 3 Factores de Carga
  const calculo = useMemo(() => {
    return calcularFactoresDeCarga({
      resultadoEnergias,
      resultadoMaximasDemandas,
      resultadoCoincidente,
      variablesConfig: variables,
      circuitoKey: circuitoSeleccionado,
      horasMes: horasPeriodoMes,
    });
  }, [resultadoEnergias, resultadoMaximasDemandas, resultadoCoincidente, variables, circuitoSeleccionado, horasPeriodoMes]);

  if (!resultadoEnergias || !resultadoEnergias.consolidado || !calculo) {
    return (
      <div
        style={{
          ...getTrelloCardStyle(ACCENT, false),
          width: '450px',
          maxWidth: '490px',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
          Esperando datos de energía y potencia para calcular Factores de Carga...
        </div>
      </div>
    );
  }

  const { circuitos = [] } = resultadoEnergias;
  const { refContratada, refMaximaDemanda, refCoincidente, eMesMWh, eMesKWh, horasMes } = calculo;

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          ...getTrelloCardStyle(ACCENT, hovered),
          width: '450px',
          maxWidth: '490px',
          minWidth: '370px',
          flex: '0 0 auto',
        }}
      >
        {/* 1. Cabecera con Título y Botón Modal Educativo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <div
              style={{
                padding: '0.45rem',
                borderRadius: '8px',
                background: 'rgba(6, 182, 212, 0.15)',
                color: ACCENT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Activity size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                Cálculo de Factor de Carga
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                FC = E_mes / (P_ref × h_mes)
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <button
              type="button"
              onClick={() => setModalAbierto(true)}
              title="Ver definición técnica, fórmulas y ejemplo didáctico Kallpa"
              style={{
                background: 'rgba(6, 182, 212, 0.12)',
                border: '1px solid rgba(6, 182, 212, 0.35)',
                color: '#67e8f9',
                borderRadius: '6px',
                padding: '0.25rem 0.5rem',
                fontSize: '0.7rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(6, 182, 212, 0.25)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(6, 182, 212, 0.12)';
                e.currentTarget.style.color = '#67e8f9';
              }}
            >
              <HelpCircle size={13} />
              <span>¿Cómo se calcula?</span>
            </button>
          </div>
        </div>

        {/* 2. Selector de Suministro / Circuito */}
        <div style={{ marginTop: '0.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
              Suministro Evaluado
            </span>
            <span style={{ fontSize: '0.66rem', color: '#67e8f9', fontWeight: 600 }}>
              Mes: Agosto ({horasMes} hrs)
            </span>
          </div>

          <div style={{ position: 'relative' }}>
            <select
              value={circuitoSeleccionado}
              onChange={(e) => setCircuitoSeleccionado(e.target.value)}
              style={{
                width: '100%',
                padding: '0.42rem 2rem 0.42rem 0.65rem',
                background: '#090d16',
                border: '1px solid #334155',
                borderRadius: '7px',
                color: '#f8fafc',
                fontSize: '0.78rem',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                boxSizing: 'border-box',
              }}
            >
              {circuitos.some((c) => c.esVirtual) && (
                <optgroup label="🟣 Medidores Virtualizados (Facturable)">
                  {circuitos
                    .filter((c) => c.esVirtual)
                    .map((c) => (
                      <option key={c.key} value={c.key}>
                        🟣 {adaptarNombreAPotencia(c.alias)} (Recomendado)
                      </option>
                    ))}
                </optgroup>
              )}

              <option value="total">⚡ Toda la Planta (Total Consolidado Físico)</option>

              <optgroup label="⚡ Circuitos Físicos de Acometida">
                {circuitos
                  .filter((c) => !c.esVirtual)
                  .map((c) => (
                    <option key={c.key} value={c.key}>
                      {adaptarNombreAPotencia(c.alias)} {c.codigo ? `(${c.codigo})` : ''}
                    </option>
                  ))}
              </optgroup>
            </select>
            <ChevronDown
              size={14}
              color="#94a3b8"
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
          </div>
        </div>

        {/* 3. Banner Informativo de Energía Base Mensual */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.12) 0%, rgba(14, 116, 144, 0.15) 100%)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            borderRadius: '8px',
            padding: '0.5rem 0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span style={{ fontSize: '0.67rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
              Energía Consumida (E_mes)
            </span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ecfeff', lineHeight: 1.1 }}>
              {formatearNumero(eMesMWh, 2)} <span style={{ fontSize: '0.72rem', color: '#22d3ee' }}>MWh</span>
            </div>
            <span style={{ fontSize: '0.66rem', color: '#67e8f9' }}>
              {formatearNumero(eMesKWh, 0)} kWh en {horasMes} horas
            </span>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.67rem', color: '#94a3b8', display: 'block' }}>Régimen Comercial</span>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#e2e8f0' }}>
              3 Referencias de Potencia
            </span>
            <span style={{ fontSize: '0.66rem', color: '#06b6d4', display: 'block' }}>
              Uso Práctico Detallado
            </span>
          </div>
        </div>

        {/* 4. Bloques de las 3 Referencias de Factor de Carga */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {/* REFERENCIA 1: Potencia Contratada */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(6, 182, 212, 0.25)',
              borderRadius: '8px',
              padding: '0.55rem 0.7rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Target size={13} color="#22d3ee" />
                <span style={{ fontSize: '0.74rem', color: '#f8fafc', fontWeight: 700 }}>
                  Potencia contratada ({refContratada?.potenciaEtiqueta})
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#22d3ee' }}>
                  {refContratada?.fcDecimal}
                </span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#67e8f9' }}>
                  ({refContratada?.fcPorcentaje}%)
                </span>
              </div>
            </div>

            {/* Ratio Matemático */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#94a3b8' }}>
              <span>Ratio: E_mes / (P_ref × {horasMes} h)</span>
              <span style={{ fontFamily: 'monospace', color: '#cbd5e1', fontWeight: 600 }}>
                {refContratada?.ratioTexto}
              </span>
            </div>

            {/* Barra de Progreso Visual */}
            <div style={{ background: '#090d16', height: '5px', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, refContratada?.fcPorcentaje || 0))}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #06b6d4 0%, #22d3ee 100%)',
                  borderRadius: '4px',
                }}
              />
            </div>

            {/* Significado y Uso Práctico */}
            <div style={{ fontSize: '0.69rem', color: '#94a3b8', background: 'rgba(6, 182, 212, 0.05)', padding: '0.3rem 0.5rem', borderRadius: '5px', borderLeft: '2px solid #22d3ee' }}>
              <strong style={{ color: '#67e8f9' }}>Significado y Uso Práctico: </strong>
              <span>{refContratada?.uso}</span>
            </div>
          </div>

          {/* REFERENCIA 2: Máxima Demanda del Mes */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              borderRadius: '8px',
              padding: '0.55rem 0.7rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <TrendingUp size={13} color="#c084fc" />
                <span style={{ fontSize: '0.74rem', color: '#f8fafc', fontWeight: 700 }}>
                  Máxima demanda del mes ({refMaximaDemanda?.potenciaEtiqueta})
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#c084fc' }}>
                  {refMaximaDemanda?.fcDecimal}
                </span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#d8b4fe' }}>
                  ({refMaximaDemanda?.fcPorcentaje}%)
                </span>
              </div>
            </div>

            {/* Ratio Matemático */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#94a3b8' }}>
              <span>Ratio: E_mes / (P_ref × {horasMes} h)</span>
              <span style={{ fontFamily: 'monospace', color: '#cbd5e1', fontWeight: 600 }}>
                {refMaximaDemanda?.ratioTexto}
              </span>
            </div>

            {/* Barra de Progreso Visual */}
            <div style={{ background: '#090d16', height: '5px', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, refMaximaDemanda?.fcPorcentaje || 0))}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #8b5cf6 0%, #c084fc 100%)',
                  borderRadius: '4px',
                }}
              />
            </div>

            {/* Significado y Uso Práctico */}
            <div style={{ fontSize: '0.69rem', color: '#94a3b8', background: 'rgba(168, 85, 247, 0.05)', padding: '0.3rem 0.5rem', borderRadius: '5px', borderLeft: '2px solid #a855f7' }}>
              <strong style={{ color: '#d8b4fe' }}>Significado y Uso Práctico: </strong>
              <span>{refMaximaDemanda?.uso}</span>
            </div>
          </div>

          {/* REFERENCIA 3: Demanda Coincidente */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '8px',
              padding: '0.55rem 0.7rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Activity size={13} color="#fbbf24" />
                <span style={{ fontSize: '0.74rem', color: '#f8fafc', fontWeight: 700 }}>
                  Demanda coincidente ({refCoincidente?.potenciaEtiqueta})
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fbbf24' }}>
                  {refCoincidente?.fcDecimal}
                </span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#fde68a' }}>
                  ({refCoincidente?.fcPorcentaje}%)
                </span>
              </div>
            </div>

            {/* Ratio Matemático */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#94a3b8' }}>
              <span>Ratio: E_mes / (P_ref × {horasMes} h)</span>
              <span style={{ fontFamily: 'monospace', color: '#cbd5e1', fontWeight: 600 }}>
                {refCoincidente?.ratioTexto}
              </span>
            </div>

            {/* Barra de Progreso Visual */}
            <div style={{ background: '#090d16', height: '5px', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, refCoincidente?.fcPorcentaje || 0))}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #d97706 0%, #fbbf24 100%)',
                  borderRadius: '4px',
                }}
              />
            </div>

            {/* Significado y Uso Práctico */}
            <div style={{ fontSize: '0.69rem', color: '#94a3b8', background: 'rgba(245, 158, 11, 0.05)', padding: '0.3rem 0.5rem', borderRadius: '5px', borderLeft: '2px solid #f59e0b' }}>
              <strong style={{ color: '#fde68a' }}>Significado y Uso Práctico: </strong>
              <span>{refCoincidente?.uso}</span>
            </div>
          </div>
        </div>

        {/* 5. Pie de Trazabilidad */}
        <div
          style={{
            borderTop: '1px solid #1e293b',
            paddingTop: '0.45rem',
            marginTop: '0.1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.69rem',
            color: '#64748b',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <CheckCircle2 size={12} color="#06b6d4" />
            <span>Fórmula: FC = E_mes / (P_ref × h_mes)</span>
          </span>
          <span style={{ color: '#67e8f9', fontWeight: 600 }}>
            {calculo.aliasCircuito}
          </span>
        </div>
      </div>

      {/* Modal Educativo e Interactivo de Metodología */}
      <ModalExplicacionFactorCarga
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        dataCalculo={calculo}
      />
    </>
  );
};

export default CardCalculoFactorCarga;
