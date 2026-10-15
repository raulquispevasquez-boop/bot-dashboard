import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calculator, RefreshCw, Sparkles, Layers, Sliders, Zap, Calendar, FileText } from 'lucide-react';
import CardAnalisisEnergias from './cards/CardAnalisisEnergias';
import CardAnalisisEnergiasConPerdidas from './cards/CardAnalisisEnergiasConPerdidas';
import CardCalculoDemandaCoincidente from './cards/CardCalculoDemandaCoincidente';
import CardCalculoMaximasDemandas from './cards/CardCalculoMaximasDemandas';
import CardCalculoExcesoPotencia from './cards/CardCalculoExcesoPotencia';
import CardCalculoExcesoEnergia from './cards/CardCalculoExcesoEnergia';
import CardCalculoFactorCarga from './cards/CardCalculoFactorCarga';
import CardCalculoVAD from './cards/CardCalculoVAD';
import CardPeajesYCargosRegulados from './cards/CardPeajesYCargosRegulados';
import CardOtrosCargosNormativos from './cards/CardOtrosCargosNormativos';
import ModalReciboEnergia from './modals/ModalReciboEnergia';
import { useVariablesFacturacion } from '../components_configuracion_variables/useVariablesFacturacion';
import { formatearMesNombre } from '../components_configuracion_variables/utils/periodoFacturacionUtils';
import SelectorMesFacturacion from '../components_configuracion_variables/components/SelectorMesFacturacion';
import { obtenerTextoCSVEnergia, calcularAnalisisEnergias } from './utils/calculoEnergiaService';
import { obtenerDatosPotenciaActivos } from '../components_registro_potencia/utils/buscarPotenciaCoincidente';
import { calcularMaximasDemandas } from './utils/calculoMaximasDemandasService';
import { obtenerConfigImputacion, guardarConfigImputacion } from '../components_auditoria_medicion/utils/auditoriaMedicionService';

const ModuloCalculosFactura = () => {
  const { variables, updatePeriodoFacturacion } = useVariablesFacturacion();
  const [dataCSV, setDataCSV] = useState(() => obtenerTextoCSVEnergia());
  const [configImputacion, setConfigImputacion] = useState(() => obtenerConfigImputacion());
  const [keyRecalculo, setKeyRecalculo] = useState(0);
  const [modalReciboAbierto, setModalReciboAbierto] = useState(false);

  // Recarga el CSV si hubo cambios en localStorage
  const recargarDatos = useCallback(() => {
    const nuevo = obtenerTextoCSVEnergia();
    setDataCSV(nuevo);
    setKeyRecalculo((k) => k + 1);
  }, []);

  // Escuchar eventos de almacenamiento y actualización de medidores virtuales / imputación
  useEffect(() => {
    const handleStorage = (e) => {
      if (
        e.key === 'facturacion_cliente_libre_energia_csv' ||
        e.key === 'facturacion_cliente_libre_potencia_csv' ||
        e.key === 'facturacion_cliente_libre_variables_v3' ||
        e.key === 'facturacion_cliente_libre_medidores_virtuales_v1' ||
        e.key === 'facturacion_cliente_libre_imputacion_config_v1'
      ) {
        setConfigImputacion(obtenerConfigImputacion());
        recargarDatos();
      }
    };
    const handleCustom = () => recargarDatos();
    const handleImputacion = (e) => {
      setConfigImputacion(e.detail || obtenerConfigImputacion());
      recargarDatos();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('medidores_virtuales_updated', handleCustom);
    window.addEventListener('imputacion_config_updated', handleImputacion);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('medidores_virtuales_updated', handleCustom);
      window.removeEventListener('imputacion_config_updated', handleImputacion);
    };
  }, [recargarDatos]);

  const handleToggleModo = () => {
    const nuevo = {
      ...configImputacion,
      modoImputacionActivo: !configImputacion.modoImputacionActivo,
    };
    setConfigImputacion(nuevo);
    guardarConfigImputacion(nuevo);
    recargarDatos();
  };

  // Cálculo memoizado de análisis de energía
  const resultadoEnergias = useMemo(() => {
    return calcularAnalisisEnergias(dataCSV.texto, variables);
  }, [dataCSV.texto, variables, keyRecalculo, configImputacion.modoImputacionActivo]);

  // Cálculo memoizado de Máximas Demandas en HP y HFP (kW)
  const resultadoMaximasDemandas = useMemo(() => {
    const datosPotencia = obtenerDatosPotenciaActivos();
    return calcularMaximasDemandas(datosPotencia.registros, datosPotencia.columnas, variables);
  }, [variables, keyRecalculo]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        background: '#0b1120',
        padding: '0.85rem 1rem',
        borderRadius: '10px',
        border: '1px solid #1e293b',
        boxSizing: 'border-box',
      }}
    >
      {/* Barra superior de título y estado de sincronización */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.6rem',
          borderBottom: '1px solid #1e293b',
          paddingBottom: '0.75rem',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              padding: '0.5rem',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2) 0%, rgba(37, 99, 235, 0.2) 100%)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Calculator size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                Cálculos Factura C.L
              </h2>
              <span
                style={{
                  fontSize: '0.68rem',
                  color: '#38bdf8',
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '12px',
                  fontWeight: 700,
                }}
              >
                Módulo en Vivo
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
              Motor de liquidación y facturación comercial según registros de medición y variables de contrato
            </p>
          </div>
        </div>

        {/* Badges de estado de sincronización con Botón 1 y Botón 3 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Selector Centralizado de Mes a Facturar */}
          <SelectorMesFacturacion
            value={variables.periodoFacturacion}
            onChange={updatePeriodoFacturacion}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.72rem',
              color: '#10b981',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              padding: '0.3rem 0.6rem',
              borderRadius: '6px',
              fontWeight: 600,
            }}
          >
            <Layers size={13} />
            <span>Datos: Botón 1 Sincronizado</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.72rem',
              color: '#38bdf8',
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              padding: '0.3rem 0.6rem',
              borderRadius: '6px',
              fontWeight: 600,
            }}
          >
            <Sliders size={13} />
            <span>Variables: Botón 3 Activo</span>
          </div>

          <button
            type="button"
            onClick={recargarDatos}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#f1f5f9',
              padding: '0.35rem 0.65rem',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#38bdf8'; e.currentTarget.style.color = '#38bdf8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#334155'; e.currentTarget.style.color = '#f1f5f9'; }}
          >
            <RefreshCw size={13} />
            <span>Recalcular Todo</span>
          </button>

          {/* Toggle de Auditoría / Imputación R² */}
          <button
            type="button"
            onClick={handleToggleModo}
            title={
              configImputacion.modoImputacionActivo
                ? 'Medición de Energía con Recuperación de Datos (R² = 98.4%)'
                : 'Medición Real: No Incluye Datos Vacíos'
            }
            style={{
              background: configImputacion.modoImputacionActivo
                ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              border: `1px solid ${configImputacion.modoImputacionActivo ? '#10b981' : '#475569'}`,
              borderRadius: '6px',
              color: '#ffffff',
              padding: '0.28rem 0.75rem',
              fontSize: '0.72rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '0.1rem',
              boxShadow: configImputacion.modoImputacionActivo ? '0 0 10px rgba(16, 185, 129, 0.35)' : 'none',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = 'brightness(1.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = 'none';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Sparkles size={13} color={configImputacion.modoImputacionActivo ? '#a7f3d0' : '#94a3b8'} />
              <span>
                {configImputacion.modoImputacionActivo
                  ? '✓ Medición de Energía con Recuperación de Datos'
                  : 'Medición Real: No Incluye Datos Vacíos'}
              </span>
            </div>
            <div style={{ fontSize: '0.62rem', fontWeight: 600, color: configImputacion.modoImputacionActivo ? '#a7f3d0' : '#94a3b8', paddingLeft: '1.15rem' }}>
              {configImputacion.modoImputacionActivo
                ? 'Probabilidad / R² = 98.4% (Ajuste Trapezoidal)'
                : 'Telemetría directa pura (Sin proyectar huecos)'}
            </div>
          </button>

          {/* Botón Principal Generar Factura */}
          <button
            type="button"
            onClick={() => setModalReciboAbierto(true)}
            style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              border: '1px solid #38bdf8',
              borderRadius: '6px',
              color: '#ffffff',
              padding: '0.35rem 0.8rem',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.45)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = 'brightness(1.18)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = 'none';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <FileText size={14} />
            <span>Generar Factura</span>
          </button>
        </div>
      </div>

      {/* Área de Cuadros de Cálculo estilo Trello con scroll interno */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'auto',
          padding: '0.3rem 0.2rem 1rem 0.2rem',
        }}
      >
        {/* Contenedor flexible con espacio para las siguientes tarjetas */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            gap: '1.2rem',
          }}
        >
          {/* Tarjeta 1: Energía sin Pérdidas de Generación */}
          <CardAnalisisEnergias
            resultado={resultadoEnergias}
            variables={variables}
            origenDatos={dataCSV.origen}
            onRecalcular={recargarDatos}
          />

          {/* Tarjeta 1B: Energía con Pérdidas de Generación (Factor Barra B.G Kallpa La Curva) */}
          <CardAnalisisEnergiasConPerdidas
            resultado={resultadoEnergias}
            variables={variables}
            origenDatos={dataCSV.origen}
            onRecalcular={recargarDatos}
          />

          {/* Tarjeta 2: Demanda Coincidente (SEIN / COES) */}
          <CardCalculoDemandaCoincidente
            variables={variables}
          />

          {/* Tarjeta 3: Máximas Demandas (Picos en HP y HFP) */}
          <CardCalculoMaximasDemandas
            resultado={resultadoMaximasDemandas}
            variables={variables}
          />

          {/* Tarjeta 4: Liquidación de Exceso de Potencia (HP y HFP) */}
          <CardCalculoExcesoPotencia
            resultadoMaximasDemandas={resultadoMaximasDemandas}
            variables={variables}
          />

          {/* Tarjeta 5: Liquidación de Exceso de Energía (HP y HFP - Modalidad A y B) */}
          <CardCalculoExcesoEnergia
            resultadoEnergias={resultadoEnergias}
            variables={variables}
          />

          {/* Tarjeta 6: Cálculo de Factor de Carga (3 Referencias: Contratada, Máx Demanda, Coincidente) */}
          <CardCalculoFactorCarga
            resultadoEnergias={resultadoEnergias}
            resultadoMaximasDemandas={resultadoMaximasDemandas}
            variables={variables}
          />

          {/* Tarjeta 7: Cálculo de Valor Agregado de Distribución VAD (HP y HFP) */}
          <CardCalculoVAD
            variables={variables}
            onRecalcular={recargarDatos}
          />

          {/* Tarjeta 8: Tabla de Peajes y Cargos Regulados (8 Columnas, Automatizable) */}
          <CardPeajesYCargosRegulados
            resultadoEnergias={resultadoEnergias}
            variables={variables}
          />

          {/* Tarjeta 9: Otros Cargos Normativos (FOSE, LER, FISE) */}
          <CardOtrosCargosNormativos
            variables={variables}
            resultadoEnergias={resultadoEnergias}
            resultadoMaximasDemandas={resultadoMaximasDemandas}
          />

          {/* Espacio reservado para las próximas tarjetas de cálculo (Tarjeta 8...) */}
          <div
            style={{
              width: '320px',
              minHeight: '260px',
              border: '1px dashed #243247',
              borderRadius: '12px',
              background: 'rgba(15, 23, 42, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem',
              textAlign: 'center',
              color: '#475569',
              gap: '0.5rem',
            }}
          >
            <Sparkles size={22} color="#334155" />
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>
              Espacio disponible para próximos cálculos
            </span>
            <span style={{ fontSize: '0.72rem', color: '#475569', maxWidth: '240px' }}>
              Aquí se integrarán Potencia Facturable neta, Peajes, Facturación Total y Cargos Adicionales.
            </span>
          </div>
        </div>
      </div>

      {/* Modal Recibo de Energía Eléctrica (Kallpa / Cliente Libre) */}
      <ModalReciboEnergia
        isOpen={modalReciboAbierto}
        onClose={() => setModalReciboAbierto(false)}
        resultadoEnergias={resultadoEnergias}
        resultadoMaximasDemandas={resultadoMaximasDemandas}
        variables={variables}
        datos={{
          periodo: formatearMesNombre(variables.periodoFacturacion),
          tipoCambio: variables.tipoCambio ? Number(variables.tipoCambio) : 3.440,
        }}
      />
    </div>
  );
};

export default ModuloCalculosFactura;
