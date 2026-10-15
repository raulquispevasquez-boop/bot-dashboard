import React, { useState, useMemo } from 'react';
import { Target, Zap, Clock, Calendar, CheckCircle2, DollarSign, Info, ChevronDown } from 'lucide-react';
import { getTrelloCardStyle } from '../../components_configuracion_variables/utils/trelloCardStyles';
import { buscarPotenciaCoincidente } from '../../components_registro_potencia/utils/buscarPotenciaCoincidente';
import { adaptarNombreAPotencia } from '../../medidores_virtuales/useMedidoresVirtuales';

const ACCENT = '#f59e0b';

const formatearNumero = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || isNaN(valor)) return '0.00';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

const formatearFechaDisplay = (fechaStr) => {
  if (!fechaStr) return '—';
  const match = fechaStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    return `${d}/${m}/${y}`;
  }
  return fechaStr;
};

const CardCalculoDemandaCoincidente = ({ variables }) => {
  const [hovered, setHovered] = useState(false);
  const [circuitoSeleccionado, setCircuitoSeleccionado] = useState('virtual_default');

  const demanda = variables?.demandaCoincidente || {};
  const tarifas = variables?.tarifas || {};
  const tipoCambio = parseFloat(variables?.tipoCambio?.valor) || 3.748;
  const fuenteTC = variables?.tipoCambio?.fuente || 'SBS';

  const fechaCoincidente = demanda.fecha || '2026-08-26';
  const horaCoincidente = demanda.hora || '19:00';

  // Búsqueda en los registros de potencia (kW) para la fecha y hora seleccionada
  const resultadoRegistro = useMemo(() => {
    return buscarPotenciaCoincidente(fechaCoincidente, horaCoincidente);
  }, [fechaCoincidente, horaCoincidente]);

  const circuitos = resultadoRegistro?.circuitos || [];

  // Clave del circuito activo (por defecto medidor virtual si existe, o total)
  const circuitoActivoKey = circuitoSeleccionado === 'virtual_default'
    ? (resultadoRegistro?.medidorVirtualKey || 'total')
    : circuitoSeleccionado;

  // Determinar los datos del circuito / medidor seleccionado
  let potenciaKW = 0;
  let potenciaMW = 0;
  let nombreFuenteActiva = 'Consolidado Físico Planta';
  let esVirtualActivo = false;
  let desgloseActivo = [];

  if (circuitoActivoKey === 'total') {
    potenciaKW = resultadoRegistro?.totalFisicoKW ?? 0;
    potenciaMW = resultadoRegistro?.totalFisicoMW ?? 0;
    nombreFuenteActiva = 'Toda la Planta (Total Consolidado)';
    esVirtualActivo = false;
    desgloseActivo = [];
  } else if (resultadoRegistro?.medidorVirtualKey && circuitoActivoKey === resultadoRegistro.medidorVirtualKey) {
    potenciaKW = resultadoRegistro.potenciaKW;
    potenciaMW = resultadoRegistro.potenciaMW;
    nombreFuenteActiva = resultadoRegistro.nombreFuente;
    esVirtualActivo = true;
    desgloseActivo = resultadoRegistro.desglose || [];
  } else {
    const circ = circuitos.find((c) => c.key === circuitoActivoKey);
    if (circ) {
      potenciaKW = circ.potenciaKW;
      potenciaMW = circ.potenciaMW;
      nombreFuenteActiva = circ.alias;
      esVirtualActivo = circ.esVirtual;
      desgloseActivo = circ.esVirtual ? (resultadoRegistro?.desglose || []) : [];
    } else {
      potenciaKW = resultadoRegistro?.potenciaKW ?? 0;
      potenciaMW = resultadoRegistro?.potenciaMW ?? 0;
      nombreFuenteActiva = resultadoRegistro?.nombreFuente ?? 'Coincidente';
      esVirtualActivo = resultadoRegistro?.esVirtual ?? false;
      desgloseActivo = resultadoRegistro?.desglose || [];
    }
  }

  // Precio unitario por kW (desde demandaCoincidente o fallback a tarifaPotencia)
  const precioUnitarioKW = parseFloat(
    demanda.precioUnitarioKW !== undefined && demanda.precioUnitarioKW !== null
      ? demanda.precioUnitarioKW
      : (tarifas.tarifaPotencia ?? 6.620)
  ) || 0;

  // Cálculos de costo monetario (SIN IGV)
  const costoTotal_USD = potenciaKW * precioUnitarioKW;
  const costoTotal_PEN = costoTotal_USD * tipoCambio;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...getTrelloCardStyle(esVirtualActivo ? '#c084fc' : ACCENT, hovered),
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
              background: 'rgba(245, 158, 11, 0.15)',
              color: ACCENT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Target size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
              Demanda Coincidente (SEIN)
            </h3>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Clock size={11} color={ACCENT} />
              Máxima Demanda del Sistema COES
            </span>
          </div>
        </div>

        <span
          style={{
            fontSize: '0.67rem',
            background: 'rgba(245, 158, 11, 0.18)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            color: '#fbbf24',
            padding: '0.2rem 0.5rem',
            borderRadius: '12px',
            fontWeight: 700,
          }}
        >
          Potencia Facturable
        </span>
      </div>

      {/* Momento de Coincidencia (Fecha y Hora del SEIN) */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '0.55rem 0.75rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '0.2rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <Calendar size={14} color="#38bdf8" />
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Momento de Máxima Demanda:</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#f1f5f9' }}>
            {formatearFechaDisplay(fechaCoincidente)}
          </span>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', padding: '1px 6px', borderRadius: '4px' }}>
            {horaCoincidente} hrs
          </span>
        </div>
      </div>

      {/* Selector de Visualización (Total Consolidado, Medidores Virtuales o Celdas Físicas) */}
      <div style={{ marginTop: '0.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
          <span style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
            Visualización
          </span>
          <span style={{ fontSize: '0.66rem', color: esVirtualActivo ? '#c084fc' : '#fbbf24', fontWeight: 600 }}>
            {circuitos.length > 0 ? `${circuitos.length + 1} opciones disponibles` : 'Opciones de medición'}
          </span>
        </div>

        <div style={{ position: 'relative' }}>
          <select
            value={circuitoActivoKey}
            onChange={(e) => setCircuitoSeleccionado(e.target.value)}
            style={{
              width: '100%',
              padding: '0.45rem 2rem 0.45rem 0.65rem',
              background: '#090d16',
              border: esVirtualActivo ? '1px solid rgba(168, 85, 247, 0.45)' : '1px solid #334155',
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

      {/* Tarjeta de Potencia Coincidente (kW y MW) */}
      <div
        style={{
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '8px',
          padding: '0.7rem 0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 700, textTransform: 'uppercase' }}>
            Potencia Coincidente Registrada
          </span>
          <span style={{ fontSize: '0.67rem', color: '#fde68a', background: 'rgba(245, 158, 11, 0.2)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
            Demanda Coincidente
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.15rem' }}>
          <div>
            <div style={{ fontSize: '1.28rem', fontWeight: 800, color: '#fef3c7', lineHeight: 1.1 }}>
              {formatearNumero(potenciaKW, 2)}
            </div>
            <span style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: 600 }}>Kilowatts (kW)</span>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.02rem', fontWeight: 800, color: '#fed7aa' }}>
              {formatearNumero(potenciaMW, 3)}
            </div>
            <span style={{ fontSize: '0.68rem', color: '#d97706', fontWeight: 600 }}>Megawatts (MW)</span>
          </div>
        </div>

        {resultadoRegistro?.encontrado && (
          <div style={{ fontSize: '0.64rem', color: esVirtualActivo ? '#e9d5ff' : '#fde68a', background: esVirtualActivo ? 'rgba(168, 85, 247, 0.15)' : 'rgba(245, 158, 11, 0.1)', padding: '0.2rem 0.4rem', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <CheckCircle2 size={11} color={esVirtualActivo ? '#c084fc' : '#10b981'} />
              {esVirtualActivo ? `Medidor Virtual: ${adaptarNombreAPotencia(nombreFuenteActiva)}` : adaptarNombreAPotencia(nombreFuenteActiva)}
            </span>
            <span style={{ color: '#fed7aa', fontWeight: 600 }}>{resultadoRegistro.horaDisplay} hrs</span>
          </div>
        )}

        {/* Tarifa / Precio Unitario por kW */}
        <div
          style={{
            borderTop: '1px dashed rgba(245, 158, 11, 0.25)',
            paddingTop: '0.35rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.7rem',
          }}
        >
          <span style={{ color: '#d97706', fontWeight: 600 }}>Precio Unitario por kW:</span>
          <span style={{ color: '#fef3c7', fontWeight: 800, fontSize: '0.8rem' }}>
            $ {formatearNumero(precioUnitarioKW, 3)} <span style={{ fontSize: '0.64rem', color: '#fed7aa' }}>USD/kW</span>
          </span>
        </div>
      </div>

      {/* Bloque de Liquidación Monetaria (Sin IGV) */}
      <div
        style={{
          background: 'rgba(6, 78, 59, 0.25)',
          border: '1px solid rgba(16, 185, 129, 0.32)',
          borderRadius: '8px',
          padding: '0.65rem 0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
            <span style={{ fontSize: '0.73rem', color: '#6ee7b7', fontWeight: 700, textTransform: 'uppercase' }}>
              Costo Demanda Coincidente (Sin IGV)
            </span>
          </div>
          <span style={{ fontSize: '0.62rem', color: '#a7f3d0', background: 'rgba(16, 185, 129, 0.2)', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
            Neto
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '6px', padding: '0.45rem 0.7rem' }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: '#a7f3d0' }}>En Dólares Americanos:</div>
            <div style={{ fontSize: '1.08rem', fontWeight: 800, color: '#ecfdf5', lineHeight: 1.1 }}>
              $ {formatearNumero(costoTotal_USD, 2)} <span style={{ fontSize: '0.68rem', color: '#6ee7b7' }}>USD</span>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.65rem', color: '#a7f3d0' }}>En Soles Peruanos:</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#6ee7b7', lineHeight: 1.1 }}>
              S/. {formatearNumero(costoTotal_PEN, 2)} <span style={{ fontSize: '0.68rem' }}>PEN</span>
            </div>
          </div>
        </div>

        <div style={{ fontSize: '0.62rem', color: '#a7f3d0', display: 'flex', justifyContent: 'space-between' }}>
          <span>Fórmula: Potencia (kW) × PU ($/kW)</span>
          <span>TC Aplicado: S/. {formatearNumero(tipoCambio, 3)} ({fuenteTC})</span>
        </div>
      </div>

      {/* Pie de detalles normativos y origen */}
      <div
        style={{
          borderTop: '1px solid #1e293b',
          paddingTop: '0.45rem',
          marginTop: '0.2rem',
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
            <span>Fuente Coincidencia: <strong>Configuración Botón 3</strong></span>
          </span>
          <span style={{ color: '#94a3b8' }}>
            Osinergmin / COES
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Info size={11} color="#38bdf8" />
            <span>Precios contractuales netos sin IGV</span>
          </span>
          <span style={{ color: esVirtualActivo ? '#c084fc' : '#fbbf24', fontWeight: 700 }}>
            {potenciaMW > 0 ? `${formatearNumero(potenciaMW, 3)} MW coincidente` : '0 kW'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CardCalculoDemandaCoincidente;
