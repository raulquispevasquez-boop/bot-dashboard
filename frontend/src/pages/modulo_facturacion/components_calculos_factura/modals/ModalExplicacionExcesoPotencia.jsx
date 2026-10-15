import React from 'react';
import { X, HelpCircle, AlertTriangle, ShieldCheck, Clock, CheckCircle2, DollarSign } from 'lucide-react';

const formatearNumero = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || isNaN(valor)) return '0.00';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

const ModalExplicacionExcesoPotencia = ({ isOpen, onClose, dataCalculo }) => {
  if (!isOpen || !dataCalculo) return null;

  const {
    contratadaHP_KW,
    contratadaHFP_KW,
    toleranciaPct,
    limiteHP_KW,
    limiteHFP_KW,
    maxHP,
    maxHFP,
    excesoHP_KW,
    excesoHFP_KW,
    excesoTotal_KW,
    precioHP_KW,
    precioHFP_KW,
    costoHP_USD,
    costoHFP_USD,
    costoTotal_USD,
    costoTotal_PEN,
    tipoCambio,
    nombreFuente,
    aplicaCriterio,
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
        background: 'rgba(0, 0, 0, 0.75)',
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
          border: '1px solid rgba(244, 63, 94, 0.4)',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(244, 63, 94, 0.2)',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        {/* Header del Modal */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.15) 0%, rgba(15, 23, 42, 0.8) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: 'rgba(244, 63, 94, 0.25)',
                border: '1px solid rgba(244, 63, 94, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f43f5e',
              }}
            >
              <HelpCircle size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc' }}>
                Metodología: Cálculo de Exceso de Potencia
              </h3>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>
                Normativa COES / Osinergmin y contratos PPA de Clientes Libres
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '0.35rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div style={{ padding: '1.15rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.8rem' }}>
          {/* 1. Fórmula Regulatoria */}
          <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.75rem 0.95rem' }}>
            <div style={{ fontSize: '0.72rem', color: '#fda4af', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.35rem' }}>
              Fórmula Contractual
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#f43f5e', background: 'rgba(244, 63, 94, 0.08)', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid rgba(244, 63, 94, 0.25)' }}>
              Exceso (kW) = Max( 0, Demanda Máxima Registrada − [Potencia Contratada × (1 + Tolerancia%)] )
            </div>
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '0.4rem 0 0 0' }}>
              Si la demanda real no supera la potencia contratada más el margen de tolerancia, el exceso es <strong>0.00 kW</strong> y no se factura penalidad ($0.00).
            </p>
          </div>

          {/* 2. Paso a Paso con Datos Reales */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <ShieldCheck size={14} color="#10b981" />
              <span>Ejemplo Numérico en Vivo ({nombreFuente})</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
              {/* Horas Punta */}
              <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '0.65rem 0.8rem' }}>
                <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                  ⚡ Horas Punta (HP: 18:00 - 23:00)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.73rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                    <span>Pico Registrado:</span>
                    <strong>{formatearNumero(maxHP.potenciaKW, 2)} kW</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                    <span>Contratada HP:</span>
                    <span>{formatearNumero(contratadaHP_KW, 2)} kW</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                    <span>Tolerancia ({toleranciaPct}%):</span>
                    <span>+{formatearNumero(limiteHP_KW - contratadaHP_KW, 2)} kW</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fde68a', borderTop: '1px dashed rgba(245, 158, 11, 0.25)', paddingTop: '0.25rem' }}>
                    <span>Límite Permitido:</span>
                    <strong>{formatearNumero(limiteHP_KW, 2)} kW</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: excesoHP_KW > 0 ? '#f87171' : '#34d399', fontWeight: 800, borderTop: '1px solid rgba(245, 158, 11, 0.3)', paddingTop: '0.25rem' }}>
                    <span>Exceso Liquidado:</span>
                    <span>{formatearNumero(excesoHP_KW, 2)} kW</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fcd34d' }}>
                    <span>Costo HP (${precioHP_KW}/kW):</span>
                    <strong>$ {formatearNumero(costoHP_USD, 2)} USD</strong>
                  </div>
                </div>
              </div>

              {/* Horas Fuera de Punta */}
              <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '8px', padding: '0.65rem 0.8rem' }}>
                <div style={{ color: '#38bdf8', fontWeight: 800, fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                  ⏱️ Fuera de Punta (HFP)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.73rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                    <span>Pico Registrado:</span>
                    <strong>{formatearNumero(maxHFP.potenciaKW, 2)} kW</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                    <span>Contratada HFP:</span>
                    <span>{formatearNumero(contratadaHFP_KW, 2)} kW</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                    <span>Tolerancia ({toleranciaPct}%):</span>
                    <span>+{formatearNumero(limiteHFP_KW - contratadaHFP_KW, 2)} kW</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#bae6fd', borderTop: '1px dashed rgba(56, 189, 248, 0.25)', paddingTop: '0.25rem' }}>
                    <span>Límite Permitido:</span>
                    <strong>{formatearNumero(limiteHFP_KW, 2)} kW</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: excesoHFP_KW > 0 ? '#f87171' : '#34d399', fontWeight: 800, borderTop: '1px solid rgba(56, 189, 248, 0.3)', paddingTop: '0.25rem' }}>
                    <span>Exceso Liquidado:</span>
                    <span>{formatearNumero(excesoHFP_KW, 2)} kW</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7dd3fc' }}>
                    <span>Costo HFP (${precioHFP_KW}/kW):</span>
                    <strong>$ {formatearNumero(costoHFP_USD, 2)} USD</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Liquidación Total Final */}
          <div style={{ background: '#090d16', border: '1px solid #334155', borderRadius: '8px', padding: '0.75rem 0.95rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Costo Total por Exceso de Potencia (Sin IGV):</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: costoTotal_USD > 0 ? '#fda4af' : '#6ee7b7' }}>
                $ {formatearNumero(costoTotal_USD, 2)} <span style={{ fontSize: '0.75rem' }}>USD</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Equivalente en Soles (TC {tipoCambio}):</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>
                S/. {formatearNumero(costoTotal_PEN, 2)} <span style={{ fontSize: '0.75rem' }}>PEN</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer del Modal */}
        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #1e293b', background: '#0a0f1d', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '7px',
              color: '#f8fafc',
              padding: '0.45rem 1.2rem',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
            }}
          >
            Entendido / Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalExplicacionExcesoPotencia;
