import React, { useState, useEffect } from 'react';
import { Zap, UploadCloud, AlertCircle } from 'lucide-react';
import { parsearCSVPotencia, analizarValidacionesPotencia } from './utils/analisisPotenciaUtils';
import ResumenValidacionCardsPotencia from './ResumenValidacionCardsPotencia';
import TablaMedidasPotencia from './TablaMedidasPotencia';
import ModalCargaPotencia from './ModalCargaPotencia';
import { CSV_EJEMPLO_POTENCIA } from './utils/csvEjemploPotencia';

const ModuloRegistroPotencia = () => {
  const [dataParsed, setDataParsed] = useState(null);
  const [validacion, setValidacion] = useState(null);
  const [registroEnfocado, setRegistroEnfocado] = useState(null);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [errorCarga, setErrorCarga] = useState(null);
  const [mostrarModalCarga, setMostrarModalCarga] = useState(false);

  const handleSeleccionarHueco = (hueco) => {
    if (!hueco) return;
    setRegistroEnfocado({
      id: hueco.registroId,
      hasta: hueco.hasta,
      timestampTrigger: Date.now(),
    });
  };

  const procesarTextoCSV = (texto, nombre = '', factorConversion = 0.001) => {
    try {
      const { registros, columnas } = parsearCSVPotencia(texto, factorConversion);
      if (!registros || registros.length === 0) {
        setErrorCarga('El archivo no contiene filas válidas o no se detectaron columnas legibles.');
        return;
      }
      const valid = analizarValidacionesPotencia(registros, columnas);
      setDataParsed({ registros, columnas });
      setValidacion(valid);
      setErrorCarga(null);
      if (nombre) {
        setNombreArchivo(nombre);
      }
    } catch (err) {
      console.error('Error procesando archivo de potencia:', err);
      setErrorCarga('Error al procesar el archivo: ' + (err.message || 'Formato no compatible'));
    }
  };

  useEffect(() => {
    try {
      const guardado = localStorage.getItem('facturacion_cliente_libre_potencia_csv');
      const factorGuardado = localStorage.getItem('facturacion_cliente_libre_potencia_factor');
      if (guardado && guardado.trim().length > 50) {
        const factor = factorGuardado !== null && !isNaN(parseFloat(factorGuardado)) ? parseFloat(factorGuardado) : 0.001;
        procesarTextoCSV(guardado, 'Datos guardados en memoria', factor);
        return;
      }
    } catch (e) {
      console.warn('Error leyendo localStorage de potencia:', e);
    }
    // Carga inicial con los datos provistos por el usuario (Agosto 2026), convirtiendo W -> kW (factor 0.001)
    procesarTextoCSV(CSV_EJEMPLO_POTENCIA, 'Datos de ejemplo (Agosto 2026 - W → kW)', 0.001);
  }, []);

  const handleProcesarDesdeModal = ({ csvText, nombreArchivo: nombre, factorConversion, unidadOrigen }) => {
    try {
      const { registros, columnas } = parsearCSVPotencia(csvText, factorConversion);
      if (!registros || registros.length === 0) {
        setErrorCarga('El archivo no contiene filas válidas o no se detectaron columnas legibles.');
        return;
      }
      const valid = analizarValidacionesPotencia(registros, columnas);
      setDataParsed({ registros, columnas });
      setValidacion(valid);
      setErrorCarga(null);

      const detalleConversion = factorConversion !== 1.0 ? ` (${unidadOrigen} → kW)` : ' (kW)';
      setNombreArchivo(`${nombre}${detalleConversion}`);

      try {
        localStorage.setItem('facturacion_cliente_libre_potencia_csv', csvText);
        localStorage.setItem('facturacion_cliente_libre_potencia_factor', String(factorConversion));
      } catch (e) {
        console.warn('No se pudo guardar CSV de potencia en localStorage:', e);
      }
    } catch (err) {
      console.error('Error procesando archivo de potencia:', err);
      setErrorCarga('Error al procesar el archivo: ' + (err.message || 'Formato no compatible'));
    }
  };

  // Eliminación de filas seleccionadas con normalización de IDs garantizada
  const handleEliminarRegistros = (idsAEliminar) => {
    if (!dataParsed || !idsAEliminar || idsAEliminar.size === 0) return;
    const idsSet = new Set(Array.from(idsAEliminar).map((id) => String(id)));
    const nuevosRegistros = dataParsed.registros.filter((r) => !idsSet.has(String(r.id)));

    if (nuevosRegistros.length === 0) {
      setDataParsed({ registros: [], columnas: dataParsed.columnas });
      setValidacion(null);
      return;
    }
    const valid = analizarValidacionesPotencia(nuevosRegistros, dataParsed.columnas);
    setDataParsed({ registros: nuevosRegistros, columnas: dataParsed.columnas });
    setValidacion(valid);
  };

  // Vaciado total de la tabla de potencias
  const handleVaciarDatos = () => {
    setDataParsed({ registros: [], columnas: [] });
    setValidacion(null);
    setNombreArchivo('');
    setRegistroEnfocado(null);
    try {
      localStorage.removeItem('facturacion_cliente_libre_potencia_csv');
      localStorage.removeItem('facturacion_cliente_libre_potencia_factor');
    } catch (e) {
      console.warn('Error limpiando localStorage de potencia:', e);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {errorCarga && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fca5a5', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <AlertCircle size={16} color="#ef4444" />
          <span>{errorCarga}</span>
        </div>
      )}

      {/* Barra Superior Fija */}
      <div className="bot-panel" style={{ flexShrink: 0, background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid #334155', boxShadow: '0 4px 20px rgba(0,0,0,0.4)', padding: '0.65rem 1.15rem', margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ minWidth: '170px' }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Zap size={19} color="#f59e0b" /> Registros de Potencias
            </h2>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.73rem', color: '#94a3b8' }}>
              {nombreArchivo ? <span style={{ color: '#fbbf24', fontWeight: 600 }}>{nombreArchivo}</span> : 'Medidas de Potencia cada 15 min (kW) · Análisis 2.1 y 2.2'}
            </p>
          </div>

          {validacion && (
            <ResumenValidacionCardsPotencia
              validacion={validacion}
              onSeleccionarHueco={handleSeleccionarHueco}
            />
          )}

          <div>
            <button
              type="button"
              onClick={() => setMostrarModalCarga(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', background: '#1e293b', border: '1px solid #f59e0b88', borderRadius: '7px', padding: '0.45rem 0.95rem', color: '#fbbf24', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s ease', boxShadow: '0 2px 8px rgba(245, 158, 11, 0.15)' }}
            >
              <UploadCloud size={16} />
              <span>Cargar CSV o Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabla de potencia con checkboxes y virtualización */}
      {dataParsed && validacion && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <TablaMedidasPotencia
            registros={validacion.registrosConEstado}
            columnas={dataParsed.columnas}
            registroEnfocado={registroEnfocado}
            onEliminarRegistros={handleEliminarRegistros}
            onVaciarDatos={handleVaciarDatos}
          />
        </div>
      )}

      <ModalCargaPotencia
        isOpen={mostrarModalCarga}
        onClose={() => setMostrarModalCarga(false)}
        onProcesarData={handleProcesarDesdeModal}
      />
    </div>
  );
};

export default ModuloRegistroPotencia;
