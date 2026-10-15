import React, { useState, useEffect, useCallback } from 'react';
import { Target, Search, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { getTrelloCardStyle, inputFieldStyle } from '../utils/trelloCardStyles';
import { buscarPotenciaCoincidente } from '../../components_registro_potencia/utils/buscarPotenciaCoincidente';
import { adaptarNombreAPotencia } from '../../medidores_virtuales/useMedidoresVirtuales';

const ACCENT = '#38bdf8';

const formatearNum = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || isNaN(valor)) return '0.00';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

const CardDemandaCoincidente = ({ data, onUpdate }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [mostrarDesglose, setMostrarDesglose] = useState(false);
  const [resultadoBusqueda, setResultadoBusqueda] = useState(null);

  const {
    fecha = '2026-08-26',
    hora = '19:00',
    potenciaKW = 0,
    precioUnitarioKW = 6.620,
  } = data || {};

  // Ejecuta la búsqueda en registros de potencia para la fecha y hora dadas
  const ejecutarBusqueda = useCallback((f, h, autoActualizarPotencia = true) => {
    if (!f || !h) return;
    const res = buscarPotenciaCoincidente(f, h);
    setResultadoBusqueda(res);

    if (res.encontrado && autoActualizarPotencia) {
      onUpdate({ fecha: f, hora: h, potenciaKW: res.potenciaKW });
    }
  }, [onUpdate]);

  // Al montar o si cambia fecha/hora externamente, verificar en registros
  useEffect(() => {
    if (fecha && hora) {
      const res = buscarPotenciaCoincidente(fecha, hora);
      setResultadoBusqueda(res);
      // Si la potencia actual es 0 y se encontró coincidencia en los datos, autocompletar
      if (res.encontrado && (potenciaKW === 0 || !potenciaKW)) {
        onUpdate({ potenciaKW: res.potenciaKW });
      }
    }
  }, [fecha, hora]);

  const handleFechaChange = (nuevaFecha) => {
    ejecutarBusqueda(nuevaFecha, hora, true);
    if (!resultadoBusqueda?.encontrado) {
      onUpdate({ fecha: nuevaFecha });
    }
  };

  const handleHoraChange = (nuevaHora) => {
    ejecutarBusqueda(fecha, nuevaHora, true);
    if (!resultadoBusqueda?.encontrado) {
      onUpdate({ hora: nuevaHora });
    }
  };

  const handleForzarRecalculo = () => {
    if (!fecha || !hora) return;
    const res = buscarPotenciaCoincidente(fecha, hora);
    setResultadoBusqueda(res);
    if (res.encontrado) {
      onUpdate({ potenciaKW: res.potenciaKW });
    }
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={getTrelloCardStyle(ACCENT, isHovered)}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: ACCENT }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.2)', border: '1px solid rgba(56, 189, 248, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Target size={17} color={ACCENT} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.86rem', color: '#f8fafc', fontWeight: 800 }}>
              Demanda Coincidente
            </h4>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Momento de Máxima Demanda COES</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleForzarRecalculo}
          title="Buscar automáticamente en el Registro de Potencias para esta fecha y hora"
          style={{
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            color: '#38bdf8',
            borderRadius: '6px',
            padding: '0.2rem 0.45rem',
            fontSize: '0.67rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            transition: 'all 0.15s ease',
          }}
        >
          <Search size={11} />
          <span>Buscar en Registros</span>
        </button>
      </div>

      {/* Selectores de Fecha y Hora */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
            Fecha Coincidente:
          </label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => handleFechaChange(e.target.value)}
            style={inputFieldStyle}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
            Hora Coincidente:
          </label>
          <input
            type="time"
            value={hora}
            onChange={(e) => handleHoraChange(e.target.value)}
            style={inputFieldStyle}
          />
        </div>
      </div>

      {/* Banner de Estado de Búsqueda en Registros */}
      {resultadoBusqueda && (
        <div
          style={{
            background: resultadoBusqueda.encontrado ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
            border: `1px solid ${resultadoBusqueda.encontrado ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
            borderRadius: '6px',
            padding: '0.4rem 0.6rem',
            fontSize: '0.68rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.3rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              {resultadoBusqueda.encontrado ? (
                <CheckCircle2 size={13} color="#10b981" />
              ) : (
                <AlertTriangle size={13} color="#f59e0b" />
              )}
              <span style={{ color: resultadoBusqueda.encontrado ? '#6ee7b7' : '#fcd34d', fontWeight: 700 }}>
                {resultadoBusqueda.encontrado
                  ? `✓ Coincidencia detectada: ${formatearNum(resultadoBusqueda.potenciaKW, 2)} kW`
                  : 'Sin lectura en registros de potencia'}
              </span>
            </div>

            {resultadoBusqueda.encontrado && resultadoBusqueda.desglose?.length > 0 && (
              <button
                type="button"
                onClick={() => setMostrarDesglose(!mostrarDesglose)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6ee7b7',
                  cursor: 'pointer',
                  fontSize: '0.65rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.15rem',
                  padding: 0,
                  fontWeight: 600,
                }}
              >
                {mostrarDesglose ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                <span>{mostrarDesglose ? 'Ocultar' : 'Desglose'}</span>
              </button>
            )}
          </div>

          {resultadoBusqueda.encontrado && (
            <div style={{ fontSize: '0.64rem', color: '#94a3b8' }}>
              Fuente: <strong style={{ color: resultadoBusqueda.esVirtual ? '#d8b4fe' : '#38bdf8' }}>{adaptarNombreAPotencia(resultadoBusqueda.nombreFuente)}</strong>
            </div>
          )}

          {/* Desglose de celdas con signos algebraicos (+ y -) */}
          {mostrarDesglose && resultadoBusqueda.encontrado && resultadoBusqueda.desglose?.length > 0 && (
            <div
              style={{
                marginTop: '0.2rem',
                paddingTop: '0.25rem',
                borderTop: '1px dashed rgba(16, 185, 129, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.2rem',
              }}
            >
              {resultadoBusqueda.desglose.map((circ) => (
                <div
                  key={circ.colKey}
                  style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: '0.64rem' }}
                >
                  <span style={{ color: circ.signo === '-' ? '#fca5a5' : '#94a3b8', fontWeight: circ.signo === '-' ? 600 : 400 }}>
                    {circ.signo === '-' ? '−' : '+'} {adaptarNombreAPotencia(circ.alias)}:
                  </span>
                  <span style={{ color: circ.signo === '-' ? '#f87171' : '#f8fafc', fontWeight: 700 }}>
                    {circ.signo === '-' ? `-${formatearNum(circ.valorKW, 2)}` : `+${formatearNum(circ.valorKW, 2)}`} kW
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.2rem', fontWeight: 800, color: '#6ee7b7' }}>
                <span>= Demanda Coincidente Neta:</span>
                <span>{formatearNum(resultadoBusqueda.potenciaKW, 2)} kW</span>
              </div>
            </div>
          )}

          {!resultadoBusqueda.encontrado && (
            <span style={{ color: '#fed7aa', fontSize: '0.63rem' }}>
              {resultadoBusqueda.mensaje}. Verifique que el archivo de potencias incluya esta fecha/hora.
            </span>
          )}
        </div>
      )}

      {/* Potencia Coincidente */}
      <div>
        <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
          Potencia Coincidente (kW):
        </label>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            type="number"
            step="any"
            value={potenciaKW === 0 ? '' : potenciaKW}
            onChange={(e) => onUpdate({ potenciaKW: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
            style={{
              ...inputFieldStyle,
              paddingRight: '3rem',
              color: '#38bdf8',
            }}
          />
          <span style={{ position: 'absolute', right: '10px', fontSize: '0.74rem', color: '#38bdf8', fontWeight: 700 }}>
            kW
          </span>
        </div>
      </div>

      {/* Precio Unitario por kW */}
      <div>
        <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
          Precio Unitario por kW (USD/kW):
        </label>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={{ position: 'absolute', left: '10px', fontSize: '0.78rem', color: '#f59e0b', fontWeight: 800 }}>$</span>
          <input
            type="number"
            step="any"
            value={precioUnitarioKW === 0 ? '' : precioUnitarioKW}
            onChange={(e) => onUpdate({ precioUnitarioKW: parseFloat(e.target.value) || 0 })}
            placeholder="0.000"
            style={{
              ...inputFieldStyle,
              paddingLeft: '2rem',
              paddingRight: '4.8rem',
              color: '#f59e0b',
            }}
          />
          <span style={{ position: 'absolute', right: '10px', fontSize: '0.68rem', color: '#fbbf24', fontWeight: 700 }}>
            USD/kW
          </span>
        </div>
      </div>
    </div>
  );
};

export default CardDemandaCoincidente;
