import React, { useState, useEffect, useRef } from 'react';
import { Lock, User, Eye, EyeOff, ShieldCheck } from 'lucide-react';

const Login = ({ socket, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Refs para que el listener de abajo se registre UNA sola vez por socket,
  // sin depender de username/onLoginSuccess (que cambian en cada tecla o
  // en cada re-render del padre) — antes eso desconectaba y reconectaba el
  // listener constantemente y podía perder la respuesta del servidor.
  const usernameRef = useRef(username);
  usernameRef.current = username;
  const onLoginSuccessRef = useRef(onLoginSuccess);
  onLoginSuccessRef.current = onLoginSuccess;

  useEffect(() => {
    if (!socket) return;

    const handleLoginResponse = (res) => {
      setLoading(false);
      if (res.success) {
        localStorage.setItem('auth_token', res.token);
        localStorage.setItem('auth_user', usernameRef.current);
        onLoginSuccessRef.current();
      } else {
        setError(res.error || 'Credenciales inválidas.');
      }
    };

    socket.on('login_response', handleLoginResponse);
    return () => {
      socket.off('login_response', handleLoginResponse);
    };
  }, [socket]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Por favor, completa todos los campos.');
      return;
    }
    setError('');
    setLoading(true);
    if (socket) {
      socket.emit('login_request', { username, password });
    } else {
      setLoading(false);
      setError('Error de conexión con el servidor.');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: '#07080b',
      backgroundImage: `
        radial-gradient(circle at 10% 20%, rgba(59, 130, 246, 0.12), transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(16, 185, 129, 0.12), transparent 40%)
      `,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999999,
      fontFamily: 'Inter, sans-serif',
      color: '#f3f4f6',
      overflow: 'hidden'
    }}>
      {/* Background soft glowing orb */}
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        backgroundColor: 'rgba(59, 130, 246, 0.03)',
        filter: 'blur(100px)',
        top: '20%',
        left: '30%',
        pointerEvents: 'none'
      }} />

      {/* Main Glassmorphic Container */}
      <div style={{
        backgroundColor: 'rgba(15, 17, 23, 0.65)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '20px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(59, 130, 246, 0.05)',
        padding: '2.5rem 2.25rem',
        width: '100%',
        maxWidth: '420px',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.75rem',
        animation: 'scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        boxSizing: 'border-box'
      }}>
        {/* Logo and Header */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            boxShadow: '0 0 15px rgba(59, 130, 246, 0.2)',
            color: '#3b82f6',
            marginBottom: '0.25rem'
          }}>
            <ShieldCheck size={32} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', background: 'linear-gradient(to right, #60a5fa, #34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            BOOT RCM PRO
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>
            Plataforma de Control de Sincronización SPSA
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Username input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label htmlFor="username" style={{ fontSize: '0.8rem', fontWeight: 500, color: '#9ca3af' }}>Usuario</label>
            <div style={{ position: 'relative' }}>
              <User size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
              <input
                id="username"
                type="text"
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ingresa tu usuario"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.75rem 0.75rem 0.75rem 2.5rem',
                  backgroundColor: 'rgba(5, 5, 5, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none',
                  transition: 'all 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#3b82f6';
                  e.target.style.boxShadow = '0 0 10px rgba(59, 130, 246, 0.15)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
          </div>

          {/* Password input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="password" style={{ fontSize: '0.8rem', fontWeight: 500, color: '#9ca3af' }}>Contraseña</label>
            </div>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.75rem 2.5rem 0.75rem 2.5rem',
                  backgroundColor: 'rgba(5, 5, 5, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none',
                  transition: 'all 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#3b82f6';
                  e.target.style.boxShadow = '0 0 10px rgba(59, 130, 246, 0.15)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  e.target.style.boxShadow = 'none';
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div style={{
              fontSize: '0.8rem',
              color: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.15)',
              borderRadius: '8px',
              padding: '0.5rem 0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              animation: 'fadeIn 0.2s'
            }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '0.5rem',
              width: '100%',
              padding: '0.8rem',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#3b82f6',
              backgroundImage: 'linear-gradient(to right, #3b82f6, #10b981)',
              color: '#000',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 15px rgba(59, 130, 246, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.filter = 'brightness(1.1)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.35)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.filter = 'none';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(59, 130, 246, 0.25)';
              }
            }}
            onMouseDown={(e) => { if (!loading) e.currentTarget.style.transform = 'scale(0.98)'; }}
            onMouseUp={(e) => { if (!loading) e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {loading ? 'Verificando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
