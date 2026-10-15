import React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Database, X } from 'lucide-react';

const ModalGuardadoPersistencia = ({ isOpen, onClose, detalle }) => {
  if (!isOpen) return null;

  const modalNode = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: 'linear-gradient(160deg, #17233d 0%, #0f172a 100%)',
          border: '1px solid #22c55e',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '460px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.7), 0 0 25px rgba(34, 197, 94, 0.25)',
          padding: '1.5rem',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '4px',
          }}
        >
          <X size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: 'rgba(34, 197, 94, 0.2)',
              border: '1px solid rgba(34, 197, 94, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={26} color="#22c55e" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#f8fafc', fontWeight: 800 }}>
              Variación Guardada con Persistencia
            </h3>
            <span style={{ fontSize: '0.74rem', color: '#86efac', fontWeight: 600 }}>
              Memoria permanente activa (localStorage)
            </span>
          </div>
        </div>

        <div
          style={{
            background: '#090d16',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            padding: '0.85rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            fontSize: '0.78rem',
            color: '#cbd5e1',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#38bdf8', fontWeight: 700 }}>
            <Database size={15} />
            <span>Registro guardado en memoria local</span>
          </div>
          <p style={{ margin: 0, lineHeight: 1.4, color: '#e2e8f0' }}>
            {detalle?.mensaje || 'Se han guardado los cambios en la lista de días no laborables y domingos.'}
          </p>
          {detalle?.totalActivos !== undefined && (
            <div style={{ marginTop: '0.3rem', fontSize: '0.74rem', color: '#94a3b8' }}>
              Días no laborables activos: <strong style={{ color: '#4ade80' }}>{detalle.totalActivos}</strong> de <strong style={{ color: '#f8fafc' }}>{detalle.totalTotal}</strong>
            </div>
          )}
        </div>

        <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.3 }}>
          💡 <strong>Garantía de persistencia:</strong> Al salir de la pestaña, cerrar la ventana o reiniciar la aplicación, todos los checks configurados permanecerán marcados exactamente como los dejaste.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.45rem 1.35rem',
              borderRadius: '7px',
              border: 'none',
              background: 'linear-gradient(135deg, #059669, #10b981)',
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)',
            }}
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
};

export default ModalGuardadoPersistencia;
