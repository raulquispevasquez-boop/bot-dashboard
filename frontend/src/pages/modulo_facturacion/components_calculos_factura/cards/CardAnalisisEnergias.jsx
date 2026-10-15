import React, { useState } from 'react';
import { Activity, Clock, Zap, RefreshCw, ChevronDown, CheckCircle2, Info, DollarSign } from 'lucide-react';
import { getTrelloCardStyle } from '../../components_configuracion_variables/utils/trelloCardStyles';

const formatearNumero = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || isNaN(valor)) return '0.00';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

const CardAnalisisEnergias = ({ resultado, variables, origenDatos, onRecalcular }) => {
  const [hovered, setHovered] = useState(false);
  const [circuitoSeleccionado, setCircuitoSeleccionado] = useState('total');

  if (!resultado || !resultado.consolidado) {
    return (
      <div
        style={{
          ...getTrelloCardStyle('#38bdf8', false),
          width: '450px',
          maxWidth: '490px',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
          No hay datos de registros de energía disponibles para analizar.
        </div>
      </div>
    );
  }

  const { consolidado, circuitos, meta } = resultado;

  // Determinar los datos de energía activos según la celda/circuito seleccionado
  const datosActivos = circuitoSeleccionado === 'total'
    ? consolidado
    : (circuitos.find((c) => c.key === circuitoSeleccionado) || consolidado);

  const nombreVista = circuitoSeleccionado === 'total'
    ? 'Total Consolidado (Toda la Planta)'
    : datosActivos.esVirtual
      ? `🟣 [VIRTUAL] ${datosActivos.alias}`
      : (datosActivos.alias || datosActivos.headerOriginal || 'Circuito');

  // Parámetros comerciales y tarifas desde Botón 3 (Configuración de Variables)
  const tarifas = variables?.tarifas || {};
  const tipoCambio = parseFloat(variables?.tipoCambio?.valor) || 3.748;
  const fuenteTC = variables?.tipoCambio?.fuente || 'SBS';
  const unidadTarifa = tarifas.unidadEnergia || 'USD/MWh';

  const tarifaHP = parseFloat(
    tarifas.tarifaEnergiaHP !== undefined ? tarifas.tarifaEnergiaHP : (tarifas.tarifaEnergia ?? 58.50)
  ) || 0;

  const tarifaHFP = parseFloat(
    tarifas.tarifaEnergiaHFP !== undefined ? tarifas.tarifaEnergiaHFP : (tarifas.tarifaEnergia ?? 58.50)
  ) || 0;

  const esPorMWh = unidadTarifa.toUpperCase().includes('MWH');
  const baseHP = esPorMWh ? (datosActivos.hp_MWh || 0) : (datosActivos.hp_kWh || 0);
  const baseHFP = esPorMWh ? (datosActivos.hfp_MWh || 0) : (datosActivos.hfp_kWh || 0);

  // Cálculos de costo monetario (SIN IGV)
  const costoHP_USD = baseHP * tarifaHP;
  const costoHP_PEN = costoHP_USD * tipoCambio;

  const costoHFP_USD = baseHFP * tarifaHFP;
  const costoHFP_PEN = costoHFP_USD * tipoCambio;

  const costoTotal_USD = costoHP_USD + costoHFP_USD;
  const costoTotal_PEN = costoTotal_USD * tipoCambio;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...getTrelloCardStyle(datosActivos.esVirtual ? '#c084fc' : '#38bdf8', hovered),
        width: '450px',
        maxWidth: '490px',
        minWidth: '370px',
        flex: '0 0 auto',
      }}
    >
      {/* Cabecera del Cuadro Trello */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div
            style={{
              padding: '0.45rem',
              borderRadius: '8px',
              background: datosActivos.esVirtual ? 'rgba(168, 85, 247, 0.2)' : 'rgba(56, 189, 248, 0.15)',
              color: datosActivos.esVirtual ? '#c084fc' : '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Activity size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
              Energía sin Pérdidas de Generación
            </h3>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Clock size={11} color={datosActivos.esVirtual ? '#c084fc' : '#38bdf8'} />
              Medición directa en sede (HP vs HFP sin pérdidas)
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onRecalcular}
          title="Recalcular con últimas variables y datos"
          style={{
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid #334155',
            borderRadius: '6px',
            color: '#94a3b8',
            padding: '0.3rem 0.45rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontSize: '0.7rem',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#38bdf8'; e.currentTarget.style.borderColor = '#38bdf8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#334155'; }}
        >
          <RefreshCw size={12} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Selector de Circuito / Totalizador */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Visualización
          </span>
          <span style={{ fontSize: '0.68rem', color: datosActivos.esVirtual ? '#c084fc' : '#38bdf8', fontWeight: 600 }}>
            {circuitoSeleccionado === 'total'
              ? `${circuitos.filter((c) => !c.esVirtual).length} Celdas sumadas`
              : datosActivos.esVirtual
                ? 'Medidor Virtual Calculado'
                : 'Celda individual'}
          </span>
        </div>
        <div style={{ position: 'relative' }}>
          <select
            value={circuitoSeleccionado}
            onChange={(e) => setCircuitoSeleccionado(e.target.value)}
            style={{
              width: '100%',
              background: '#0a101f',
              border: datosActivos.esVirtual ? '1px solid rgba(168, 85, 247, 0.5)' : '1px solid #293548',
              borderRadius: '7px',
              padding: '0.45rem 0.7rem',
              color: '#f1f5f9',
              fontSize: '0.8rem',
              fontWeight: 600,
              outline: 'none',
              appearance: 'none',
              cursor: 'pointer',
              paddingRight: '1.8rem',
            }}
          >
            <option value="total">⚡ Toda la Planta (Total Consolidado)</option>
            {circuitos.map((c) => (
              <option key={c.key} value={c.key}>
                {c.esVirtual ? '🟣 [VIRTUAL] ' : '🔹 '}
                {c.alias} {c.codigo && !c.esVirtual ? `(${c.codigo})` : ''}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            color="#64748b"
            style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
        </div>
      </div>

      {/* Barra de Proporción HP vs HFP */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
          <span style={{ color: '#fbbf24', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fbbf24', display: 'inline-block' }} />
            HP: {formatearNumero(datosActivos.porcentajeHP, 1)}%
          </span>
          <span style={{ color: '#38bdf8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            HFP: {formatearNumero(datosActivos.porcentajeHFP, 1)}%
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#38bdf8', display: 'inline-block' }} />
          </span>
        </div>
        <div style={{ width: '100%', height: '7px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
          <div
            style={{
              width: `${Math.min(100, Math.max(0, datosActivos.porcentajeHP))}%`,
              background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
              transition: 'width 0.4s ease',
            }}
          />
          <div
            style={{
              width: `${Math.min(100, Math.max(0, datosActivos.porcentajeHFP))}%`,
              background: 'linear-gradient(90deg, #0284c7, #38bdf8)',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {/* Tarjetas de Datos de Energía (HP y HFP) con Costos en USD y Soles (Sin IGV) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.2rem' }}>
        {/* 1. Horas Punta (HP) */}
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
              Horas Punta (HP)
            </span>
            <span style={{ fontSize: '0.68rem', color: '#fef08a', background: 'rgba(245, 158, 11, 0.2)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
              {formatearNumero(datosActivos.porcentajeHP, 1)}%
            </span>
          </div>

          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fef3c7', lineHeight: 1.1 }}>
              {formatearNumero(datosActivos.hp_kWh, 2)}
            </div>
            <span style={{ fontSize: '0.68rem', color: '#d97706', fontWeight: 600 }}>kWh</span>
          </div>

          <div style={{ borderTop: '1px dashed rgba(245, 158, 11, 0.2)', paddingTop: '0.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '0.66rem', color: '#d97706' }}>Equivalente:</span>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#fef08a' }}>
              {formatearNumero(datosActivos.hp_MWh, 3)} <span style={{ fontSize: '0.64rem' }}>MWh</span>
            </span>
          </div>

          {/* Bloque de Costos HP (Sin IGV) */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '6px',
              padding: '0.4rem 0.55rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.15rem',
              marginTop: '0.15rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem' }}>
              <span style={{ color: '#d97706', fontWeight: 600 }}>Tarifa HP:</span>
              <span style={{ color: '#fef3c7', fontWeight: 700 }}>
                ${formatearNumero(tarifaHP, 2)} <span style={{ fontSize: '0.6rem', color: '#a3a3a3' }}>{unidadTarifa.split('/')[1] || 'MWh'}</span>
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.15rem' }}>
              <span style={{ fontSize: '0.66rem', color: '#fbbf24', fontWeight: 700 }}>Costo USD:</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fef08a' }}>
                $ {formatearNumero(costoHP_USD, 2)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '0.66rem', color: '#d97706', fontWeight: 600 }}>Costo Soles:</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fed7aa' }}>
                S/. {formatearNumero(costoHP_PEN, 2)}
              </span>
            </div>
            <span style={{ fontSize: '0.58rem', color: '#a3a3a3', textAlign: 'right' }}>sin IGV</span>
          </div>
        </div>

        {/* 2. Horas Fuera de Punta (HFP) */}
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
              Fuera Punta (HFP)
            </span>
            <span style={{ fontSize: '0.68rem', color: '#bae6fd', background: 'rgba(56, 189, 248, 0.2)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
              {formatearNumero(datosActivos.porcentajeHFP, 1)}%
            </span>
          </div>

          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#e0f2fe', lineHeight: 1.1 }}>
              {formatearNumero(datosActivos.hfp_kWh, 2)}
            </div>
            <span style={{ fontSize: '0.68rem', color: '#0284c7', fontWeight: 600 }}>kWh</span>
          </div>

          <div style={{ borderTop: '1px dashed rgba(56, 189, 248, 0.2)', paddingTop: '0.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '0.66rem', color: '#0284c7' }}>Equivalente:</span>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#bae6fd' }}>
              {formatearNumero(datosActivos.hfp_MWh, 3)} <span style={{ fontSize: '0.64rem' }}>MWh</span>
            </span>
          </div>

          {/* Bloque de Costos HFP (Sin IGV) */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '6px',
              padding: '0.4rem 0.55rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.15rem',
              marginTop: '0.15rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem' }}>
              <span style={{ color: '#0284c7', fontWeight: 600 }}>Tarifa HFP:</span>
              <span style={{ color: '#e0f2fe', fontWeight: 700 }}>
                ${formatearNumero(tarifaHFP, 2)} <span style={{ fontSize: '0.6rem', color: '#a3a3a3' }}>{unidadTarifa.split('/')[1] || 'MWh'}</span>
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.15rem' }}>
              <span style={{ fontSize: '0.66rem', color: '#38bdf8', fontWeight: 700 }}>Costo USD:</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#bae6fd' }}>
                $ {formatearNumero(costoHFP_USD, 2)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '0.66rem', color: '#0284c7', fontWeight: 600 }}>Costo Soles:</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#93c5fd' }}>
                S/. {formatearNumero(costoHFP_PEN, 2)}
              </span>
            </div>
            <span style={{ fontSize: '0.58rem', color: '#a3a3a3', textAlign: 'right' }}>sin IGV</span>
          </div>
        </div>
      </div>

      {/* 3. Fila de Total de Energía y Costo Consolidado (Sin IGV) */}
      <div
        style={{
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '8px',
          padding: '0.6rem 0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.45rem',
          marginTop: '0.2rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#10b981' }} />
            <div>
              <div style={{ fontSize: '0.74rem', color: '#6ee7b7', fontWeight: 700, textTransform: 'uppercase' }}>
                Energía Total Activa (Sin Pérdidas)
              </div>
              <div style={{ fontSize: '0.66rem', color: '#059669' }}>
                {nombreVista}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.02rem', fontWeight: 800, color: '#ecfdf5', lineHeight: 1.1 }}>
              {formatearNumero(datosActivos.total_kWh, 2)} <span style={{ fontSize: '0.68rem', color: '#6ee7b7', fontWeight: 600 }}>kWh</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#a7f3d0', fontWeight: 600 }}>
              {formatearNumero(datosActivos.total_MWh, 3)} MWh
            </div>
          </div>
        </div>

        {/* Totales Monetarios en Dólares y Soles */}
        <div
          style={{
            background: 'rgba(6, 78, 59, 0.3)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderRadius: '6px',
            padding: '0.45rem 0.7rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '0.65rem', color: '#6ee7b7', textTransform: 'uppercase', fontWeight: 700 }}>
              Costo Total Energía sin Pérdidas (Sin IGV):
            </div>
            <div style={{ fontSize: '0.63rem', color: '#a7f3d0' }}>
              TC: S/. {formatearNumero(tipoCambio, 3)} ({fuenteTC})
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#34d399', lineHeight: 1.1 }}>
              $ {formatearNumero(costoTotal_USD, 2)} <span style={{ fontSize: '0.65rem', color: '#a7f3d0' }}>USD</span>
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#6ee7b7' }}>
              S/. {formatearNumero(costoTotal_PEN, 2)} <span style={{ fontSize: '0.65rem' }}>PEN</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pie de detalles normativos y origen */}
      <div
        style={{
          borderTop: '1px solid #1e293b',
          paddingTop: '0.45rem',
          marginTop: '0.35rem',
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
            <span>Horas Punta: <strong>{meta?.horarioConfigurado || '18:00 - 23:00'}</strong> (Lun–Sáb)</span>
          </span>
          <span style={{ color: '#94a3b8' }}>
            Domingos y {meta?.totalDiasNoLaborables || 0} feriados: 100% HFP
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Info size={11} color="#38bdf8" />
            <span>Datos: {origenDatos || 'Registros de Botón 1'}</span>
          </span>
          <span style={{ color: '#38bdf8', fontWeight: 600 }}>
            {consolidado.conteoHP} HP / {consolidado.conteoHFP} HFP ({consolidado.totalIntervalos} intervalos)
          </span>
        </div>
      </div>
    </div>
  );
};

export default CardAnalisisEnergias;
