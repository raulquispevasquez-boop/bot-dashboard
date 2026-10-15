import React, { useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, AlertOctagon } from 'lucide-react';

const Toast = ({ message, type = 'success', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const getColors = () => {
    if (type === 'error') {
      return {
        border: '1px solid rgba(239, 68, 68, 0.4)',
        glow: 'rgba(239, 68, 68, 0.25)',
        iconColor: '#ef4444',
        Icon: AlertOctagon
      };
    }
    if (type === 'warning') {
      return {
        border: '1px solid rgba(245, 158, 11, 0.4)',
        glow: 'rgba(245, 158, 11, 0.25)',
        iconColor: '#f59e0b',
        Icon: AlertTriangle
      };
    }
    return {
      border: '1px solid rgba(34, 197, 94, 0.4)',
      glow: 'rgba(34, 197, 94, 0.25)',
      iconColor: '#22c55e',
      Icon: CheckCircle
    };
  };

  const { border, glow, iconColor, Icon } = getColors();

  return (
    <div style={{
      position: 'fixed',
      top: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 99999,
      backgroundColor: 'rgba(10, 11, 14, 0.85)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border,
      boxShadow: `0 8px 32px 0 rgba(0, 0, 0, 0.37), 0 0 15px ${glow}`,
      padding: '0.85rem 1.5rem',
      borderRadius: '10px',
      color: '#f3f4f6',
      animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      display: 'flex',
      alignItems: 'center',
      gap: '0.85rem',
      maxWidth: '90vw',
      width: 'max-content',
      minWidth: '320px',
      pointerEvents: 'auto'
    }}>
      <Icon size={18} style={{ color: iconColor, flexShrink: 0 }} />
      <span style={{ fontSize: '0.875rem', fontWeight: 500, flex: 1, lineHeight: '1.4', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {message}
      </span>
      <button 
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: '#6b7280',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.2s',
          marginLeft: '0.5rem',
          flexShrink: 0
        }}
        onMouseEnter={(e) => e.currentTarget.style.color = '#f3f4f6'}
        onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default Toast;
