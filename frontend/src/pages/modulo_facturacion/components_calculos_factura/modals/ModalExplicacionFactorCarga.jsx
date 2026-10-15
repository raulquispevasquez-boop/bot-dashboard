import React, { useState } from 'react';
import { X, HelpCircle, Activity, CheckCircle2, TrendingUp, Target, Award, Info, BarChart3 } from 'lucide-react';

const formatearNumero = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || isNaN(valor)) return '0.00';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

const ModalExplicacionFactorCarga = ({ isOpen, onClose, dataCalculo }) => {
  const [tabEjemplo, setTabEjemplo] = useState('cliente'); // 'cliente' | 'kallpa_referencia'

  if (!isOpen || !dataCalculo) return null;

  const {
    aliasCircuito,
    eMesKWh,
    eMesMWh,
    horasMes,
    refContratada,
    refMaximaDemanda,
    refCoincidente,
  } = dataCalculo;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0d1527',
          border: '1px solid rgba(6, 182, 212, 0.4)',
          borderRadius: '14px',
          width: '780px',
          maxWidth: '96vw',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(6, 182, 212, 0.15)',
          overflow: 'hidden',
        }}
      >
        {/* Cabecera del Modal */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.12) 0%, rgba(13, 21, 39, 0.9) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                padding: '0.45rem',
                borderRadius: '8px',
                background: 'rgba(6, 182, 212, 0.2)',
                color: '#22d3ee',
                border: '1px solid rgba(6, 182, 212, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Activity size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                Metodología de Cálculo: Factor de Carga (FC)
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                Definición técnica, las 3 potencias de referencia y su significado y uso práctico
              </span>
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
              padding: '0.35rem',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = '#1e293b'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent'; }}
          >
            <X size={19} />
          </button>
        </div>

        {/* Cuerpo con Scroll */}
        <div
          style={{
            padding: '1.15rem 1.25rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            color: '#cbd5e1',
            fontSize: '0.82rem',
            lineHeight: 1.5,
          }}
        >
          {/* 1. Definición Teórica */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid #1e293b',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.45rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#22d3ee', fontWeight: 700, fontSize: '0.85rem' }}>
              <Info size={15} />
              <span>Factor de Carga: Definición Fundamental</span>
            </div>

            <div
              style={{
                background: '#090d16',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                padding: '0.6rem 0.85rem',
                borderRadius: '8px',
                fontFamily: 'monospace',
                fontSize: '0.88rem',
                color: '#67e8f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontWeight: 700,
              }}
            >
              FC = E_mes / (P_ref × h_mes)
            </div>

            <p style={{ margin: 0, fontSize: '0.78rem', color: '#cbd5e1' }}>
              Mide la <strong>relación entre la energía consumida</strong> y la <strong>energía máxima que podrías haber consumido</strong> si hubieras operado todo el mes al 100% de la potencia de referencia. En la práctica del mercado libre peruano (normativa COES y Osinergmin) se usan <strong>tres referencias</strong>, y cada una responde a una pregunta distinta:
            </p>
          </div>

          {/* Selector de Pestañas para Ver: Caso Real del Cliente vs Caso Didáctico de Referencia */}
          <div style={{ display: 'flex', gap: '0.4rem', background: '#090d16', padding: '4px', borderRadius: '8px', border: '1px solid #1e293b' }}>
            <button
              type="button"
              onClick={() => setTabEjemplo('cliente')}
              style={{
                flex: 1,
                padding: '0.4rem 0.6rem',
                borderRadius: '6px',
                border: 'none',
                background: tabEjemplo === 'cliente' ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.25) 0%, rgba(14, 116, 144, 0.3) 100%)' : 'transparent',
                color: tabEjemplo === 'cliente' ? '#67e8f9' : '#94a3b8',
                fontWeight: tabEjemplo === 'cliente' ? 700 : 500,
                fontSize: '0.74rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
              }}
            >
              <BarChart3 size={13} />
              <span>1. Datos Reales del Cliente ({aliasCircuito} - Agosto 2026)</span>
            </button>

            <button
              type="button"
              onClick={() => setTabEjemplo('kallpa_referencia')}
              style={{
                flex: 1,
                padding: '0.4rem 0.6rem',
                borderRadius: '6px',
                border: 'none',
                background: tabEjemplo === 'kallpa_referencia' ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(126, 34, 206, 0.3) 100%)' : 'transparent',
                color: tabEjemplo === 'kallpa_referencia' ? '#d8b4fe' : '#94a3b8',
                fontWeight: tabEjemplo === 'kallpa_referencia' ? 700 : 500,
                fontSize: '0.74rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
              }}
            >
              <Award size={13} />
              <span>2. Ejemplo Didáctico de Referencia (Kallpa / Mercado)</span>
            </button>
          </div>

          {/* Tabla Comparativa de las 3 Referencias */}
          <div
            style={{
              background: '#090d16',
              border: '1px solid #1e293b',
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ background: '#131d33', borderBottom: '1px solid #1e293b', textAlign: 'left', color: '#94a3b8' }}>
                  <th style={{ padding: '0.55rem 0.75rem', fontWeight: 700 }}>Referencia (P_ref)</th>
                  <th style={{ padding: '0.55rem 0.75rem', fontWeight: 700 }}>
                    {tabEjemplo === 'cliente' ? `Agosto (${horasMes} h)` : 'Agosto (744 h)'}
                  </th>
                  <th style={{ padding: '0.55rem 0.75rem', fontWeight: 700, textAlign: 'center' }}>FC</th>
                  <th style={{ padding: '0.55rem 0.75rem', fontWeight: 700 }}>Significado y Uso Práctico</th>
                </tr>
              </thead>
              <tbody>
                {tabEjemplo === 'cliente' ? (
                  <>
                    {/* Fila 1: Potencia Contratada Cliente */}
                    <tr style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#f8fafc' }}>
                        <div>Potencia contratada</div>
                        <div style={{ fontSize: '0.68rem', color: '#22d3ee' }}>({refContratada?.potenciaEtiqueta})</div>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: 'monospace', color: '#cbd5e1' }}>
                        {refContratada?.ratioTexto}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#22d3ee' }}>
                          {refContratada?.fcDecimal}
                        </span>
                        <div style={{ fontSize: '0.65rem', color: '#67e8f9' }}>({refContratada?.fcPorcentaje}%)</div>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', color: '#94a3b8' }}>
                        <strong style={{ color: '#cbd5e1' }}>Aprovechamiento del contrato:</strong> {refContratada?.uso}
                      </td>
                    </tr>

                    {/* Fila 2: Máxima Demanda Mes Cliente */}
                    <tr style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#f8fafc' }}>
                        <div>Máxima demanda del mes</div>
                        <div style={{ fontSize: '0.68rem', color: '#a855f7' }}>({refMaximaDemanda?.potenciaEtiqueta})</div>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: 'monospace', color: '#cbd5e1' }}>
                        {refMaximaDemanda?.ratioTexto}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#c084fc' }}>
                          {refMaximaDemanda?.fcDecimal}
                        </span>
                        <div style={{ fontSize: '0.65rem', color: '#d8b4fe' }}>({refMaximaDemanda?.fcPorcentaje}%)</div>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', color: '#94a3b8' }}>
                        <strong style={{ color: '#cbd5e1' }}>Forma de la curva de carga:</strong> {refMaximaDemanda?.uso}
                      </td>
                    </tr>

                    {/* Fila 3: Demanda Coincidente Cliente */}
                    <tr>
                      <td style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#f8fafc' }}>
                        <div>Demanda coincidente</div>
                        <div style={{ fontSize: '0.68rem', color: '#f59e0b' }}>({refCoincidente?.potenciaEtiqueta})</div>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: 'monospace', color: '#cbd5e1' }}>
                        {refCoincidente?.ratioTexto}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#fbbf24' }}>
                          {refCoincidente?.fcDecimal}
                        </span>
                        <div style={{ fontSize: '0.65rem', color: '#fde68a' }}>({refCoincidente?.fcPorcentaje}%)</div>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', color: '#94a3b8' }}>
                        <strong style={{ color: '#cbd5e1' }}>Peaje principal:</strong> {refCoincidente?.uso}
                      </td>
                    </tr>
                  </>
                ) : (
                  <>
                    {/* Ejemplo Referencia Imagen */}
                    <tr style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#f8fafc' }}>
                        <div>Potencia contratada</div>
                        <div style={{ fontSize: '0.68rem', color: '#22d3ee' }}>(2.500 kW)</div>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: 'monospace', color: '#cbd5e1' }}>
                        575,413 / 1,860,000
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#22d3ee' }}>0.31</span>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', color: '#94a3b8' }}>
                        Aprovechamiento del contrato; es el valor que imprime Kallpa
                      </td>
                    </tr>

                    <tr style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#f8fafc' }}>
                        <div>Máxima demanda del mes</div>
                        <div style={{ fontSize: '0.68rem', color: '#a855f7' }}>(~1.135 kW)</div>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: 'monospace', color: '#cbd5e1' }}>
                        575,413 / 844,344
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#c084fc' }}>0.68</span>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', color: '#94a3b8' }}>
                        Forma de la curva de carga
                      </td>
                    </tr>

                    <tr>
                      <td style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#f8fafc' }}>
                        <div>Demanda coincidente</div>
                        <div style={{ fontSize: '0.68rem', color: '#f59e0b' }}>(1.056 kW)</div>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: 'monospace', color: '#cbd5e1' }}>
                        575,413 / 785,664
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fbbf24' }}>0.73</span>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', color: '#94a3b8' }}>
                        Relación entre tu consumo y la demanda que paga el peaje principal
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* 3. Desglose Detallado del Significado y Uso Práctico */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.88rem', color: '#f8fafc', fontWeight: 700 }}>
              Detalle en Profundidad: Significado y Uso Práctico
            </h4>

            {/* Referencia 1 */}
            <div style={{ background: 'rgba(6, 182, 212, 0.06)', border: '1px solid rgba(6, 182, 212, 0.25)', borderRadius: '8px', padding: '0.7rem 0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#22d3ee', fontWeight: 700, fontSize: '0.8rem' }}>
                <Target size={14} />
                <span>1. FC sobre Potencia Contratada (Eficiencia Comercial de Contratación)</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.3rem' }}>
                <strong>Significado:</strong> Compara la energía que consumiste versus lo que pagarías como derecho de capacidad fija en tu recibo eléctrico.
              </div>
              <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                <strong>Uso Práctico:</strong> Si tu FC de contrato es muy bajo (ej. 0.31), significa que tienes contratada una potencia excesiva que no utilizas. Permite justificar una <strong>reducción o ajuste de potencia contratada</strong> en la siguiente negociación con tu suministrador (Kallpa, Enel, Engie) para disminuir costos fijos.
              </div>
            </div>

            {/* Referencia 2 */}
            <div style={{ background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.25)', borderRadius: '8px', padding: '0.7rem 0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#c084fc', fontWeight: 700, fontSize: '0.8rem' }}>
                <TrendingUp size={14} />
                <span>2. FC sobre Máxima Demanda del Mes (Eficiencia de Curva Interna)</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.3rem' }}>
                <strong>Significado:</strong> Indica qué tan "plano" es el perfil de consumo de la planta respecto a su propio pico máximo registrado en el mes.
              </div>
              <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                <strong>Uso Práctico:</strong> Un FC cercano a 1.0 (ej. 0.80+) demuestra que la planta opera en turnos homogéneos y estables. Un FC bajo (ej. 0.40) delata <strong>picos de arranque o acumulación innecesaria de maquinaria</strong>, alertando a mantenimiento y operaciones para distribuir cargas y aplanar la curva.
              </div>
            </div>

            {/* Referencia 3 */}
            <div style={{ background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '8px', padding: '0.7rem 0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#fbbf24', fontWeight: 700, fontSize: '0.8rem' }}>
                <Activity size={14} />
                <span>3. FC sobre Demanda Coincidente (Optimización de Peajes de Transmisión SEIN)</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.3rem' }}>
                <strong>Significado:</strong> Relaciona tu consumo total de energía mensual con la potencia que demandabas en el instante exacto del pico de máxima demanda nacional del COES.
              </div>
              <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                <strong>Uso Práctico:</strong> Los peajes del Sistema Principal y Garantizado de Transmisión (SPT/SGT) se liquidan sobre la potencia coincidente. Si este FC es más alto que el de máxima demanda, significa que <strong>modulaste o redujiste carga exitosamente en la punta del sistema</strong>, pagando una tarifa unitaria de peaje significativamente menor por cada MWh consumido.
              </div>
            </div>
          </div>
        </div>

        {/* Pie del Modal */}
        <div
          style={{
            padding: '0.75rem 1.25rem',
            borderTop: '1px solid #1e293b',
            background: '#090d16',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Fuente: Metodología comercial estándar Kallpa / Mercado Libre de Electricidad
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '7px',
              padding: '0.4rem 0.9rem',
              color: '#f8fafc',
              fontSize: '0.76rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Entendido y Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalExplicacionFactorCarga;
