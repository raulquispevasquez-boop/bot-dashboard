import React, { useState } from 'react';
import { X, SlidersHorizontal, User, Mail, FileText, CheckCircle2, RotateCcw } from 'lucide-react';

const inputStyle = {
  width: '100%',
  background: '#090d16',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '0.6rem 0.75rem',
  color: '#f8fafc',
  fontSize: '0.85rem',
  marginTop: '0.35rem',
  outline: 'none',
  transition: 'border-color 0.2s',
};

const ModalConfigurarPlantilla = ({ isOpen, onClose, valoresActuales, onGuardar }) => {
  const [solicitadoPor, setSolicitadoPor] = useState(valoresActuales?.solicitadoPor || '');
  const [email, setEmail] = useState(valoresActuales?.email || '');
  const [referencia, setReferencia] = useState(valoresActuales?.referencia || '');
  const [notificacion, setNotificacion] = useState(false);

  if (!isOpen) return null;

  const handleGuardar = (e) => {
    e.preventDefault();
    onGuardar({
      solicitadoPor: solicitadoPor.trim(),
      email: email.trim(),
      referencia: referencia.trim(),
    });
    setNotificacion(true);
    setTimeout(() => {
      setNotificacion(false);
      onClose();
    }, 700);
  };

  const handleLimpiar = () => {
    setSolicitadoPor('');
    setEmail('');
    setReferencia('');
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(3px)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0f172a',
          border: '1px solid #1e3a8a',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Encabezado */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #1e293b',
            background: 'linear-gradient(to right, #0f172a, #131d36)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(56, 189, 248, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SlidersHorizontal size={17} color="#38bdf8" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9' }}>
                Valores por defecto
              </h3>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>
                Configuración automática para todas las solicitudes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '0.2rem',
              borderRadius: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleGuardar} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <User size={13} color="#38bdf8" /> Solicitado por:
            </label>
            <input
              type="text"
              style={inputStyle}
              placeholder="Ej. Olympus o Nombre de solicitante"
              value={solicitadoPor}
              onChange={(e) => setSolicitadoPor(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Mail size={13} color="#38bdf8" /> Correo electrónico:
            </label>
            <input
              type="email"
              style={inputStyle}
              placeholder="Ej. raul.quispe@spsa.pe"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <FileText size={13} color="#38bdf8" /> Referencia:
            </label>
            <input
              type="text"
              style={inputStyle}
              placeholder="Ej. generación automática"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
          </div>

          <div
            style={{
              background: 'rgba(30, 41, 59, 0.5)',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '0.65rem 0.8rem',
              fontSize: '0.72rem',
              color: '#94a3b8',
              lineHeight: 1.4,
            }}
          >
            ℹ️ Al guardar, estos 3 valores se <strong style={{ color: '#e2e8f0' }}>aplicarán de inmediato a todas las filas actuales</strong> de la tabla y quedarán guardados en tu navegador para rellenar automáticamente cualquier nueva fila que agregues.
          </div>

          {/* Botones de acción */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #1e293b' }}>
            <button
              type="button"
              onClick={handleLimpiar}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
              title="Borrar valores"
            >
              <RotateCcw size={13} /> Limpiar
            </button>

            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '0.45rem 0.85rem',
                  color: '#cbd5e1',
                  fontSize: '0.78rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  background: notificacion ? '#16a34a' : '#2563eb',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.45rem 1rem',
                  color: '#fff',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {notificacion ? <CheckCircle2 size={14} /> : <SlidersHorizontal size={14} />}
                {notificacion ? '¡Aplicado con éxito!' : 'Guardar y aplicar a todas'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalConfigurarPlantilla;
