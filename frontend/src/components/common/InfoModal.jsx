import React from 'react';
import { X, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';

const InfoModal = ({ isOpen, title, message, type = 'info', onClose }) => {
  if (!isOpen) return null;

  const getTheme = () => {
    switch (type) {
      case 'success':
        return {
          icon: <CheckCircle size={48} style={{ color: '#00ff66' }} />,
          color: '#22c55e',
          glow: 'rgba(34, 197, 94, 0.25)'
        };
      case 'error':
        return {
          icon: <XCircle size={48} style={{ color: '#ff4444' }} />,
          color: '#ef4444',
          glow: 'rgba(239, 68, 68, 0.25)'
        };
      case 'warning':
        return {
          icon: <AlertTriangle size={48} style={{ color: '#ffaa00' }} />,
          color: '#f59e0b',
          glow: 'rgba(245, 158, 11, 0.25)'
        };
      default:
        return {
          icon: <Info size={48} style={{ color: '#00ccff' }} />,
          color: '#3b82f6',
          glow: 'rgba(59, 130, 246, 0.25)'
        };
    }
  };

  const { icon, color, glow } = getTheme();

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(3, 4, 6, 0.85)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      zIndex: 999999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        backgroundColor: '#181b26',
        border: `1px solid rgba(255, 255, 255, 0.15)`,
        boxShadow: `0 32px 70px rgba(0, 0, 0, 0.85), 0 0 45px ${glow}`,
        borderRadius: '16px',
        width: '100%',
        maxWidth: '400px',
        overflow: 'hidden',
        animation: 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        position: 'relative'
      }}>
        {/* Top Accent Strip */}
        <div style={{
          height: '4px',
          backgroundColor: color,
          width: '100%'
        }} />

        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: '#6b7280',
            cursor: 'pointer',
            transition: 'color 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#f3f4f6'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
        >
          <X size={18} />
        </button>

        <div style={{ padding: '2.5rem 1.75rem 2rem 1.75rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '84px',
            height: '84px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            border: `1px solid rgba(255, 255, 255, 0.05)`,
            boxShadow: `inset 0 0 15px rgba(255, 255, 255, 0.03)`,
            marginBottom: '0.25rem'
          }}>
            {icon}
          </div>

          <h3 style={{
            fontSize: '1.3rem',
            fontWeight: 600,
            color: '#fff',
            margin: 0,
            fontFamily: 'Inter, sans-serif',
            letterSpacing: '-0.01em'
          }}>
            {title}
          </h3>

          <p style={{
            fontSize: '0.875rem',
            color: '#9ca3af',
            margin: 0,
            lineHeight: '1.5',
            whiteSpace: 'pre-wrap',
            fontFamily: 'Inter, sans-serif'
          }}>
            {message}
          </p>

          <button
            onClick={onClose}
            style={{
              marginTop: '0.75rem',
              width: '100%',
              padding: '0.8rem',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: color,
              color: '#000',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: `0 4px 12px ${glow}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = 'brightness(1.15)';
              e.currentTarget.style.boxShadow = `0 6px 16px ${glow}`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = 'none';
              e.currentTarget.style.boxShadow = `0 4px 12px ${glow}`;
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.97)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
};

export default InfoModal;
