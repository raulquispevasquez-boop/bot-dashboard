import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  Power, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Copy, 
  Check, 
  ExternalLink, 
  ShieldCheck, 
  Server, 
  Radio, 
  Zap,
  Lock
} from 'lucide-react';

const isLocal = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' || 
  window.location.hostname === '127.0.0.1'
);
const BACKEND = isLocal
  ? `${window.location.protocol}//${window.location.hostname}:3001`
  : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');

const ControlTunelCloudflare = () => {
  const [status, setStatus] = useState({
    running: false,
    domain: 'https://www.botmanager.date',
    protocol: 'http2',
    autoStart: true,
    startOnWindowsBoot: false,
    tokenConfigured: true
  });
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState(null);

  const cargarEstado = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/tunnel/status`);
      const data = await res.json();
      if (data.success) {
        setStatus(data);
      }
    } catch (e) {
      console.error('Error al obtener estado del túnel:', e);
    }
  };

  useEffect(() => {
    cargarEstado();
    const interval = setInterval(cargarEstado, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleTunnel = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const endpoint = status.running ? '/api/tunnel/stop' : '/api/tunnel/start';
      const res = await fetch(`${BACKEND}${endpoint}`, { method: 'POST' });
      const data = await res.json();
      setMsg({ type: data.success ? 'success' : 'error', text: data.message || 'Operación completada' });
      await cargarEstado();
    } catch (e) {
      setMsg({ type: 'error', text: 'Error al cambiar estado del túnel: ' + e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAutoStart = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const nuevoValor = !status.startOnWindowsBoot;
      const res = await fetch(`${BACKEND}/api/tunnel/autostart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nuevoValor })
      });
      const data = await res.json();
      if (data.success) {
        setStatus(prev => ({ ...prev, startOnWindowsBoot: nuevoValor }));
        setMsg({
          type: 'success',
          text: nuevoValor 
            ? '✅ Modo Permanente activado: El sistema y el túnel arrancarán automáticamente con Windows.' 
            : 'Inicio automático con Windows desactivado.'
        });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error al actualizar inicio con Windows: ' + e.message });
    } finally {
      setLoading(false);
    }
  };

  const copiarEnlace = () => {
    navigator.clipboard.writeText(status.domain || 'https://www.botmanager.date');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1000px', margin: '0 auto', paddingBottom: '2rem' }}>
      
      {/* ── Banner de Estado Principal ── */}
      <div style={{
        background: status.running 
          ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, rgba(16, 185, 129, 0.05) 100%)' 
          : 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(185, 28, 28, 0.05) 100%)',
        border: `1px solid ${status.running ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
        borderRadius: '14px',
        padding: '1.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        boxShadow: status.running ? '0 8px 32px rgba(34, 197, 94, 0.1)' : '0 8px 32px rgba(239, 68, 68, 0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              backgroundColor: status.running ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: status.running ? '#22c55e' : '#ef4444'
            }}>
              <Globe size={28} className={status.running ? 'animate-pulse' : ''} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text-primary)' }}>
                  {status.running ? 'Túnel en Línea (Conectado a la Nube)' : 'Túnel Desconectado (Offline)'}
                </h2>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 10px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  backgroundColor: status.running ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  color: status.running ? '#22c55e' : '#ef4444'
                }}>
                  {status.running ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  {status.running ? 'ACTIVO' : 'DETENIDO'}
                </span>
              </div>
              <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
                {status.running 
                  ? 'Tu plataforma está visible en internet de forma segura mediante Cloudflare.' 
                  : 'El acceso desde internet está cerrado. La plataforma solo responde en local.'}
              </p>
            </div>
          </div>

          {/* Botón Principal de Encendido / Apagado */}
          <button
            onClick={handleToggleTunnel}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.85rem 1.6rem',
              borderRadius: '10px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              border: 'none',
              backgroundColor: status.running ? '#ef4444' : '#22c55e',
              color: '#ffffff',
              boxShadow: status.running ? '0 4px 15px rgba(239, 68, 68, 0.35)' : '0 4px 15px rgba(34, 197, 94, 0.35)',
              transition: 'all 0.2s ease',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? <RefreshCw size={20} className="animate-spin" /> : <Power size={20} />}
            {loading 
              ? (status.running ? 'Deteniendo...' : 'Conectando...') 
              : (status.running ? 'Desconectar Túnel' : 'Conectar Túnel')}
          </button>
        </div>

        {/* Barra de dirección URL oficial */}
        <div style={{
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
            <Lock size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Dominio oficial:</span>
            <span style={{ 
              color: '#ffffff', 
              fontWeight: 600, 
              fontSize: '1rem',
              letterSpacing: '0.3px',
              fontFamily: 'monospace'
            }}>
              {status.domain}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={copiarEnlace}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              {copied ? <Check size={14} style={{ color: '#22c55e' }} /> : <Copy size={14} />}
              {copied ? '¡Copiado!' : 'Copiar'}
            </button>
            <a
              href={status.domain}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                fontSize: '0.82rem',
                textDecoration: 'none',
                fontWeight: 500
              }}
            >
              <ExternalLink size={14} />
              Abrir
            </a>
          </div>
        </div>
      </div>

      {msg && (
        <div style={{
          padding: '0.9rem 1.25rem',
          borderRadius: '8px',
          backgroundColor: msg.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${msg.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          color: msg.type === 'success' ? '#4ade80' : '#f87171',
          fontSize: '0.9rem'
        }}>
          {msg.text}
        </div>
      )}

      {/* ── Sección de Modo Permanente (Inicio con Windows) ── */}
      <div style={{
        backgroundColor: 'var(--panel-bg, rgba(255,255,255,0.02))',
        border: '1px solid var(--panel-border)',
        borderRadius: '12px',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <div style={{
              padding: '10px',
              borderRadius: '8px',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              color: '#3b82f6'
            }}>
              <Zap size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                Modo Permanente (Inicio Automático con Windows)
              </h3>
              <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: '620px' }}>
                Al activar esta opción, cuando enciendas o reinicies tu computadora el sistema y el túnel arrancarán automáticamente en segundo plano (sin abrir consolas).
              </p>
            </div>
          </div>

          {/* Switch Toggle */}
          <button
            onClick={handleToggleAutoStart}
            disabled={loading}
            style={{
              width: '56px',
              height: '30px',
              borderRadius: '15px',
              backgroundColor: status.startOnWindowsBoot ? '#22c55e' : 'rgba(255,255,255,0.2)',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              position: 'relative',
              transition: 'background-color 0.2s',
              padding: '3px'
            }}
          >
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              transform: status.startOnWindowsBoot ? 'translateX(26px)' : 'translateX(0px)',
              transition: 'transform 0.2s',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
            }} />
          </button>
        </div>

        <div style={{
          backgroundColor: 'rgba(255,255,255,0.02)',
          borderLeft: `4px solid ${status.startOnWindowsBoot ? '#22c55e' : '#64748b'}`,
          padding: '0.75rem 1rem',
          borderRadius: '4px',
          fontSize: '0.85rem',
          color: 'var(--text-secondary)'
        }}>
          {status.startOnWindowsBoot ? (
            <span style={{ color: '#4ade80' }}>
              ✔ <strong>Permanencia activa:</strong> Tu computadora está configurada para mantener este servicio disponible al reiniciar o abrir tu equipo.
            </span>
          ) : (
            <span>
              ℹ️ <strong>Manual:</strong> El túnel solo correrá cuando lo enciendas desde aquí o ejecutes el comando en terminal.
            </span>
          )}
        </div>
      </div>

      {/* ── Cuadrícula de Parámetros Técnicos ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem'
      }}>
        <div style={{
          backgroundColor: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--panel-border)',
          borderRadius: '10px',
          padding: '1.1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8' }}>
            <Server size={18} />
            <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Destino Local</span>
          </div>
          <span style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            http://localhost:3001
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Express + WebSockets + Bots</span>
        </div>

        <div style={{
          backgroundColor: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--panel-border)',
          borderRadius: '10px',
          padding: '1.1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a78bfa' }}>
            <Radio size={18} />
            <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Protocolo de Red</span>
          </div>
          <span style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            HTTP/2 (TCP Seguro)
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Puerto 443 estándar (sin bloqueos)</span>
        </div>

        <div style={{
          backgroundColor: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--panel-border)',
          borderRadius: '10px',
          padding: '1.1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399' }}>
            <ShieldCheck size={18} />
            <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Seguridad Edge</span>
          </div>
          <span style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Cloudflare Zero Trust
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cifrado SSL / TLS Gratuito</span>
        </div>
      </div>

    </div>
  );
};

export default ControlTunelCloudflare;
