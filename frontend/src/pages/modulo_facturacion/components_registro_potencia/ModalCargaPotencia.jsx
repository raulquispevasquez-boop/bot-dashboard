import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, FileUp, RefreshCw, Zap } from 'lucide-react';
import * as XLSX from 'xlsx';

const OPCIONES_UNIDAD_POTENCIA = [
  { id: 'watts', label: 'Watts (W)', factor: 0.001, desc: 'Valores ÷ 1,000 para pasar a Kilowatts (kW)', badge: '÷ 1,000 (W a kW)' },
  { id: 'kilowatts', label: 'Kilowatts (kW)', factor: 1.0, desc: 'Unidad estándar en kW sin alteración', badge: 'Factor 1.0 (kW)' },
  { id: 'megawatts', label: 'Megawatts (MW)', factor: 1000.0, desc: 'Valores × 1,000 para pasar a Kilowatts (kW)', badge: '× 1,000 (MW a kW)' },
];

const ModalCargaPotencia = ({ isOpen, onClose, onProcesarData }) => {
  const [unidad, setUnidad] = useState('watts');
  const [archivo, setArchivo] = useState(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [porcentaje, setPorcentaje] = useState(0);
  const [fase, setFase] = useState('');
  const [exito, setExito] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  if (!isOpen) return null;

  const handleSeleccionArchivo = (f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (['csv', 'xlsx', 'xls'].includes(ext)) {
      setArchivo(f);
      setError(null);
      setExito(false);
      setPorcentaje(0);
    } else {
      setError('Por favor selecciona un archivo compatible (.csv, .xlsx, .xls)');
    }
  };

  const handleConfirmarCarga = () => {
    if (!archivo) {
      setError('Por favor selecciona un archivo primero.');
      return;
    }

    setProcesando(true);
    setError(null);
    setExito(false);
    setPorcentaje(20);
    setFase('Leyendo archivo de potencia...');

    const config = OPCIONES_UNIDAD_POTENCIA.find((u) => u.id === unidad) || OPCIONES_UNIDAD_POTENCIA[0];
    const ext = archivo.name.split('.').pop().toLowerCase();

    const finalizarExito = (csvText) => {
      setPorcentaje(100);
      setFase('¡Archivo procesado y transformado exitosamente a Kilowatts (kW)!');
      setExito(true);

      setTimeout(() => {
        onProcesarData({
          csvText,
          nombreArchivo: archivo.name,
          factorConversion: config.factor,
          unidadOrigen: config.label,
        });
        setProcesando(false);
        onClose();
      }, 1100);
    };

    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          setPorcentaje(60);
          setFase('Procesando hojas de Excel...');
          setTimeout(() => {
            const data = new Uint8Array(evt.target.result);
            const wb = XLSX.read(data, { type: 'array', cellDates: true, dateNF: 'YYYY-MM-DD HH:mm:ss' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const csvText = XLSX.utils.sheet_to_csv(ws, { dateNF: 'YYYY-MM-DD HH:mm:ss' });
            setPorcentaje(85);
            setFase(`Transformando valores a Kilowatts (${config.label})...`);
            setTimeout(() => finalizarExito(csvText), 250);
          }, 150);
        } catch (err) {
          setError('No se pudo procesar el archivo Excel: ' + (err.message || 'Error de formato'));
          setProcesando(false);
        }
      };
      reader.onerror = () => {
        setError('Error al leer el archivo en el navegador.');
        setProcesando(false);
      };
      reader.readAsArrayBuffer(archivo);
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          setPorcentaje(70);
          setFase(`Transformando potencias a Kilowatts (${config.label})...`);
          setTimeout(() => finalizarExito(evt.target.result), 250);
        } catch (err) {
          setError('Error procesando CSV de potencias: ' + err.message);
          setProcesando(false);
        }
      };
      reader.onerror = () => {
        setError('Error al leer el archivo CSV en el navegador.');
        setProcesando(false);
      };
      reader.readAsText(archivo, 'utf-8');
    }
  };

  const formatearKb = (bytes) => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(2)} MB`;
  };

  const modalNode = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(6px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
      onClick={(e) => e.target === e.currentTarget && !procesando && onClose()}
    >
      <div
        style={{
          background: '#090d16',
          border: '1px solid #334155',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '550px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.7), 0 0 25px rgba(245, 158, 11, 0.15)',
          overflow: 'hidden',
        }}
      >
        {/* Cabecera */}
        <div style={{ padding: '1.1rem 1.4rem', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(30, 41, 59, 0.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={20} color="#f59e0b" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#f8fafc', fontWeight: 700 }}>Cargar Registros de Potencia</h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#94a3b8' }}>Convierte automáticamente los valores a Kilowatts (kW)</p>
            </div>
          </div>
          <button onClick={onClose} disabled={procesando} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: procesando ? 'not-allowed' : 'pointer', padding: '6px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo */}
        <div style={{ padding: '1.2rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '1.05rem' }}>
          {error && (
            <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid #ef4444', borderRadius: '8px', padding: '0.6rem 0.85rem', color: '#fca5a5', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Selector de Unidad */}
          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              1. Unidad de potencia en tu archivo original:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {OPCIONES_UNIDAD_POTENCIA.map((op) => {
                const activo = unidad === op.id;
                return (
                  <div
                    key={op.id}
                    onClick={() => !procesando && setUnidad(op.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '8px',
                      border: activo ? '1.5px solid #f59e0b' : '1px solid #1e293b',
                      background: activo ? 'rgba(245, 158, 11, 0.12)' : '#0f172a',
                      cursor: procesando ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <input type="radio" checked={activo} onChange={() => setUnidad(op.id)} disabled={procesando} style={{ cursor: 'pointer', accentColor: '#f59e0b' }} />
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: activo ? '#f8fafc' : '#cbd5e1' }}>{op.label}</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{op.desc}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: activo ? 'rgba(245, 158, 11, 0.2)' : '#1e293b', color: activo ? '#fbbf24' : '#94a3b8' }}>
                      {op.badge}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Drag & Drop File Picker */}
          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              2. Selecciona o arrastra el archivo de potencia:
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastrando(false); handleSeleccionArchivo(e.dataTransfer.files?.[0]); }}
              onClick={() => !procesando && inputRef.current?.click()}
              style={{
                border: arrastrando ? '2px dashed #f59e0b' : archivo ? '1px solid #10b981' : '1.5px dashed #334155',
                borderRadius: '10px',
                background: arrastrando ? 'rgba(245, 158, 11, 0.08)' : archivo ? 'rgba(16, 185, 129, 0.06)' : '#0f172a',
                padding: '1.1rem',
                textAlign: 'center',
                cursor: procesando ? 'not-allowed' : 'pointer',
              }}
            >
              <input ref={inputRef} type="file" disabled={procesando} accept=".csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(e) => handleSeleccionArchivo(e.target.files?.[0])} style={{ display: 'none' }} />
              {archivo ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileSpreadsheet size={22} color="#10b981" />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#f8fafc', wordBreak: 'break-all' }}>{archivo.name}</div>
                    <div style={{ fontSize: '0.72rem', color: '#10b981' }}>Listo para cargar ({formatearKb(archivo.size)}) · Clic para cambiar</div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                  <FileUp size={26} color="#64748b" />
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1' }}>Haz clic para explorar o arrastra el archivo aquí</div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Archivos soportados: CSV (.csv) y Excel (.xlsx, .xls)</div>
                </div>
              )}
            </div>
          </div>

          {/* Barra de progreso interactiva con porcentaje */}
          {procesando && (
            <div style={{ background: '#0f172a', border: exito ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid #1e293b', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                <span style={{ color: exito ? '#34d399' : '#f59e0b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  {exito ? <CheckCircle2 size={16} color="#34d399" /> : <RefreshCw size={14} className="spin-animation" color="#f59e0b" />}
                  {fase}
                </span>
                <span style={{ color: exito ? '#34d399' : '#f8fafc', fontWeight: 800 }}>{porcentaje}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${porcentaje}%`, height: '100%', background: exito ? 'linear-gradient(90deg, #059669, #10b981)' : 'linear-gradient(90deg, #d97706, #fbbf24)', transition: 'width 0.25s ease' }} />
              </div>
            </div>
          )}
        </div>

        {/* Botones de acción */}
        <div style={{ padding: '0.85rem 1.4rem', borderTop: '1px solid #1e293b', background: '#090d16', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem' }}>
          <button type="button" onClick={onClose} disabled={procesando} style={{ padding: '0.48rem 0.95rem', borderRadius: '7px', border: '1px solid #334155', background: '#1e293b', color: '#cbd5e1', fontSize: '0.78rem', fontWeight: 600, cursor: procesando ? 'not-allowed' : 'pointer' }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmarCarga}
            disabled={!archivo || procesando}
            style={{
              padding: '0.48rem 1.25rem',
              borderRadius: '7px',
              border: 'none',
              background: exito ? 'linear-gradient(135deg, #059669, #10b981)' : !archivo || procesando ? '#334155' : 'linear-gradient(135deg, #d97706, #b45309)',
              color: !archivo || (procesando && !exito) ? '#94a3b8' : '#fff',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: !archivo || procesando ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {exito ? <><CheckCircle2 size={16} /><span>¡Cargado con Éxito!</span></> : procesando ? <><RefreshCw size={14} className="spin-animation" /><span>Cargando {porcentaje}%...</span></> : <><UploadCloud size={16} /><span>Cargar Archivo</span></>}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
};

export default ModalCargaPotencia;
