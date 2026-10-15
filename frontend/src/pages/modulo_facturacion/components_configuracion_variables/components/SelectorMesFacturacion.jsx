import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, Check } from 'lucide-react';
import {
  formatearMesNombre,
  desplazarPeriodo,
  generarOpcionesMesesAgrupados,
} from '../utils/periodoFacturacionUtils';

/**
 * Selector interactivo de Mes a Facturar con menú desplegable hacia abajo (Custom Dropdown)
 * Limitado estrictamente al año en curso (nunca muestra el año entrante).
 */
const SelectorMesFacturacion = ({
  value = '2026-08',
  onChange,
  accentColor = '#38bdf8',
  compact = false,
  showLabel = true,
  label = 'Mes a Facturar:',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const selectedItemRef = useRef(null);

  // Opciones de meses agrupados por año (Capped al año en curso, sin años futuros)
  const gruposMeses = useMemo(() => {
    return generarOpcionesMesesAgrupados(value, 2);
  }, [value]);

  const maxPeriodoPermitido = useMemo(() => {
    if (gruposMeses.length > 0 && gruposMeses[0].meses.length > 0) {
      return gruposMeses[0].meses[0].valor;
    }
    return '2026-12';
  }, [gruposMeses]);

  // Cerrar al hacer clic fuera del componente
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Al abrir, desplazar suavemente al elemento seleccionado dentro de la lista
  useEffect(() => {
    if (isOpen && selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isOpen]);

  const handlePrev = (e) => {
    e.stopPropagation();
    if (onChange) {
      onChange(desplazarPeriodo(value, -1));
    }
  };

  const handleNext = (e) => {
    e.stopPropagation();
    if (onChange) {
      onChange(desplazarPeriodo(value, 1, maxPeriodoPermitido));
    }
  };

  const handleSelectMes = (nuevoPeriodo) => {
    if (onChange) {
      onChange(nuevoPeriodo);
    }
    setIsOpen(false);
  };

  const textoMesSeleccionado = formatearMesNombre(value);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? '0.25rem' : '0.4rem',
        background: '#090d16',
        border: `1px solid ${accentColor}`,
        borderRadius: '7px',
        padding: compact ? '0.15rem 0.35rem' : '0.25rem 0.55rem',
        boxShadow: `0 0 10px rgba(56, 189, 248, 0.15)`,
        userSelect: 'none',
      }}
    >
      <Calendar size={compact ? 12 : 14} color={accentColor} />

      {showLabel && (
        <span
          style={{
            fontSize: compact ? '0.68rem' : '0.73rem',
            color: '#f8fafc',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      )}

      {/* Botón Mes Anterior */}
      <button
        type="button"
        onClick={handlePrev}
        title="Mes anterior"
        style={{
          background: 'rgba(56, 189, 248, 0.12)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          borderRadius: '4px',
          color: accentColor,
          width: compact ? '20px' : '22px',
          height: compact ? '20px' : '22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(56, 189, 248, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(56, 189, 248, 0.12)';
        }}
      >
        <ChevronLeft size={compact ? 13 : 15} />
      </button>

      {/* Botón Trigger del Dropdown Personalizado */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title="Haz clic para abrir la lista de meses hacia abajo"
        style={{
          background: '#0f172a',
          border: `1px solid ${isOpen ? '#38bdf8' : 'rgba(56, 189, 248, 0.5)'}`,
          borderRadius: '5px',
          color: accentColor,
          fontSize: compact ? '0.72rem' : '0.76rem',
          fontWeight: 800,
          padding: compact ? '0.18rem 0.5rem' : '0.22rem 0.65rem',
          cursor: 'pointer',
          outline: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.45rem',
          boxShadow: isOpen ? '0 0 10px rgba(56, 189, 248, 0.3)' : 'none',
          transition: 'all 0.15s ease',
        }}
      >
        <span>{textoMesSeleccionado} ({value})</span>
        <ChevronDown
          size={13}
          color={accentColor}
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>

      {/* Botón Mes Siguiente */}
      <button
        type="button"
        onClick={handleNext}
        title="Mes siguiente"
        style={{
          background: 'rgba(56, 189, 248, 0.12)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          borderRadius: '4px',
          color: accentColor,
          width: compact ? '20px' : '22px',
          height: compact ? '20px' : '22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(56, 189, 248, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(56, 189, 248, 0.12)';
        }}
      >
        <ChevronRight size={compact ? 13 : 15} />
      </button>

      {/* MENÚ DESPLEGABLE HACIA ABAJO (Custom Dropdown Popover) */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 5px)', // Despliegue estricto HACIA ABAJO
            left: 0,
            zIndex: 99999,
            minWidth: '230px',
            maxWidth: '280px',
            maxHeight: '260px',
            overflowY: 'auto',
            background: '#090d16',
            border: `1px solid ${accentColor}`,
            borderRadius: '8px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.95), 0 0 16px rgba(56, 189, 248, 0.25)',
            padding: '5px',
          }}
        >
          {gruposMeses.map((grupo) => (
            <div key={grupo.anio} style={{ marginBottom: '6px' }}>
              {/* Encabezado del Año */}
              <div
                style={{
                  padding: '4px 8px',
                  fontSize: '0.67rem',
                  fontWeight: 800,
                  color: grupo.esAnioEnCurso ? '#fbbf24' : '#94a3b8',
                  background: 'rgba(15, 23, 42, 0.85)',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #1e293b',
                  marginBottom: '2px',
                }}
              >
                <span>── Año {grupo.anio} ──</span>
                {grupo.esAnioEnCurso && (
                  <span
                    style={{
                      fontSize: '0.58rem',
                      background: 'rgba(245, 158, 11, 0.2)',
                      border: '1px solid #f59e0b',
                      color: '#fbbf24',
                      padding: '0 5px',
                      borderRadius: '4px',
                      fontWeight: 800,
                    }}
                  >
                    Año en curso
                  </span>
                )}
              </div>

              {/* Lista de Meses */}
              {grupo.meses.map((m) => {
                const esSeleccionado = m.valor === value;
                return (
                  <div
                    key={m.valor}
                    ref={esSeleccionado ? selectedItemRef : null}
                    onClick={() => handleSelectMes(m.valor)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.35rem 0.65rem',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '0.74rem',
                      fontWeight: esSeleccionado ? 800 : 500,
                      background: esSeleccionado ? 'rgba(56, 189, 248, 0.22)' : 'transparent',
                      color: esSeleccionado ? '#38bdf8' : '#e2e8f0',
                      border: esSeleccionado ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid transparent',
                      transition: 'all 0.12s ease',
                      margin: '1px 0',
                    }}
                    onMouseEnter={(e) => {
                      if (!esSeleccionado) {
                        e.currentTarget.style.background = 'rgba(56, 189, 248, 0.12)';
                        e.currentTarget.style.color = '#ffffff';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!esSeleccionado) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#e2e8f0';
                      }
                    }}
                  >
                    <span>{m.label} ({m.valor})</span>
                    {esSeleccionado && <Check size={14} color="#38bdf8" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SelectorMesFacturacion;
