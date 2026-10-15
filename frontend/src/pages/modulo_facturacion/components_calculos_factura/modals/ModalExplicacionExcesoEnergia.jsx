import React, { useState } from 'react';
import { X, HelpCircle, Flame, Layers, CheckCircle2, Sliders, Info, Zap } from 'lucide-react';

const formatearNumero = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || isNaN(valor)) return '0.00';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

const ModalExplicacionExcesoEnergia = ({
  isOpen,
  onClose,
  dataCalculo,
  modalidadSeleccionada = 'factor_carga',
  onCambiarModalidad,
}) => {
  const [tabActiva, setTabActiva] = useState(modalidadSeleccionada || 'factor_carga');

  if (!isOpen || !dataCalculo) return null;

  const {
    regHP_MWh,
    regHFP_MWh,
    regTotal_MWh,
    horasHP,
    horasHFP,
    precioHP_MWh,
    precioHFP_MWh,
    modalidadA,
    modalidadB,
    tipoCambio,
    nombreFuente,
  } = dataCalculo;

  const esModA = tabActiva === 'bloque_fijo';
  const dataModActiva = esModA ? modalidadA : modalidadB;

  const handleSeleccionarYAplicar = (modo) => {
    setTabActiva(modo);
    if (onCambiarModalidad) {
      onCambiarModalidad(modo);
    }
  };

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
          border: '1px solid rgba(217, 70, 239, 0.45)',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '720px',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(217, 70, 239, 0.2)',
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
            background: 'linear-gradient(135deg, rgba(217, 70, 239, 0.18) 0%, rgba(15, 23, 42, 0.85) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: 'rgba(217, 70, 239, 0.25)',
                border: '1px solid rgba(217, 70, 239, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#d946ef',
              }}
            >
              <Flame size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc' }}>
                Metodología: Cálculo de Exceso de Energía (HP y HFP)
              </h3>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>
                Comparativa detallada entre Modalidad A (Bloque) y Modalidad B (Factor de Carga)
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

        {/* Selector de Pestañas Interactivas: Modalidad A vs Modalidad B */}
        <div style={{ padding: '0.75rem 1.25rem 0 1.25rem', background: '#0a0f1d' }}>
          <div style={{ display: 'flex', gap: '0.5rem', background: '#070b14', padding: '4px', borderRadius: '8px', border: '1px solid #1e293b' }}>
            <button
              type="button"
              onClick={() => handleSeleccionarYAplicar('bloque_fijo')}
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                background: esModA ? 'rgba(217, 70, 239, 0.25)' : 'transparent',
                border: esModA ? '1px solid rgba(217, 70, 239, 0.5)' : '1px solid transparent',
                color: esModA ? '#f0abfc' : '#94a3b8',
                fontSize: '0.76rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                transition: 'all 0.15s ease',
              }}
            >
              <Layers size={14} />
              <span>Modalidad A: Bloque Asignado (MWh)</span>
            </button>

            <button
              type="button"
              onClick={() => handleSeleccionarYAplicar('factor_carga')}
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                background: !esModA ? 'rgba(217, 70, 239, 0.25)' : 'transparent',
                border: !esModA ? '1px solid rgba(217, 70, 239, 0.5)' : '1px solid transparent',
                color: !esModA ? '#f0abfc' : '#94a3b8',
                fontSize: '0.76rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                transition: 'all 0.15s ease',
              }}
            >
              <Sliders size={14} />
              <span>Modalidad B: Factor de Carga Objetivo (%)</span>
            </button>
          </div>
        </div>

        {/* Cuerpo del Modal */}
        <div style={{ padding: '1.15rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.8rem' }}>
          {/* Explicación de la modalidad seleccionada */}
          <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.75rem 0.95rem' }}>
            <div style={{ fontSize: '0.72rem', color: '#f0abfc', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.35rem' }}>
              {esModA ? 'Fórmula de Modalidad A (Bloque Asignado)' : 'Fórmula de Modalidad B (Factor de Carga Objetivo)'}
            </div>

            {esModA ? (
              <>
                <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#d946ef', background: 'rgba(217, 70, 239, 0.08)', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid rgba(217, 70, 239, 0.25)' }}>
                  ΔE (MWh) = Max( 0, Energía Registrada − Bloque Asignado )
                </div>
                <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '0.4rem 0 0 0' }}>
                  El contrato establece una cuota fija mensual (ej. <strong>{formatearNumero(modalidadA.bloqueTotalMWh, 2)} MWh</strong>). Todo MWh consumido por encima de esta cuota se cobra como energía en exceso a la tarifa pactada.
                </p>
              </>
            ) : (
              <>
                <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#d946ef', background: 'rgba(217, 70, 239, 0.08)', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid rgba(217, 70, 239, 0.25)' }}>
                  Energía Base (MWh) = [Potencia Contratada (kW) × Horas × Factor Carga Objetivo (%)] ÷ 1000
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#f0abfc', marginTop: '0.3rem' }}>
                  ΔE Exceso = Max( 0, Energía Registrada − Energía Base )
                </div>
                <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '0.4rem 0 0 0' }}>
                  Premia la eficiencia y modulación del cliente. La generadora suministra energía a precio base hasta un factor de utilización (ej. <strong>{modalidadB.factorCargaObjetivoPct}%</strong>). La energía fuera de modulación se liquida con tarifa de exceso.
                </p>
              </>
            )}
          </div>

          {/* Comparación Numérica en Vivo */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Zap size={14} color="#d946ef" />
                <span>Resultados de Liquidación en Vivo ({nombreFuente})</span>
              </span>
              <span style={{ fontSize: '0.68rem', color: '#f0abfc', background: 'rgba(217, 70, 239, 0.15)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                Total Registrado: {formatearNumero(regTotal_MWh, 3)} MWh
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
              {/* Horas Punta */}
              <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '0.65rem 0.8rem' }}>
                <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                  ⚡ Horas Punta ({horasHP} hrs)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.73rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                    <span>Energía Registrada:</span>
                    <strong>{formatearNumero(regHP_MWh, 3)} MWh</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                    <span>{esModA ? 'Bloque Cuota HP:' : 'Energía Base Tope HP:'}</span>
                    <span>{formatearNumero(esModA ? modalidadA.bloqueAsignadoHP_MWh : modalidadB.topeEnergiaHP_MWh, 3)} MWh</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: dataModActiva.excesoHP_MWh > 0 ? '#f87171' : '#34d399', fontWeight: 800, borderTop: '1px dashed rgba(245, 158, 11, 0.25)', paddingTop: '0.25rem' }}>
                    <span>Exceso Liquidado:</span>
                    <span>{formatearNumero(dataModActiva.excesoHP_MWh, 3)} MWh</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fcd34d' }}>
                    <span>Costo HP (${precioHP_MWh}/MWh):</span>
                    <strong>$ {formatearNumero(dataModActiva.costoHP_USD, 2)} USD</strong>
                  </div>
                </div>
              </div>

              {/* Horas Fuera de Punta */}
              <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '8px', padding: '0.65rem 0.8rem' }}>
                <div style={{ color: '#38bdf8', fontWeight: 800, fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                  ⏱️ Fuera de Punta ({horasHFP} hrs)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.73rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                    <span>Energía Registrada:</span>
                    <strong>{formatearNumero(regHFP_MWh, 3)} MWh</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                    <span>{esModA ? 'Bloque Cuota HFP:' : 'Energía Base Tope HFP:'}</span>
                    <span>{formatearNumero(esModA ? modalidadA.bloqueAsignadoHFP_MWh : modalidadB.topeEnergiaHFP_MWh, 3)} MWh</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: dataModActiva.excesoHFP_MWh > 0 ? '#f87171' : '#34d399', fontWeight: 800, borderTop: '1px dashed rgba(56, 189, 248, 0.25)', paddingTop: '0.25rem' }}>
                    <span>Exceso Liquidado:</span>
                    <span>{formatearNumero(dataModActiva.excesoHFP_MWh, 3)} MWh</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7dd3fc' }}>
                    <span>Costo HFP (${precioHFP_MWh}/MWh):</span>
                    <strong>$ {formatearNumero(dataModActiva.costoHFP_USD, 2)} USD</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Resumen Final de Costos */}
          <div style={{ background: '#090d16', border: '1px solid #334155', borderRadius: '8px', padding: '0.75rem 0.95rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                Costo Total Exceso Energía ({esModA ? 'Modalidad A: Bloque' : 'Modalidad B: Factor Carga'}):
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: dataModActiva.costoTotal_USD > 0 ? '#f0abfc' : '#6ee7b7' }}>
                $ {formatearNumero(dataModActiva.costoTotal_USD, 2)} <span style={{ fontSize: '0.75rem' }}>USD</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Equivalente en Soles (TC {tipoCambio}):</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>
                S/. {formatearNumero(dataModActiva.costoTotal_PEN, 2)} <span style={{ fontSize: '0.75rem' }}>PEN</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer del Modal */}
        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #1e293b', background: '#0a0f1d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
            Modalidad seleccionada: <strong style={{ color: '#f0abfc' }}>{esModA ? 'Bloque Fijo Asignado' : 'Factor de Carga Objetivo'}</strong>
          </span>

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
            Aceptar / Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalExplicacionExcesoEnergia;
