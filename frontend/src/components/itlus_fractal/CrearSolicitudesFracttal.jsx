import React, { useState } from 'react';
import TablaManual from './components/TablaManual';
import CargaMasiva from './components/CargaMasiva';
import ModalConfigurarPlantilla from './components/ModalConfigurarPlantilla';

// Creación de Solicitudes de Servicio en Fracttal desde Itlus Fractal:
// manual (tabla) y masiva (Excel). Reutiliza los endpoints
// /api/itlus-fractal/* (backend/server.js), que a su vez reutilizan la
// integración Fracttal ya probada en pme_common.py.
//
// El CECO no se pide aparte: se resuelve buscando y eligiendo el Activo en
// 2 pasos (Localización -> Equipo, columnas separadas: ver
// components/PasoUbicacion.jsx y components/PasoEquipoMaestro.jsx), igual
// que la UI real de Fracttal. Los adjuntos (imagen/PDF) quedan fuera de
// esta primera versión — pendiente de capturar el curl real de Fracttal.
//
// El estado de las filas de la tabla manual vive ACÁ (no dentro de
// TablaManual) porque CargaMasiva también necesita poder agregar una fila
// (botón "Corregir arriba" para resolver a mano una fila ambigua del
// Excel) — es estado compartido entre los dos hermanos.

const STORAGE_KEY_DEFAULTS = 'itlus_fracttal_defaults_plantilla';

const obtenerDefaultsGuardados = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEFAULTS);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    solicitadoPor: '',
    email: '',
    referencia: '',
  };
};

let contadorFilas = 0;
const filaVacia = (prellenado = {}, defaultVals = {}) => ({
  key: ++contadorFilas,
  descripcion: '',
  activoElegido: null,
  fechaIncidente: '',
  solicitadoPor: defaultVals.solicitadoPor || '',
  email: defaultVals.email || '',
  referencia: defaultVals.referencia || '',
  estado: null,
  ...prellenado,
});

const CrearSolicitudesFracttal = () => {
  const [defaults, setDefaults] = useState(obtenerDefaultsGuardados);
  const [modalConfigAbierto, setModalConfigAbierto] = useState(false);
  const [filas, setFilas] = useState([filaVacia({}, obtenerDefaultsGuardados())]);

  const actualizarFila = (key, cambios) => setFilas((prev) => prev.map((f) => (f.key === key ? { ...f, ...cambios } : f)));
  
  const agregarFila = (prellenado) => setFilas((prev) => [...prev, filaVacia(prellenado, defaults)]);
  
  const quitarFila = (key) => setFilas((prev) => (prev.length > 1 ? prev.filter((f) => f.key !== key) : prev));

  const guardarYAplicarDefaults = (nuevosDefaults) => {
    setDefaults(nuevosDefaults);
    try {
      localStorage.setItem(STORAGE_KEY_DEFAULTS, JSON.stringify(nuevosDefaults));
    } catch (e) {}

    // Aplicar los nuevos valores por defecto a todas las filas actuales en la tabla
    setFilas((prev) =>
      prev.map((f) => ({
        ...f,
        solicitadoPor: nuevosDefaults.solicitadoPor,
        email: nuevosDefaults.email,
        referencia: nuevosDefaults.referencia,
      }))
    );
  };

  const corregirEnTablaManual = (filaExcel) => {
    agregarFila({
      descripcion: filaExcel.descripcion !== '—' ? (filaExcel.descripcion || '') : '',
      solicitadoPor: filaExcel.solicitado_por || defaults.solicitadoPor || '',
      email: filaExcel.email || defaults.email || '',
      referencia: filaExcel.referencia || defaults.referencia || '',
      fechaIncidente: filaExcel.fecha_incidente || '',
      sedeCecoInicial: filaExcel.sede_ceco || '',
    });
    document.getElementById('itlus-tabla-manual')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <TablaManual
        filas={filas}
        actualizarFila={actualizarFila}
        agregarFila={agregarFila}
        quitarFila={quitarFila}
        onAbrirConfig={() => setModalConfigAbierto(true)}
        defaults={defaults}
      />
      <CargaMasiva onCorregir={corregirEnTablaManual} />

      <ModalConfigurarPlantilla
        isOpen={modalConfigAbierto}
        onClose={() => setModalConfigAbierto(false)}
        valoresActuales={defaults}
        onGuardar={guardarYAplicarDefaults}
      />
    </div>
  );
};

export default CrearSolicitudesFracttal;
