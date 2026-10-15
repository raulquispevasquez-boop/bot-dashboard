import React, { useState } from 'react';
import {
  HelpCircle,
  X,
  ShieldCheck,
  AlertTriangle,
  Radio,
  Clock,
  ZapOff,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  ChevronRight,
  Info,
} from 'lucide-react';

const ModalCriteriosIdentificacionDatos = ({ abierto, onClose, metricas, criterioActual }) => {
  const [casoSeleccionado, setCasoSeleccionado] = useState('cero_amperios');

  if (!abierto) return null;

  const casos = [
    {
      id: 'cero_amperios',
      numero: '1',
      titulo: 'Consumo Real Cero (0 Amperios)',
      subtitulo: 'Equipo Apagado / Carga en Standby',
      icono: ShieldCheck,
      color: '#38bdf8',
      bgBadge: 'rgba(56, 189, 248, 0.15)',
      bordeBadge: 'rgba(56, 189, 248, 0.35)',
      condicionSubida: 'La celda trae el número explícito 0 o 0.000 con fecha y hora continua.',
      medidorComunico: 'SÍ, comunicó normalmente',
      detalleComunico: 'El medidor respondió con éxito al datalogger y confirmó que la corriente es 0 A.',
      tratamientoFactura: 'NO SE IMPUTA. Facturación estricta en 0 kWh.',
      impactoFactura: '🛡️ Protegido: Evita englobar o sobrefacturar la factura comercial.',
      fundamentoTecnico:
        'Si un chiller, compresor, transformador o línea de producción se apaga por mantenimiento interno o parada operativa, su consumo eléctrico real es cero. El medidor está midiendo bien. Rellenar o imputar este tramo generaría cobros fantasmas por energía no consumida, viciando la liquidación mensual.',
      normativa: 'Protección Comercial Cliente Libre (Código Nacional de Electricidad / Osinergmin).',
    },
    {
      id: 'perdida_senal',
      numero: '2',
      titulo: 'Pérdida Real de Señal de Telemetría',
      subtitulo: 'Falla de Canal / Desconexión de Puerto',
      icono: Radio,
      color: '#f87171',
      bgBadge: 'rgba(239, 68, 68, 0.15)',
      bordeBadge: 'rgba(239, 68, 68, 0.35)',
      condicionSubida: 'La celda llega vacía (,,), nula (null) o sin lectura numérica (NaN).',
      medidorComunico: 'NO comunicó',
      detalleComunico: 'El datalogger / concentrador no pudo leer el puerto Modbus/Ethernet del medidor.',
      tratamientoFactura: 'SÍ PROCEDE IMPUTACIÓN R².',
      impactoFactura: 'Recupera la energía consumida que no fue transmitida por falla de enlace.',
      fundamentoTecnico:
        'El cliente sí se encontraba operando y consumiendo potencia, pero el dato no llegó al sistema por problemas de cableado, puerto o red de telemetría. Procede aplicar la imputación matemática por perfil trapezoidal homólogo y correlación R² para restituir el consumo legítimo.',
      normativa: 'Procedimiento Técnico COES PR-21 / Procedimientos de Liquidación Osinergmin.',
    },
    {
      id: 'salto_temporal',
      numero: '3',
      titulo: 'Salto Temporal (Paquete Perdido)',
      subtitulo: 'Interrupción de Secuencia Cronológica',
      icono: Clock,
      color: '#fbbf24',
      bgBadge: 'rgba(245, 158, 11, 0.15)',
      bordeBadge: 'rgba(245, 158, 11, 0.35)',
      condicionSubida: 'Faltan filas completas en la serie de tiempo (ej. salta de 14:00 a 15:30, Δt > 15 min).',
      medidorComunico: 'NO comunicó',
      detalleComunico: 'El enlace estuvo caído o el registrador sufrió una desincronización horaria.',
      tratamientoFactura: 'SÍ PROCEDE IMPUTACIÓN R².',
      impactoFactura: 'Reconstruye los intervalos omitidos respetando la meseta trapezoidal diurna.',
      fundamentoTecnico:
        'El sistema genera automáticamente los intervalos faltantes de 15 minutos e inserta los valores calculados según el perfil estacional homólogo, garantizando la continuidad de las 96 lecturas diarias obligatorias.',
      normativa: 'Regla de Integridad de Base de Datos 96 lecturas/día (Norma Técnica de Calidad NTCSE).',
    },
    {
      id: 'corte_real',
      numero: '4',
      titulo: 'Corte Real de Suministro',
      subtitulo: 'Outage Externo / Mantenimiento Programado',
      icono: ZapOff,
      color: '#ef4444',
      bgBadge: 'rgba(239, 68, 68, 0.25)',
      bordeBadge: '#ef4444',
      condicionSubida: 'Coincide con ventana horaria declarada en el Gestor de Cortes Reales.',
      medidorComunico: 'Suministro Desenergizado',
      detalleComunico: 'Punto de entrega desenergizado físicamente por maniobra en el SEIN o red distribuidora.',
      tratamientoFactura: 'NO SE IMPUTA. 0 kW / 0 kWh estricto por derecho legal.',
      impactoFactura: 'Cumplimiento estricto de derechos normativos del Cliente Libre.',
      fundamentoTecnico:
        'Durante un corte externo no imputable al cliente, la distribuidora o generadora no suministró electricidad. Queda terminantemente prohibido imputar consumos o cobrar potencia en esas horas conforme a ley.',
      normativa: 'Compensaciones por Interrupciones y Cortes de Suministro (Reglamento Ley de Concesiones Eléctricas).',
    },
  ];

  const detalleActivo = casos.find((c) => c.id === casoSeleccionado) || casos[0];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: 'rgba(2, 6, 23, 0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
    >
      <div
        style={{
          background: '#090d16',
          border: '1.5px solid #38bdf8',
          borderRadius: '12px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
          width: '100%',
          maxWidth: '1050px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Encabezado */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 58, 138, 0.3) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                padding: '0.45rem',
                borderRadius: '8px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid #38bdf8',
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                1. ¿Cómo se identifica esto técnicamente en la subida de datos?
              </h3>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>
                Criterios de auditoría comercial de Cliente Libre y reglas de protección anti-englobamiento de factura
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '0.4rem',
              borderRadius: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Contenido con Scroll */}
        <div style={{ padding: '1.15rem 1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Alerta de Protección Anti-Englobe */}
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '8px',
              padding: '0.65rem 0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.65rem',
              fontSize: '0.73rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#cbd5e1' }}>
              <ShieldCheck size={18} color="#38bdf8" />
              <span>
                <strong>Principio Rector Anti-Sobrefacturación:</strong> Si el medidor reporta <strong>0 Amperios</strong> porque el equipo está apagado, <strong>NUNCA se imputa</strong>. Solo se imputa cuando hay <strong>pérdida real de señal</strong> (campos vacíos, nulos o saltos).
              </span>
            </div>
            <div
              style={{
                fontSize: '0.68rem',
                padding: '2px 8px',
                borderRadius: '12px',
                background: criterioActual === 'imputar_ceros' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                color: criterioActual === 'imputar_ceros' ? '#fbbf24' : '#6ee7b7',
                border: `1px solid ${criterioActual === 'imputar_ceros' ? '#f59e0b' : '#10b981'}`,
                fontWeight: 700,
              }}
            >
              {criterioActual === 'imputar_ceros' ? 'Modo: Criterio Extendido' : '✓ Modo Activo: Anti-Englobe Estricto'}
            </div>
          </div>

          {/* TABLA PRINCIPAL INTERACTIVA */}
          <div style={{ border: '1px solid #1e293b', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ background: '#111827', padding: '0.55rem 0.85rem', borderBottom: '1px solid #1e293b', fontSize: '0.76rem', fontWeight: 800, color: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Matriz Técnica de Identificación en Archivos y Tratamiento</span>
              <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Haz clic en cualquier fila para ver el detalle técnico</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#172033', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: '0.55rem 0.75rem', width: '25%' }}>Estado en la Subida de Datos</th>
                  <th style={{ padding: '0.55rem 0.75rem', width: '28%' }}>Condición Técnica en el Archivo</th>
                  <th style={{ padding: '0.55rem 0.75rem', width: '17%' }}>¿El medidor comunicó?</th>
                  <th style={{ padding: '0.55rem 0.75rem', width: '15%' }}>Tratamiento Facturación</th>
                  <th style={{ padding: '0.55rem 0.75rem', width: '15%' }}>Impacto en Factura</th>
                </tr>
              </thead>
              <tbody>
                {casos.map((caso) => {
                  const Icono = caso.icono;
                  const seleccionado = casoSeleccionado === caso.id;
                  return (
                    <tr
                      key={caso.id}
                      onClick={() => setCasoSeleccionado(caso.id)}
                      style={{
                        borderBottom: '1px solid #1e293b',
                        background: seleccionado ? 'rgba(56, 189, 248, 0.12)' : '#090d16',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '0.6rem 0.75rem', fontWeight: 700, color: '#f8fafc' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <div
                            style={{
                              padding: '0.25rem',
                              borderRadius: '4px',
                              background: caso.bgBadge,
                              border: `1px solid ${caso.bordeBadge}`,
                              color: caso.color,
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <Icono size={14} />
                          </div>
                          <div>
                            <div style={{ color: seleccionado ? '#38bdf8' : '#f8fafc' }}>{caso.titulo}</div>
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{caso.subtitulo}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '0.6rem 0.75rem', color: '#cbd5e1', fontFamily: 'sans-serif' }}>
                        {caso.condicionSubida}
                      </td>
                      <td style={{ padding: '0.6rem 0.75rem' }}>
                        <span
                          style={{
                            fontSize: '0.66rem',
                            padding: '2px 7px',
                            borderRadius: '8px',
                            fontWeight: 700,
                            background: caso.bgBadge,
                            color: caso.color,
                            border: `1px solid ${caso.bordeBadge}`,
                            display: 'inline-block',
                          }}
                        >
                          {caso.medidorComunico}
                        </span>
                      </td>
                      <td style={{ padding: '0.6rem 0.75rem', fontWeight: 700, color: caso.id === 'cero_amperios' || caso.id === 'corte_real' ? '#38bdf8' : '#34d399' }}>
                        {caso.tratamientoFactura}
                      </td>
                      <td style={{ padding: '0.6rem 0.75rem', color: '#cbd5e1', fontSize: '0.68rem' }}>
                        {caso.impactoFactura}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* FICHA DETALLADA DEL TRATAMIENTO SELECCIONADO */}
          <div
            style={{
              background: '#040d1a',
              border: `1.5px solid ${detalleActivo.color}`,
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '0.45rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  style={{
                    background: detalleActivo.bgBadge,
                    border: `1px solid ${detalleActivo.bordeBadge}`,
                    color: detalleActivo.color,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '0.70rem',
                    fontWeight: 800,
                  }}
                >
                  Detalle del Caso #{detalleActivo.numero}: {detalleActivo.titulo}
                </span>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                  {detalleActivo.subtitulo}
                </span>
              </div>
              <span style={{ fontSize: '0.66rem', color: '#94a3b8', fontStyle: 'italic' }}>
                {detalleActivo.normativa}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem', fontSize: '0.73rem' }}>
              <div>
                <strong style={{ color: '#ffffff', display: 'block', marginBottom: '0.25rem' }}>
                  Fundamento Técnico y Operativo:
                </strong>
                <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.45 }}>
                  {detalleActivo.fundamentoTecnico}
                </p>
              </div>

              <div style={{ background: '#091322', borderRadius: '6px', padding: '0.6rem 0.75rem', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div>
                  <span style={{ color: '#94a3b8' }}>Comunicación de Red: </span>
                  <strong style={{ color: detalleActivo.color }}>{detalleActivo.detalleComunico}</strong>
                </div>
                <div>
                  <span style={{ color: '#94a3b8' }}>Regla de Liquidación: </span>
                  <strong style={{ color: '#ffffff' }}>{detalleActivo.tratamientoFactura}</strong>
                </div>
                <div>
                  <span style={{ color: '#94a3b8' }}>Efecto en Recibo: </span>
                  <strong style={{ color: '#a7f3d0' }}>{detalleActivo.impactoFactura}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Estadísticas de la Factura Actual */}
          {metricas && (
            <div
              style={{
                background: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '0.65rem 0.85rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '0.65rem',
                fontSize: '0.72rem',
              }}
            >
              <div>
                <span style={{ color: '#94a3b8' }}>Lecturas Protegidas en 0A (No Engloban):</span>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace' }}>
                  {metricas.intervalosCeroAmperios || 0} intervalos
                </div>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>Fallas Reales de Telemetría (Imputables):</span>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f87171', fontFamily: 'monospace' }}>
                  {metricas.huecosPerdidaSenal || 0} eventos
                </div>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>Cortes Reales Normativos (0 Legal):</span>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ef4444', fontFamily: 'monospace' }}>
                  {metricas.huecosCorteReal || 0} cortes
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pie de Modal con Botón de Cierre */}
        <div
          style={{
            padding: '0.75rem 1.25rem',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'flex-end',
            background: '#0f172a',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              border: '1px solid #38bdf8',
              borderRadius: '6px',
              color: '#ffffff',
              padding: '0.4rem 1.25rem',
              fontSize: '0.75rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <CheckCircle2 size={15} />
            <span>Entendido / Cerrar Ventana</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalCriteriosIdentificacionDatos;
