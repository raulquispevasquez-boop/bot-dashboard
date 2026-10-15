import React, { useState } from 'react';
import { Cpu, Plus, Trash2, X, Check, Calculator, AlertCircle, Info } from 'lucide-react';

const ModalMedidorVirtual = ({
  isOpen,
  onClose,
  columnas = [],
  medidoresExistentes = [],
  onGuardarMedidor,
  onEliminarMedidor,
  tipoMedicion = 'Energía', // 'Energía' o 'Potencia'
}) => {
  const [nombre, setNombre] = useState('');
  // Mapa de columnaKey -> '+' | '-' | 'none'
  const [operaciones, setOperaciones] = useState({});
  const [errorValidacion, setErrorValidacion] = useState('');

  if (!isOpen) return null;

  // Filtrar solo columnas físicas originales (no virtuales)
  const columnasFisicas = columnas.filter((c) => !c.esVirtual);

  const handleCambiarSigno = (colKey, signo) => {
    setOperaciones((prev) => ({
      ...prev,
      [colKey]: signo,
    }));
    setErrorValidacion('');
  };

  // Construcción de la fórmula para vista previa en tiempo real
  const opsSeleccionadas = columnasFisicas
    .map((col) => {
      const signo = operaciones[col.key] || 'none';
      return { col, signo };
    })
    .filter((item) => item.signo === '+' || item.signo === '-');

  const formulaTexto = opsSeleccionadas.length > 0
    ? opsSeleccionadas
        .map((item, idx) => `${idx === 0 && item.signo === '+' ? '' : item.signo} [${item.col.alias}]`)
        .join(' ')
    : 'Selecciona al menos una columna para sumar o restar';

  const handleGuardar = (e) => {
    e.preventDefault();
    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) {
      setErrorValidacion('Por favor ingresa un nombre para el encabezado del medidor virtual.');
      return;
    }

    if (opsSeleccionadas.length === 0) {
      setErrorValidacion('Debes seleccionar al menos una columna con signo (+) o (-).');
      return;
    }

    // Guardar nuevo medidor virtual
    const nuevoMedidor = {
      id: `mv_${Date.now()}`,
      nombre: nombreLimpio,
      operaciones: opsSeleccionadas.map((op) => ({
        columnaKey: op.col.key,
        columnaAlias: op.col.alias,
        headerOriginal: op.col.headerOriginal,
        signo: op.signo,
      })),
      formulaTexto,
      activo: true,
    };

    onGuardarMedidor(nuevoMedidor);
    setNombre('');
    setOperaciones({});
    setErrorValidacion('');
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(2, 6, 23, 0.78)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: '#0d1527',
          border: '1px solid #1e293b',
          borderRadius: '14px',
          width: '580px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
          overflow: 'hidden',
        }}
      >
        {/* Cabecera del Modal */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, #111d35 0%, #0d1527 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                padding: '0.45rem',
                borderRadius: '8px',
                background: 'rgba(168, 85, 247, 0.15)',
                color: '#c084fc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Cpu size={19} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
                Configuración de Medidor Virtualizado
              </h3>
              <p style={{ margin: 0, fontSize: '0.74rem', color: '#94a3b8' }}>
                Columna calculada por suma o resta algebraica de variables existentes
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '0.3rem',
              borderRadius: '6px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {errorValidacion && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid #ef4444',
                borderRadius: '8px',
                padding: '0.5rem 0.8rem',
                color: '#fca5a5',
                fontSize: '0.76rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
              }}
            >
              <AlertCircle size={15} />
              <span>{errorValidacion}</span>
            </div>
          )}

          {/* Formulario de Nuevo Medidor */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#cbd5e1' }}>
              Nombre del Encabezado de Columna:
            </label>
            <input
              type="text"
              placeholder="Ej. TOTALIZADOR NETO PLANTA o TOTAL SIN OECHSLE"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              style={{
                width: '100%',
                background: '#090d16',
                border: '1px solid #334155',
                borderRadius: '7px',
                padding: '0.55rem 0.75rem',
                color: '#fff',
                fontSize: '0.85rem',
                fontWeight: 600,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Selector de columnas y signos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#cbd5e1' }}>
                Operación por cada Variable / Celda:
              </span>
              <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                Selecciona si suma (+) o resta (-)
              </span>
            </div>

            <div
              style={{
                background: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem',
              }}
            >
              {columnasFisicas.map((col) => {
                const signoActual = operaciones[col.key] || 'none';
                return (
                  <div
                    key={col.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.4rem 0.6rem',
                      background: signoActual !== 'none' ? 'rgba(168, 85, 247, 0.08)' : '#0f172a',
                      border: signoActual !== 'none' ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid #1e293b',
                      borderRadius: '6px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f1f5f9' }}>
                        {col.alias}
                      </div>
                      {col.codigo && (
                        <div style={{ fontSize: '0.67rem', color: '#64748b' }}>
                          {col.codigo}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button
                        type="button"
                        onClick={() => handleCambiarSigno(col.key, 'none')}
                        style={{
                          background: signoActual === 'none' ? '#334155' : '#1e293b',
                          border: 'none',
                          color: signoActual === 'none' ? '#f8fafc' : '#64748b',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                        }}
                      >
                        Ignorar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCambiarSigno(col.key, '+')}
                        style={{
                          background: signoActual === '+' ? '#10b981' : '#1e293b',
                          border: 'none',
                          color: '#fff',
                          padding: '0.25rem 0.6rem',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        + Sumar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCambiarSigno(col.key, '-')}
                        style={{
                          background: signoActual === '-' ? '#ef4444' : '#1e293b',
                          border: 'none',
                          color: '#fff',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        - Restar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Vista Previa de la Fórmula en vivo */}
          <div
            style={{
              background: 'rgba(168, 85, 247, 0.08)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: '8px',
              padding: '0.65rem 0.85rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: '#c084fc', fontWeight: 700, textTransform: 'uppercase' }}>
              Fórmula Resultante:
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f3e8ff', fontFamily: 'monospace' }}>
              {nombre ? `[${nombre}] = ` : ''}{formulaTexto}
            </div>
          </div>

          {/* Lista de Medidores Virtuales ya creados */}
          {medidoresExistentes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid #1e293b', paddingTop: '0.75rem' }}>
              <span style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600 }}>
                Medidores Virtuales Activos ({medidoresExistentes.length}):
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {medidoresExistentes.map((mv) => (
                  <div
                    key={mv.id}
                    style={{
                      background: '#090d16',
                      border: '1px solid #233044',
                      borderRadius: '6px',
                      padding: '0.4rem 0.65rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.75rem',
                    }}
                  >
                    <div>
                      <span style={{ color: '#c084fc', fontWeight: 700 }}>🟣 {mv.nombre}</span>
                      <span style={{ color: '#64748b', marginLeft: '0.5rem', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                        {mv.formulaTexto}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onEliminarMedidor(mv.id)}
                      title="Eliminar medidor virtual"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        padding: '0.2rem',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pie del modal con acciones */}
        <div
          style={{
            padding: '0.85rem 1.25rem',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.65rem',
            background: '#090d16',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '7px',
              padding: '0.45rem 0.95rem',
              color: '#cbd5e1',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            style={{
              background: 'linear-gradient(135deg, #9333ea 0%, #7c3aed 100%)',
              border: 'none',
              borderRadius: '7px',
              padding: '0.45rem 1.1rem',
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 4px 12px rgba(147, 51, 234, 0.35)',
            }}
          >
            <Check size={15} />
            <span>Crear Medidor Virtual</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalMedidorVirtual;
