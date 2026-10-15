import React, { useState, useRef, useEffect } from 'react';
import { Upload, Loader2, Download, FolderOpen, X, CheckCircle2, FileSpreadsheet, CheckSquare, AlertTriangle, Sparkles } from 'lucide-react';
import * as XLSX from 'xlsx';

const backendBaseUrl = window.location.origin.replace('5173', '3001');

const CargaMasiva = ({ onCorregir }) => {
  const [resultado, setResultado] = useState(null); // null | 'cargando' | 'error' | array
  const [archivoNombre, setArchivoNombre] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [archivoSeleccionado, setArchivoSeleccionado] = useState(null);
  const [prevalidacion, setPrevalidacion] = useState(null); // { cargando, data, error }
  const [progreso, setProgreso] = useState({
    activo: false,
    porcentaje: 0,
    actual: 0,
    total: 0,
    mensaje: '',
  });
  const fileInputRef = useRef(null);
  const progresoTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (progresoTimerRef.current) clearInterval(progresoTimerRef.current);
    };
  }, []);

  const descargarPlantilla = () => {
    const datos = [
      {
        'Descripción': 'Mantenimiento correctivo / fuga detectada',
        'SEDE CECO': 'SPSA - PLAZA VEA MIRAFLORES',
        'Activo maestro': 'Bomba de Agua Principal',
        'Fecha del Incidente': '2026-09-24 10:00',
        'Solicitado por': 'Juan Pérez',
        'Correo': 'juan.perez@empresa.pe',
        'Referencia': 'OT-001'
      },
      {
        'Descripción': 'Ruido anormal en motor de condensador',
        'SEDE CECO': 'SPSA - VIVANDA BENAVIDES',
        'Activo maestro': 'Unidad Condensadora UC-02',
        'Fecha del Incidente': '2026-09-24 11:30',
        'Solicitado por': 'Carlos Sánchez',
        'Correo': 'csanchez@empresa.pe',
        'Referencia': 'REF-102'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(datos);
    ws['!cols'] = [
      { wch: 45 }, // Descripción
      { wch: 32 }, // SEDE CECO
      { wch: 30 }, // Activo maestro
      { wch: 22 }, // Fecha del Incidente
      { wch: 24 }, // Solicitado por
      { wch: 28 }, // Correo
      { wch: 18 }  // Referencia
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Solicitudes');
    XLSX.writeFile(wb, 'Plantilla_Solicitudes_Itlus_Fracttal.xlsx');
  };

  const prevalidarSedesArchivo = async (archivo) => {
    setPrevalidacion({ cargando: true, data: null, error: null });
    try {
      const form = new FormData();
      form.append('excel', archivo);
      const res = await fetch(`${backendBaseUrl}/api/itlus-fractal/prevalidar-excel`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (data.success) {
        setPrevalidacion({ cargando: false, data, error: null });
      } else {
        setPrevalidacion({ cargando: false, data: null, error: data.error });
      }
    } catch (err) {
      setPrevalidacion({ cargando: false, data: null, error: err.message });
    }
  };

  const handleSeleccionarArchivo = (e) => {
    const archivo = e.target.files?.[0];
    if (archivo) {
      setArchivoSeleccionado(archivo);
      prevalidarSedesArchivo(archivo);
    }
  };

  const abrirSelectorLocal = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const procesarArchivoModal = async () => {
    if (!archivoSeleccionado) return;
    const archivo = archivoSeleccionado;
    setArchivoNombre(archivo.name);
    setModalAbierto(false);
    setResultado('cargando');

    // Analizamos el archivo Excel localmente para saber cuántas filas contiene
    let totalFilas = 1;
    try {
      const buffer = await archivo.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(hoja);
      const filasValidas = rows.filter((r) => {
        const d = String(r['Descripción'] || r['Descripcion'] || '').trim();
        const a = String(r['Activo maestro'] || r['Activo'] || r['SEDE CECO'] || '').trim();
        return (d && d.toLowerCase() !== 'nan') || (a && a.toLowerCase() !== 'nan');
      });
      totalFilas = Math.max(1, filasValidas.length);
    } catch (e) {
      console.warn('No se pudo pre-contar las filas del Excel:', e);
    }

    setProgreso({
      activo: true,
      porcentaje: 6,
      actual: 1,
      total: totalFilas,
      mensaje: `Iniciando sesión segura en Fracttal...`
    });

    // Simulador de avance suave y realista sincronizado con las llamadas a Fracttal
    let pctActual = 6;
    const tiempoPorFilaMs = 5000;
    const totalTiempoMs = totalFilas * tiempoPorFilaMs;
    const intervaloMs = 200;
    const pasoPct = (88 - 6) / (totalTiempoMs / intervaloMs);

    if (progresoTimerRef.current) clearInterval(progresoTimerRef.current);
    progresoTimerRef.current = setInterval(() => {
      if (pctActual < 88) {
        pctActual += pasoPct;
      } else if (pctActual < 95) {
        pctActual += pasoPct * 0.2;
      }
      const pctRound = Math.min(95, Math.round(pctActual));
      const filaCalculada = Math.min(totalFilas, Math.floor(((pctRound - 6) / (95 - 6)) * totalFilas) + 1);

      let msg = `Procesando fila ${filaCalculada} de ${totalFilas} en Fracttal...`;
      if (pctRound < 25) {
        msg = `Iniciando sesión segura en Fracttal...`;
      } else if (pctRound < 55) {
        msg = `Buscando sede y localizando equipos en Fracttal...`;
      } else if (pctRound < 90) {
        msg = `Validando solicitud ${filaCalculada} de ${totalFilas}...`;
      } else {
        msg = `Finalizando y guardando resultados...`;
      }

      setProgreso((prev) => ({
        ...prev,
        porcentaje: pctRound,
        actual: filaCalculada,
        mensaje: msg,
      }));
    }, intervaloMs);

    const form = new FormData();
    form.append('excel', archivo);

    try {
      const res = await fetch(`${backendBaseUrl}/api/itlus-fractal/crear-masivo`, { method: 'POST', body: form });
      const data = await res.json();

      if (progresoTimerRef.current) clearInterval(progresoTimerRef.current);

      if (data.success && Array.isArray(data.data)) {
        setProgreso({
          activo: true,
          porcentaje: 100,
          actual: totalFilas,
          total: totalFilas,
          mensaje: '¡Proceso completado exitosamente!'
        });
        setTimeout(() => {
          setResultado(data.data);
          setProgreso((p) => ({ ...p, activo: false }));
        }, 500);
      } else {
        setProgreso((p) => ({ ...p, activo: false }));
        setResultado('error');
      }
    } catch (err) {
      if (progresoTimerRef.current) clearInterval(progresoTimerRef.current);
      setProgreso((p) => ({ ...p, activo: false }));
      setResultado('error');
    }
  };

  return (
    <div className="bot-panel">
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
        <Upload size={16} color="#38bdf8" /> Crear varias desde un Excel
      </h3>
      <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 0, marginBottom: '1rem' }}>
        Columnas: <b>Descripción</b> y <b>Activo maestro</b> (obligatorias — se busca por nombre en Fracttal), <b>SEDE CECO</b>, Fecha del Incidente, Solicitado por, Correo, Referencia. Se crean
        una por una; las filas donde el activo no se encuentre claro no se adivinan — quedan marcadas para resolver
        a mano.
      </p>

      {/* Input de archivo oculto para el selector de sistema */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={handleSeleccionarArchivo}
      />

      {/* Botón principal: abre el modal y ya no requiere el input blanco nativo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
        <button
          onClick={() => {
            setArchivoSeleccionado(null);
            setPrevalidacion(null);
            setModalAbierto(true);
          }}
          disabled={resultado === 'cargando'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            background: 'rgba(56,189,248,0.12)', border: '1px solid #38bdf855', borderRadius: '6px',
            padding: '0.45rem 0.95rem', color: '#38bdf8', fontSize: '0.75rem', fontWeight: 700,
            cursor: resultado === 'cargando' ? 'default' : 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          {resultado === 'cargando' ? (
            <>
              <Loader2 size={13} className="spin-anim" />
              <span>Procesando ({progreso.porcentaje}%)…</span>
            </>
          ) : (
            <>
              <Upload size={13} />
              <span>Subir y cargar</span>
            </>
          )}
        </button>

        {archivoNombre && (
          <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
            Último archivo procesado: <b style={{ color: '#cbd5e1' }}>{archivoNombre}</b>
          </span>
        )}
      </div>

      {/* Barra de progreso interactiva con porcentaje animado */}
      {progreso.activo && (
        <div
          style={{
            marginTop: '1rem',
            padding: '1rem 1.25rem',
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: '12px',
            maxWidth: '650px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5), 0 0 25px rgba(56, 189, 248, 0.15)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Loader2 size={15} className="spin-anim" color="#38bdf8" />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f8fafc' }}>
                {progreso.mensaje}
              </span>
            </div>
            <span style={{
              fontSize: '0.95rem',
              fontWeight: 800,
              color: '#38bdf8',
              fontFamily: 'monospace',
              letterSpacing: '0.02em',
              background: 'rgba(56, 189, 248, 0.12)',
              padding: '0.15rem 0.5rem',
              borderRadius: '6px',
              border: '1px solid rgba(56, 189, 248, 0.3)'
            }}>
              {progreso.porcentaje}%
            </span>
          </div>

          {/* Track y Barra de progreso con gradiente */}
          <div style={{
            width: '100%',
            height: '10px',
            backgroundColor: 'rgba(30, 41, 59, 0.8)',
            borderRadius: '9999px',
            overflow: 'hidden',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
            border: '1px solid rgba(51, 65, 85, 0.5)'
          }}>
            <div style={{
              width: `${progreso.porcentaje}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #0284c7 0%, #38bdf8 60%, #a855f7 100%)',
              borderRadius: '9999px',
              transition: 'width 0.2s ease-out',
              boxShadow: '0 0 14px rgba(56, 189, 248, 0.8)',
            }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.45rem' }}>
            <span>Fila {progreso.actual} de {progreso.total}</span>
            <span style={{ color: '#38bdf8' }}>Conectando con Fracttal API</span>
          </div>
        </div>
      )}

      {/* InfoModal para la carga de Excel y descarga de plantilla */}
      {modalAbierto && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(3, 4, 6, 0.82)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.2rem',
          }}
          onClick={() => setModalAbierto(false)}
        >
          <div
            style={{
              backgroundColor: '#181b26',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 35px rgba(56, 189, 248, 0.15)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '480px',
              overflow: 'hidden',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Franja superior azul brillante */}
            <div style={{ height: '4px', backgroundColor: '#38bdf8', width: '100%' }} />

            {/* Botón cerrar X */}
            <button
              onClick={() => setModalAbierto(false)}
              style={{
                position: 'absolute',
                top: '14px',
                right: '14px',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
            >
              <X size={18} />
            </button>

            {/* Contenido del modal */}
            <div style={{ padding: '1.6rem 1.8rem 1.4rem' }}>
              {/* Encabezado */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.1rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    color: '#38bdf8',
                  }}
                >
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                    Carga Masiva desde Excel
                  </h4>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
                    Itlus Fractal · Creación masiva de solicitudes
                  </p>
                </div>
              </div>

              {/* Guía rápida de columnas */}
              <div
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid rgba(51, 65, 85, 0.7)',
                  borderRadius: '10px',
                  padding: '0.7rem 0.9rem',
                  fontSize: '0.72rem',
                  color: '#cbd5e1',
                  marginBottom: '1.3rem',
                  lineHeight: '1.45',
                }}
              >
                <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '0.25rem' }}>
                  Estructura del archivo:
                </div>
                <div>• Obligatorias: <b style={{ color: '#fff' }}>Descripción</b> y <b style={{ color: '#fff' }}>Activo maestro</b></div>
                <div style={{ color: '#94a3b8' }}>• Opcionales: SEDE CECO, Fecha del Incidente, Solicitado por, Correo, Referencia</div>
              </div>

              {/* Botones de acción solicitados */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.2rem' }}>
                {/* 1. Botón para descargar la plantilla */}
                <button
                  type="button"
                  onClick={descargarPlantilla}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    width: '100%',
                    padding: '0.65rem 1rem',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.35)',
                    borderRadius: '8px',
                    color: '#4ade80',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.18)';
                    e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.55)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.35)';
                  }}
                >
                  <Download size={16} />
                  Descargar Plantilla Excel (.xlsx)
                </button>

                {/* 2. Botón para ubicar el archivo en el escritorio / equipo */}
                <button
                  type="button"
                  onClick={abrirSelectorLocal}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    width: '100%',
                    padding: '0.65rem 1rem',
                    backgroundColor: 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    borderRadius: '8px',
                    color: '#38bdf8',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.22)';
                    e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.65)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.12)';
                    e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.4)';
                  }}
                >
                  <FolderOpen size={16} />
                  {archivoSeleccionado ? 'Cambiar archivo seleccionado' : 'Ubicar archivo en el escritorio / equipo'}
                </button>
              </div>

              {/* Detalle del archivo seleccionado si ya se eligió */}
              {archivoSeleccionado && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.55rem 0.8rem',
                    backgroundColor: 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid rgba(34, 197, 94, 0.25)',
                    borderRadius: '8px',
                    marginBottom: '0.75rem',
                    fontSize: '0.74rem',
                    color: '#86efac',
                  }}
                >
                  <CheckCircle2 size={16} color="#4ade80" style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Archivo cargado: <b>{archivoSeleccionado.name}</b> ({(archivoSeleccionado.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              )}

              {/* Prevalidación de Sedes con base local de 515 tiendas */}
              {prevalidacion && (
                <div
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.85)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    borderRadius: '8px',
                    padding: '0.75rem 0.9rem',
                    marginBottom: '1.2rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 700, color: '#f8fafc' }}>
                      <Sparkles size={14} color="#38bdf8" />
                      <span>Pre-validación de Sedes (Base local de 515 tiendas)</span>
                    </div>
                    {prevalidacion.cargando && <Loader2 size={12} className="spin-anim" color="#38bdf8" />}
                  </div>

                  {prevalidacion.cargando && (
                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#94a3b8' }}>
                      Pre-validando nombres y CECOs contra la base local (0ms)…
                    </p>
                  )}

                  {prevalidacion.data && (
                    <>
                      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.45rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)', fontWeight: 700 }}>
                          ✓ {prevalidacion.data.resueltas} Resueltas
                        </span>
                        {prevalidacion.data.ambiguas > 0 && (
                          <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(234, 179, 8, 0.15)', color: '#fde047', border: '1px solid rgba(234,179,8,0.3)', fontWeight: 700 }}>
                            ⚠️ {prevalidacion.data.ambiguas} Por definir (Makro / Plaza Vea)
                          </span>
                        )}
                        {prevalidacion.data.no_encontradas > 0 && (
                          <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', fontWeight: 700 }}>
                            ✕ {prevalidacion.data.no_encontradas} No encontradas
                          </span>
                        )}
                      </div>

                      {prevalidacion.data.ambiguas > 0 && (
                        <div style={{ background: 'rgba(0, 0, 0, 0.25)', borderRadius: '6px', padding: '0.45rem 0.6rem', border: '1px solid rgba(234, 179, 8, 0.25)' }}>
                          <div style={{ fontSize: '0.66rem', color: '#fbbf24', fontWeight: 700, marginBottom: '0.3rem' }}>
                            ⚡ Sedes ambiguas que podrás diferenciar por marca o CECO:
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '90px', overflowY: 'auto' }}>
                            {prevalidacion.data.filas.filter((f) => f.estado === 'ambigua').map((f) => (
                              <div key={f.fila} style={{ fontSize: '0.67rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.2rem' }}>
                                <span style={{ color: '#e2e8f0' }}>
                                  Fila {f.fila}: <b style={{ color: '#38bdf8' }}>{f.sede_ceco_original}</b>
                                </span>
                                <span style={{ color: '#94a3b8', fontSize: '0.64rem' }}>
                                  ¿Makro (24) o Plaza Vea (25)?
                                </span>
                              </div>
                            ))}
                          </div>
                          <div style={{ fontSize: '0.63rem', color: '#94a3b8', marginTop: '0.3rem' }}>
                            💡 Puedes elegir la marca con un clic abajo o escribir el CECO (24... o 25...) en tu Excel.
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Botones inferiores del modal */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.6rem',
                  paddingTop: '0.9rem',
                  borderTop: '1px solid rgba(51, 65, 85, 0.5)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  style={{
                    padding: '0.45rem 0.9rem',
                    background: 'none',
                    border: '1px solid #475569',
                    borderRadius: '6px',
                    color: '#94a3b8',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!archivoSeleccionado}
                  onClick={procesarArchivoModal}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 1rem',
                    background: archivoSeleccionado ? '#0284c7' : 'rgba(51, 65, 85, 0.5)',
                    border: 'none',
                    borderRadius: '6px',
                    color: archivoSeleccionado ? '#fff' : '#64748b',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: archivoSeleccionado ? 'pointer' : 'not-allowed',
                    boxShadow: archivoSeleccionado ? '0 4px 14px rgba(2, 132, 199, 0.35)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Upload size={13} />
                  Procesar y Crear Solicitudes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {resultado === 'error' && (
        <p style={{ color: '#f87171', fontSize: '0.78rem', marginTop: '0.75rem' }}>
          No se pudo procesar el Excel {archivoNombre ? `"${archivoNombre}"` : ''}.
        </p>
      )}

      {Array.isArray(resultado) && <ResultadoMasivo filas={resultado} onCorregir={onCorregir} />}
    </div>
  );
};

const ResultadoMasivo = ({ filas, onCorregir }) => (
  <>
    <div style={{ display: 'flex', gap: '0.75rem', margin: '1rem 0' }}>
      <div style={{ padding: '0.5rem 0.9rem', borderRadius: '10px', border: '1px solid #16653455', background: 'rgba(34,197,94,0.08)' }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#4ade80' }}>{filas.filter((f) => f.exito).length}</div>
        <div style={{ fontSize: '0.68rem', color: '#86efac' }}>Creadas</div>
      </div>
      <div style={{ padding: '0.5rem 0.9rem', borderRadius: '10px', border: '1px solid #7f1d1d55', background: 'rgba(239,68,68,0.08)' }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fca5a5' }}>{filas.filter((f) => !f.exito).length}</div>
        <div style={{ fontSize: '0.68rem', color: '#fca5a5' }}>Pendientes</div>
      </div>
    </div>

    <div style={{ maxHeight: '42vh', overflowY: 'auto', border: '1px solid #334155', borderRadius: '10px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
          <tr style={{ backgroundColor: '#0f172a' }}>
            {['Fila', 'Descripción', 'SEDE CECO', 'Activo maestro', 'Fecha del incidente', 'Solicitado por', 'Correo', 'Referencia', 'Resultado', ''].map((h, idx) => (
              <th
                key={idx}
                style={{
                  padding: '0.5rem 0.6rem',
                  textAlign: idx === 0 || idx === 9 ? 'center' : 'left',
                  color: '#cbd5e1',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  borderBottom: '1px solid #334155',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr
              key={i}
              style={{
                borderTop: '1px solid #334155',
                backgroundColor: f.exito ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
              }}
            >
              <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center', color: '#64748b' }}>{f.fila}</td>
              <td style={{ padding: '0.45rem 0.6rem', color: '#fff', fontWeight: 500, minWidth: '150px' }}>
                {f.descripcion || '—'}
              </td>
              <td style={{ padding: '0.45rem 0.6rem', minWidth: '140px' }}>
                <div style={{ color: '#38bdf8', fontWeight: 600 }}>{f.sede_ceco || '—'}</div>
                {Array.isArray(f.candidatos_sedes) && f.candidatos_sedes.length > 0 && (
                  <div style={{ marginTop: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.64rem', color: '#fbbf24', fontWeight: 600 }}>
                      ⚡ Seleccionar sede:
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                      {f.candidatos_sedes.map((cs, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => onCorregir({ ...f, sede_ceco: cs.description })}
                          style={{
                            background: cs.marca.includes('24') ? 'rgba(234, 179, 8, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                            border: `1px solid ${cs.marca.includes('24') ? '#eab30866' : '#38bdf866'}`,
                            borderRadius: '4px',
                            padding: '0.15rem 0.4rem',
                            color: cs.marca.includes('24') ? '#fde047' : '#7dd3fc',
                            fontSize: '0.66rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                            whiteSpace: 'nowrap',
                          }}
                          title={`Validar arriba como ${cs.description}`}
                        >
                          {cs.marca.includes('24') ? '🟡 ' : '🔵 '}
                          {cs.marca}: {cs.code.split('-')[2] || cs.code}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </td>
              <td style={{ padding: '0.45rem 0.6rem', minWidth: '160px' }}>
                {f.exito ? (
                  <span style={{ color: '#4ade80', fontWeight: 600 }}>{f.activo_descripcion || f.activo_texto || '—'}</span>
                ) : (
                  <div>
                    <span style={{ color: '#cbd5e1' }}>{f.activo_texto || '—'}</span>
                    {Array.isArray(f.candidatos) && f.candidatos.length > 0 && (
                      <div style={{ marginTop: '0.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {f.candidatos.slice(0, 3).map((c, idx) => (
                          <span
                            key={idx}
                            style={{
                              background: 'rgba(56, 189, 248, 0.1)',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              borderRadius: '4px',
                              padding: '0.1rem 0.35rem',
                              color: '#38bdf8',
                              fontSize: '0.65rem',
                              whiteSpace: 'nowrap',
                            }}
                            title={c.description}
                          >
                            {c.description.length > 30 ? c.description.slice(0, 30) + '…' : c.description}
                          </span>
                        ))}
                        {f.candidatos.length > 3 && (
                          <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
                            +{f.candidatos.length - 3} más
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </td>
              <td style={{ padding: '0.45rem 0.6rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                {f.fecha_incidente || '—'}
              </td>
              <td style={{ padding: '0.45rem 0.6rem', color: '#cbd5e1' }}>
                {f.solicitado_por || '—'}
              </td>
              <td style={{ padding: '0.45rem 0.6rem', color: '#94a3b8' }}>
                {f.email || '—'}
              </td>
              <td style={{ padding: '0.45rem 0.6rem', color: '#94a3b8' }}>
                {f.referencia || '—'}
              </td>
              <td style={{ padding: '0.45rem 0.6rem', minWidth: '150px' }}>
                {f.exito ? (
                  <span style={{ color: '#4ade80', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    <CheckCircle2 size={13} /> Folio #{f.folio}
                  </span>
                ) : (
                  <div>
                    <span style={{ color: '#fca5a5', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <AlertTriangle size={13} /> Pendiente
                    </span>
                    {f.causa && (
                      <div style={{ fontSize: '0.68rem', color: '#fca5a5', marginTop: '0.15rem', lineHeight: '1.3' }}>
                        {f.causa}
                      </div>
                    )}
                  </div>
                )}
              </td>
              <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                {!f.exito && (
                  <button
                    onClick={() => onCorregir(f)}
                    title="Validar y resolver activo en la tabla manual de arriba"
                    style={{
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid #38bdf855',
                      borderRadius: '6px',
                      padding: '0.25rem 0.65rem',
                      color: '#38bdf8',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(56, 189, 248, 0.22)';
                      e.currentTarget.style.borderColor = '#38bdf8';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(56, 189, 248, 0.12)';
                      e.currentTarget.style.borderColor = '#38bdf855';
                    }}
                  >
                    <CheckSquare size={12} />
                    Validar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

export default CargaMasiva;
