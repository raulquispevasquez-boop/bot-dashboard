import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary capturó un error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '2rem',
            background: 'linear-gradient(145deg, #1e293b, #0f172a)',
            border: '1px solid #ef4444',
            borderRadius: '12px',
            color: '#f8fafc',
            margin: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            textAlign: 'center',
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={30} color="#ef4444" />
          </div>
          <div>
            <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.1rem', fontWeight: 700 }}>
              Error al renderizar el módulo
            </h3>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem', maxWidth: '500px' }}>
              {this.state.error?.message || 'Se produjo un error inesperado al procesar los datos.'}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.45rem 1.1rem',
              background: 'linear-gradient(135deg, #0284c7, #0369a1)',
              color: '#fff',
              border: 'none',
              borderRadius: '7px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.8rem',
            }}
          >
            <RefreshCw size={14} />
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
