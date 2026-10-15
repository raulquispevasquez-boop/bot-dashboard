import React, { useState } from 'react';
import { Zap, Clock, Calendar, ChevronDown, CheckCircle2, Info, TrendingUp, Cpu } from 'lucide-react';
import { getTrelloCardStyle } from '../../components_configuracion_variables/utils/trelloCardStyles';
import { adaptarNombreAPotencia } from '../../medidores_virtuales/useMedidoresVirtuales';

const ACCENT = '#a855f7';

const formatearNumero = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || isNaN(valor)) return '0.00';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

const CardCalculoMaximasDemandas = ({ resultado, variables }) => {
  const [hovered, setHovered] = useState(false);
  const [circuitoSeleccionado, setCircuitoSeleccionado] = useState('total');

  if (!resultado || !resultado.consolidado) {
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
          No hay registros de potencia disponibles para calcular máximas demandas.
        </div>
      </div>
    );
  }

  const { consolidado, circuitos, meta } = resultado;

  // Determinar los datos activos según la vista seleccionada
  const datosActivos = circuitoSeleccionado === 'total'
    ? consolidado
    : (circuitos.find((c) => c.key === circuitoSeleccionado) || consolidado);

  const nombreVista = circuitoSeleccionado === 'total'
    ? 'Toda la Planta (Total Consolidado)'
    : datosActivos.esVirtual
      ? `🟣 [VIRTUAL] ${adaptarNombreAPotencia(datosActivos.alias)}`
      : (adaptarNombreAPotencia(datosActivos.alias) || 'Circuito');

  const maxHP = datosActivos.maxHP || { potenciaKW: 0, potenciaMW: 0, fechaDisplay: '—', horaDisplay: '—' };
  const maxHFP = datosActivos.maxHFP || { potenciaKW: 0, potenciaMW: 0, fechaDisplay: '—', horaDisplay: '—' };

  // Diferencia entre la máxima demanda en HP y HFP
  const deltaDemanda = maxHP.potenciaKW - maxHFP.potenciaKW;
  const mayorEsHP = deltaDemanda >= 0;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...getTrelloCardStyle(datosActivos.esVirtual ? '#c084fc' : ACCENT, hovered),
        width: '450px',
        maxWidth: '490px',
        minWidth: '370px',
        flex: '0 0 auto',
      }}
    >
      {/* 1. Cabecera estilo Trello */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div
            style={{
              padding: '0.45rem',
              borderRadius: '8px',
              background: 'rgba(168, 85, 247, 0.15)',
              color: ACCENT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <TrendingUp size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
              Máximas Demandas
            </h3>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Clock size={11} color={ACCENT} />
              Picos Registrados en HP y HFP (kW)
            </span>
          </div>
        </div>

        <span
          style={{
            fontSize: '0.67rem',
            background: 'rgba(168, 85, 247, 0.18)',
            border: '1px solid rgba(168, 85, 247, 0.35)',
            color: '#d8b4fe',
            padding: '0.2rem 0.5rem',
            borderRadius: '12px',
            fontWeight: 700,
          }}
        >
          {meta?.totalRegistros ? `${meta.totalRegistros.toLocaleString('es-PE')} intervalos` : '15 min'}
        </span>
      </div>

      {/* 2. Selector de Vista (Total Consolidado, Medidores Virtuales o Celdas Físicas) */}
      <div style={{ marginTop: '0.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
          <span style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
            Visualización
          </span>
          <span style={{ fontSize: '0.66rem', color: '#c084fc', fontWeight: 600 }}>
            {circuitos.length} opciones disponibles
          </span>
        </div>

        <div style={{ position: 'relative' }}>
          <select
            value={circuitoSeleccionado}
            onChange={(e) => setCircuitoSeleccionado(e.target.value)}
            style={{
              width: '100%',
              padding: '0.45rem 2rem 0.45rem 0.65rem',
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
            <option value="total">⚡ Toda la Planta (Total Consolidado)</option>

            {circuitos.some((c) => c.esVirtual) && (
              <optgroup label="🟣 Medidores Virtualizados">
                {circuitos
                  .filter((c) => c.esVirtual)
                  .map((c) => (
                    <option key={c.key} value={c.key}>
                      🟣 {adaptarNombreAPotencia(c.alias)}
                    </option>
                  ))}
              </optgroup>
            )}

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

      {/* 3. Bloques de Demanda Máxima en HP y HFP */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
        {/* BLOQUE A: Horas Punta (HP) */}
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: '8px',
            padding: '0.65rem 0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 700, textTransform: 'uppercase' }}>
              Máxima Demanda HP
            </span>
            <span style={{ fontSize: '0.64rem', color: '#fde68a', background: 'rgba(245, 158, 11, 0.2)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
              Horas Punta
            </span>
          </div>

          <div>
            <div style={{ fontSize: '1.24rem', fontWeight: 800, color: '#fef3c7', lineHeight: 1.1 }}>
              {formatearNumero(maxHP.potenciaKW, 2)}
            </div>
            <span style={{ fontSize: '0.68rem', color: '#d97706', fontWeight: 600 }}>kW</span>
          </div>

          <div style={{ borderTop: '1px dashed rgba(245, 158, 11, 0.2)', paddingTop: '0.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '0.66rem', color: '#d97706' }}>Equivalente:</span>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#fed7aa' }}>
              {formatearNumero(maxHP.potenciaMW, 3)} <span style={{ fontSize: '0.64rem' }}>MW</span>
            </span>
          </div>

          {/* Fecha y Hora del Pico HP */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '6px',
              padding: '0.4rem 0.55rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.2rem',
              marginTop: '0.15rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.68rem' }}>
              <Calendar size={11} color="#fbbf24" />
              <span style={{ color: '#f8fafc', fontWeight: 700 }}>{maxHP.fechaDisplay}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.68rem' }}>
              <Clock size={11} color="#fbbf24" />
              <span style={{ color: '#fde68a', fontWeight: 800 }}>{maxHP.horaDisplay} hrs</span>
            </div>
          </div>
        </div>

        {/* BLOQUE B: Horas Fuera de Punta (HFP) */}
        <div
          style={{
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '8px',
            padding: '0.65rem 0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase' }}>
              Máxima Demanda HFP
            </span>
            <span style={{ fontSize: '0.64rem', color: '#bae6fd', background: 'rgba(56, 189, 248, 0.2)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
              Fuera Punta
            </span>
          </div>

          <div>
            <div style={{ fontSize: '1.24rem', fontWeight: 800, color: '#e0f2fe', lineHeight: 1.1 }}>
              {formatearNumero(maxHFP.potenciaKW, 2)}
            </div>
            <span style={{ fontSize: '0.68rem', color: '#0284c7', fontWeight: 600 }}>kW</span>
          </div>

          <div style={{ borderTop: '1px dashed rgba(56, 189, 248, 0.2)', paddingTop: '0.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '0.66rem', color: '#0284c7' }}>Equivalente:</span>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#bae6fd' }}>
              {formatearNumero(maxHFP.potenciaMW, 3)} <span style={{ fontSize: '0.64rem' }}>MW</span>
            </span>
          </div>

          {/* Fecha y Hora del Pico HFP */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '6px',
              padding: '0.4rem 0.55rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.2rem',
              marginTop: '0.15rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.68rem' }}>
              <Calendar size={11} color="#38bdf8" />
              <span style={{ color: '#f8fafc', fontWeight: 700 }}>{maxHFP.fechaDisplay}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.68rem' }}>
              <Clock size={11} color="#38bdf8" />
              <span style={{ color: '#bae6fd', fontWeight: 800 }}>{maxHFP.horaDisplay} hrs</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Resumen Comparativo de Picos */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.65)',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '0.55rem 0.75rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.72rem',
        }}
      >
        <span style={{ color: '#94a3b8' }}>Diferencia (Punta vs Fuera de Punta):</span>
        <span style={{ fontWeight: 800, color: mayorEsHP ? '#fbbf24' : '#38bdf8' }}>
          {mayorEsHP ? `+${formatearNumero(deltaDemanda, 2)} kW` : `${formatearNumero(deltaDemanda, 2)} kW`}
          <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 400, marginLeft: '4px' }}>
            ({mayorEsHP ? 'Punta es mayor' : 'Fuera de Punta es mayor'})
          </span>
        </span>
      </div>

      {/* 5. Pie de detalles y trazabilidad */}
      <div
        style={{
          borderTop: '1px solid #1e293b',
          paddingTop: '0.45rem',
          marginTop: '0.1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
          fontSize: '0.69rem',
          color: '#64748b',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <CheckCircle2 size={12} color="#10b981" />
            <span>Horario Punta COES: <strong>{meta?.horarioConfigurado || '18:00 - 23:00'}</strong></span>
          </span>
          <span style={{ color: '#94a3b8' }}>
            Osinergmin / COES
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Info size={11} color="#a855f7" />
            <span>{meta?.totalIntervalosHP || 440} HP · {meta?.totalIntervalosHFP || 2057} HFP</span>
          </span>
          <span style={{ color: '#c084fc', fontWeight: 600 }}>
            {nombreVista}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CardCalculoMaximasDemandas;
