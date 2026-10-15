import React, { useState, useMemo } from 'react';
import { Cpu, Info, ChevronDown, CheckCircle2, AlertCircle, HelpCircle, X, Zap, ArrowRight, ShieldCheck } from 'lucide-react';
import { getTrelloCardStyle } from '../../components_configuracion_variables/utils/trelloCardStyles';
import { calcularVAD } from '../utils/calculoVADService';
import { buscarPotenciaCoincidente } from '../../components_registro_potencia/utils/buscarPotenciaCoincidente';

const ACCENT = '#8b5cf6'; // Violeta eléctrico para Distribución y VAD

const formatearNumero = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || isNaN(valor)) return '0.00';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

/**
 * Cuadro de Cálculo: Valor Agregado de Distribución (VAD) en Horas Punta y Fuera de Punta
 * Conforme al Procedimiento Técnico y Normativa de Tarifas de Osinergmin.
 */
const CardCalculoVAD = ({ variables, onRecalcular }) => {
  const [hovered, setHovered] = useState(false);
  const [circuitoSeleccionado, setCircuitoSeleccionado] = useState('virtual_default');
  const [mostrarModalInfo, setMostrarModalInfo] = useState(false);

  // Obtener circuitos disponibles desde la búsqueda coincidente
  const demanda = variables?.demandaCoincidente || {};
  const fechaCoincidente = demanda.fecha || '2026-08-26';
  const horaCoincidente = demanda.hora || '19:00';

  const resultadoCoincidente = useMemo(() => {
    return buscarPotenciaCoincidente(fechaCoincidente, horaCoincidente);
  }, [fechaCoincidente, horaCoincidente]);

  const circuitos = resultadoCoincidente?.circuitos || [];
  const circuitoActivoKey = circuitoSeleccionado === 'virtual_default'
    ? (resultadoCoincidente?.medidorVirtualKey || 'total')
    : circuitoSeleccionado;

  // Ejecutar cálculo de VAD con el servicio
  const vadData = useMemo(() => {
    return calcularVAD({
      periodoFacturacion: variables?.periodoFacturacion || '2026-08',
      historicoPotencias: variables?.historicoPotencias || {},
      circuitoKey: circuitoActivoKey,
      peajesConfig: variables?.peajesRegulados || {},
    });
  }, [variables?.periodoFacturacion, variables?.historicoPotencias, variables?.peajesRegulados, circuitoActivoKey]);

  const nombreCircuitoActivo = circuitoActivoKey === 'total'
    ? 'Toda la Planta (Total Consolidado)'
    : resultadoCoincidente?.medidorVirtualKey === circuitoActivoKey
      ? `🟣 ${resultadoCoincidente?.nombreFuente || 'Medidor Virtual'}`
      : (circuitos.find((c) => c.key === circuitoActivoKey)?.alias || 'Circuito');

  return (
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
      {/* 1. Encabezado de la Tarjeta */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div
            style={{
              padding: '0.45rem',
              borderRadius: '8px',
              background: 'rgba(139, 92, 246, 0.2)',
              color: ACCENT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Cpu size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
              Cálculo de Valor Agregado Distribución VAD
            </h3>
            <span style={{ fontSize: '0.72rem', color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Zap size={11} color={ACCENT} />
              VAD Horas Punta y Fuera de Punta (Últimos 6 meses)
            </span>
          </div>
        </div>

        {/* Botón Info de cómo se calcula */}
        <button
          type="button"
          onClick={() => setMostrarModalInfo(true)}
          title="Ver cómo se calcula el VAD según Osinergmin"
          style={{
            background: 'rgba(139, 92, 246, 0.15)',
            border: '1px solid rgba(139, 92, 246, 0.35)',
            borderRadius: '6px',
            color: '#c4b5fd',
            padding: '0.25rem 0.5rem',
            fontSize: '0.68rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.35)'; e.currentTarget.style.color = '#c4b5fd'; }}
        >
          <Info size={12} />
          <span>¿Cómo se calcula?</span>
        </button>
      </div>

      {/* 2. Selector de Circuito / Medidor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Medidor Evaluado
          </span>
          <span style={{ fontSize: '0.68rem', color: '#a78bfa', fontWeight: 600 }}>
            {circuitoActivoKey === 'total' ? 'Consolidado Planta' : 'Medidor Individual'}
          </span>
        </div>
        <div style={{ position: 'relative' }}>
          <select
            value={circuitoActivoKey}
            onChange={(e) => setCircuitoSeleccionado(e.target.value)}
            style={{
              width: '100%',
              background: '#0a101f',
              border: '1px solid #334155',
              borderRadius: '7px',
              padding: '0.45rem 2rem 0.45rem 0.65rem',
              color: '#f8fafc',
              fontSize: '0.78rem',
              fontWeight: 700,
              outline: 'none',
              cursor: 'pointer',
              appearance: 'none',
              boxSizing: 'border-box',
            }}
          >
            {resultadoCoincidente?.medidorVirtualKey && (
              <option value={resultadoCoincidente.medidorVirtualKey}>
                🟣 {resultadoCoincidente.nombreFuente || 'Medidor Virtual'}
              </option>
            )}
            <option value="total">⚡ Toda la Planta (Total Consolidado)</option>
            {circuitos
              .filter((c) => !c.esVirtual)
              .map((c) => (
                <option key={c.key} value={c.key}>
                  {c.alias} {c.codigo ? `(${c.codigo})` : ''}
                </option>
              ))}
          </select>
          <ChevronDown
            size={14}
            color="#94a3b8"
            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
        </div>
      </div>

      {/* 3. Bloques de Comparación VAD HP vs VAD HFP */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginTop: '0.1rem' }}>
        {/* BLOQUE VAD HP */}
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '8px',
            padding: '0.65rem 0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 800, textTransform: 'uppercase' }}>
              VAD - Horas Punta
            </span>
            <span style={{ fontSize: '0.62rem', color: '#fde68a', background: 'rgba(245, 158, 11, 0.2)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
              Promedio 2 Max
            </span>
          </div>

          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fef3c7', lineHeight: 1.1 }}>
              {formatearNumero(vadData.potenciaVAD_HP, 2)}
            </div>
            <span style={{ fontSize: '0.68rem', color: '#d97706', fontWeight: 700 }}>kW facturable</span>
          </div>

          <div
            style={{
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              borderRadius: '5px',
              padding: '0.3rem 0.45rem',
              fontSize: '0.63rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
              <span>Base de cálculo:</span>
              <span style={{ color: '#fbbf24', fontWeight: 700 }}>{vadData.top2_HP.length} mes(es) con datos</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fed7aa' }}>
              <span>Tarifa VAD HP:</span>
              <span>S/. {formatearNumero(vadData.tarifaVAD_HP, 3)} /kW</span>
            </div>
          </div>

          <div style={{ borderTop: '1px dashed rgba(245, 158, 11, 0.25)', paddingTop: '0.3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '0.66rem', color: '#d97706', fontWeight: 600 }}>Facturado S/.:</span>
            <span style={{ fontSize: '0.92rem', fontWeight: 900, color: '#fde047' }}>
              S/. {formatearNumero(vadData.costoVAD_HP_PEN, 2)}
            </span>
          </div>
        </div>

        {/* BLOQUE VAD HFP */}
        <div
          style={{
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '8px',
            padding: '0.65rem 0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 800, textTransform: 'uppercase' }}>
              VAD - Fuera Punta
            </span>
            <span style={{ fontSize: '0.62rem', color: '#bae6fd', background: 'rgba(56, 189, 248, 0.2)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
              Exceso sobre HP
            </span>
          </div>

          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#f0f9ff', lineHeight: 1.1 }}>
              {formatearNumero(vadData.potenciaVAD_HFP, 2)}
            </div>
            <span style={{ fontSize: '0.68rem', color: '#0284c7', fontWeight: 700 }}>kW exceso</span>
          </div>

          <div
            style={{
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              borderRadius: '5px',
              padding: '0.3rem 0.45rem',
              fontSize: '0.63rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
              <span>Promedio HFP:</span>
              <span style={{ color: '#38bdf8', fontWeight: 700 }}>{formatearNumero(vadData.promedioTop2_HFP, 2)} kW</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7dd3fc' }}>
              <span>Tarifa VAD HFP:</span>
              <span>S/. {formatearNumero(vadData.tarifaVAD_HFP, 3)} /kW</span>
            </div>
          </div>

          <div style={{ borderTop: '1px dashed rgba(56, 189, 248, 0.25)', paddingTop: '0.3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '0.66rem', color: '#0284c7', fontWeight: 600 }}>Facturado S/.:</span>
            <span style={{ fontSize: '0.92rem', fontWeight: 900, color: '#38bdf8' }}>
              S/. {formatearNumero(vadData.costoVAD_HFP_PEN, 2)}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Resumen Total Facturable VAD (HP + HFP) */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(88, 28, 135, 0.25) 0%, rgba(30, 27, 75, 0.45) 100%)',
          border: '1px solid rgba(168, 85, 247, 0.4)',
          borderRadius: '8px',
          padding: '0.55rem 0.8rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '0.2rem',
        }}
      >
        <div>
          <div style={{ fontSize: '0.68rem', color: '#d8b4fe', textTransform: 'uppercase', fontWeight: 800 }}>
            Total Facturable VAD (Distribución):
          </div>
          <div style={{ fontSize: '0.63rem', color: '#a78bfa' }}>
            VAD HP (S/. {formatearNumero(vadData.costoVAD_HP_PEN, 2)}) + VAD HFP (S/. {formatearNumero(vadData.costoVAD_HFP_PEN, 2)})
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#f3e8ff', lineHeight: 1.1 }}>
            S/. {formatearNumero(vadData.costoTotalVAD_PEN, 2)}
          </div>
          <span style={{ fontSize: '0.62rem', color: '#cbd5e1' }}>sin IGV</span>
        </div>
      </div>

      {/* 5. Grilla Mini de los 6 Meses Evaluados */}
      <div style={{ marginTop: '0.25rem', borderTop: '1px solid #1e293b', paddingTop: '0.45rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
          <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700 }}>
            Historial 6 Meses Evaluados ({vadData.mesesEvaluados[0]?.periodo} a {vadData.mesesEvaluados[5]?.periodo}):
          </span>
          <span style={{ fontSize: '0.62rem', color: '#a78bfa' }}>
            {vadData.mesesEvaluados.filter((m) => m.tieneDatos).length} de 6 con datos
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.25rem' }}>
          {vadData.mesesEvaluados.map((m) => {
            const esMesFacturar = m.periodo === vadData.periodoFacturacion;
            const esTopHP = vadData.top2_HP.some((t) => t.periodo === m.periodo);

            return (
              <div
                key={m.periodo}
                title={`${m.mesNombre} (${m.periodo}): HP=${formatearNumero(m.potenciaHP_KW, 2)} kW, HFP=${formatearNumero(m.potenciaHFP_KW, 2)} kW`}
                style={{
                  background: esMesFacturar ? 'rgba(56, 189, 248, 0.15)' : 'rgba(15, 23, 42, 0.7)',
                  border: esTopHP ? '1px solid #f59e0b' : (esMesFacturar ? '1px solid #38bdf8' : '1px solid #1e293b'),
                  borderRadius: '5px',
                  padding: '0.25rem 0.2rem',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.58rem', color: esMesFacturar ? '#38bdf8' : '#94a3b8', fontWeight: 700 }}>
                  {m.periodo.split('-')[1]}/{m.periodo.split('-')[0].slice(2)}
                </div>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: m.potenciaHP_KW > 0 ? '#fbbf24' : '#64748b' }}>
                  {m.potenciaHP_KW > 0 ? formatearNumero(m.potenciaHP_KW, 0) : '—'}
                </div>
                <div style={{ fontSize: '0.62rem', color: m.potenciaHFP_KW > 0 ? '#38bdf8' : '#475569' }}>
                  {m.potenciaHFP_KW > 0 ? formatearNumero(m.potenciaHFP_KW, 0) : '—'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Educativo / Informativo de Cálculo VAD */}
      {mostrarModalInfo && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setMostrarModalInfo(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0f172a',
              border: '1px solid #7c3aed',
              borderRadius: '12px',
              maxWidth: '560px',
              width: '100%',
              padding: '1.25rem',
              color: '#f8fafc',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.7)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Cpu size={20} color="#a78bfa" />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#f8fafc' }}>
                  ¿Cómo se calcula el VAD (Horas Punta y Fuera de Punta)?
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setMostrarModalInfo(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div>
                <strong style={{ color: '#fbbf24' }}>1. Potencia VAD Horas Punta (HP):</strong>
                <p style={{ margin: '0.2rem 0 0 0' }}>
                  Según el pliego de Osinergmin, corresponde a la potencia de distribución calculada como el <strong>promedio de las dos (2) mayores demandas máximas en Horas Punta de los últimos seis (6) meses</strong> móviles, incluyendo el mes a facturar.
                </p>
              </div>

              <div>
                <strong style={{ color: '#38bdf8' }}>2. Potencia VAD Horas Fuera de Punta (HFP):</strong>
                <p style={{ margin: '0.2rem 0 0 0' }}>
                  Se evalúa con el mismo criterio (promedio de las 2 mayores demandas en HFP de los últimos 6 meses). Si este promedio <strong>supera</strong> a la potencia facturada en Horas Punta, se factura únicamente el <strong>exceso</strong>:
                </p>
                <div style={{ background: '#1e293b', padding: '0.4rem 0.6rem', borderRadius: '6px', fontFamily: 'monospace', color: '#7dd3fc', marginTop: '0.25rem' }}>
                  Potencia VAD HFP = Max(0, Promedio Top 2 HFP - Potencia VAD HP)
                </div>
              </div>

              <div>
                <strong style={{ color: '#a78bfa' }}>3. Dinamismo y Persistencia:</strong>
                <p style={{ margin: '0.2rem 0 0 0' }}>
                  Si se cuenta con un solo mes registrado en el histórico (ej. Agosto con 692.59 kW HP / 688.61 kW HFP), el sistema toma dicho valor como referencia. Conforme inyectes los meses anteriores (Marzo a Julio) en el <strong>Histórico de Potencias</strong>, este módulo promediará automáticamente los 2 picos más altos de forma persistente.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMostrarModalInfo(false)}
              style={{
                background: '#7c3aed',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                padding: '0.45rem',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CardCalculoVAD;
