// Lista oficial de días no laborables, domingos y feriados nacionales del Perú (Ley 31530 y calendario oficial 2026)
// Las columnas requeridas son: Mes (1ª col), Fecha (2ª col), Descripción (3ª col)

export const FERIADOS_PERU_OFICIALES = [
  // Enero
  { id: 'dom-01', mes: 'Enero', fecha: '04/01, 11/01, 18/01, 25/01', descripcion: 'Domingos no laborables', tipo: 'Domingo', activo: true },
  { id: 'f-01', mes: 'Enero', fecha: '01/01/2026', descripcion: 'Año Nuevo', tipo: 'Feriado Nacional', activo: true },
  { id: 'nl-01', mes: 'Enero', fecha: '02/01/2026', descripcion: 'Día No Laborable Compensable', tipo: 'No Laborable', activo: true },

  // Febrero
  { id: 'dom-02', mes: 'Febrero', fecha: '01/02, 08/02, 15/02, 22/02', descripcion: 'Domingos no laborables', tipo: 'Domingo', activo: true },

  // Marzo
  { id: 'dom-03', mes: 'Marzo', fecha: '01/03, 08/03, 15/03, 22/03, 29/03', descripcion: 'Domingos no laborables', tipo: 'Domingo', activo: true },

  // Abril
  { id: 'dom-04', mes: 'Abril', fecha: '05/04, 12/04, 19/04, 26/04', descripcion: 'Domingos no laborables', tipo: 'Domingo', activo: true },
  { id: 'f-02', mes: 'Abril', fecha: '02/04/2026', descripcion: 'Jueves Santo (Semana Santa)', tipo: 'Feriado Nacional', activo: true },
  { id: 'f-03', mes: 'Abril', fecha: '03/04/2026', descripcion: 'Viernes Santo (Semana Santa)', tipo: 'Feriado Nacional', activo: true },
  { id: 'f-04', mes: 'Abril', fecha: '05/04/2026', descripcion: 'Domingo de Resurrección', tipo: 'Feriado Religioso', activo: true },

  // Mayo
  { id: 'dom-05', mes: 'Mayo', fecha: '03/05, 10/05, 17/05, 24/05, 31/05', descripcion: 'Domingos no laborables', tipo: 'Domingo', activo: true },
  { id: 'f-05', mes: 'Mayo', fecha: '01/05/2026', descripcion: 'Día del Trabajo', tipo: 'Feriado Nacional', activo: true },

  // Junio
  { id: 'dom-06', mes: 'Junio', fecha: '07/06, 14/06, 21/06, 28/06', descripcion: 'Domingos no laborables', tipo: 'Domingo', activo: true },
  { id: 'f-06', mes: 'Junio', fecha: '07/06/2026', descripcion: 'Batalla de Arica y Día de la Bandera', tipo: 'Feriado Nacional', activo: true },
  { id: 'f-07', mes: 'Junio', fecha: '29/06/2026', descripcion: 'Día de San Pedro y San Pablo', tipo: 'Feriado Nacional', activo: true },

  // Julio
  { id: 'dom-07', mes: 'Julio', fecha: '05/07, 12/07, 19/07, 26/07', descripcion: 'Domingos no laborables', tipo: 'Domingo', activo: true },
  { id: 'f-08', mes: 'Julio', fecha: '23/07/2026', descripcion: 'Día de la Fuerza Aérea del Perú', tipo: 'Feriado Nacional', activo: true },
  { id: 'nl-02', mes: 'Julio', fecha: '27/07/2026', descripcion: 'Día No Laborable Fiestas Patrias', tipo: 'No Laborable', activo: true },
  { id: 'f-09', mes: 'Julio', fecha: '28/07/2026', descripcion: 'Fiestas Patrias (Independencia del Perú)', tipo: 'Feriado Nacional', activo: true },
  { id: 'f-10', mes: 'Julio', fecha: '29/07/2026', descripcion: 'Fiestas Patrias (Gran Parada Militar)', tipo: 'Feriado Nacional', activo: true },

  // Agosto
  { id: 'dom-08', mes: 'Agosto', fecha: '02/08, 09/08, 16/08, 23/08, 30/08', descripcion: 'Domingos no laborables', tipo: 'Domingo', activo: true },
  { id: 'f-11', mes: 'Agosto', fecha: '06/08/2026', descripcion: 'Batalla de Junín', tipo: 'Feriado Nacional', activo: true },
  { id: 'f-12', mes: 'Agosto', fecha: '30/08/2026', descripcion: 'Santa Rosa de Lima', tipo: 'Feriado Nacional', activo: true },

  // Septiembre
  { id: 'dom-09', mes: 'Septiembre', fecha: '06/09, 13/09, 20/09, 27/09', descripcion: 'Domingos no laborables', tipo: 'Domingo', activo: true },

  // Octubre
  { id: 'dom-10', mes: 'Octubre', fecha: '04/10, 11/10, 18/10, 25/10', descripcion: 'Domingos no laborables', tipo: 'Domingo', activo: true },
  { id: 'f-13', mes: 'Octubre', fecha: '08/10/2026', descripcion: 'Combate de Angamos', tipo: 'Feriado Nacional', activo: true },
  { id: 'nl-03', mes: 'Octubre', fecha: '09/10/2026', descripcion: 'Día No Laborable Combate de Angamos', tipo: 'No Laborable', activo: true },

  // Noviembre
  { id: 'dom-11', mes: 'Noviembre', fecha: '01/11, 08/11, 15/11, 22/11, 29/11', descripcion: 'Domingos no laborables', tipo: 'Domingo', activo: true },
  { id: 'f-14', mes: 'Noviembre', fecha: '01/11/2026', descripcion: 'Día de Todos los Santos', tipo: 'Feriado Nacional', activo: true },

  // Diciembre
  { id: 'dom-12', mes: 'Diciembre', fecha: '06/12, 13/12, 20/12, 27/12', descripcion: 'Domingos no laborables', tipo: 'Domingo', activo: true },
  { id: 'f-15', mes: 'Diciembre', fecha: '08/12/2026', descripcion: 'Inmaculada Concepción', tipo: 'Feriado Nacional', activo: true },
  { id: 'f-16', mes: 'Diciembre', fecha: '09/12/2026', descripcion: 'Batalla de Ayacucho', tipo: 'Feriado Nacional', activo: true },
  { id: 'f-17', mes: 'Diciembre', fecha: '25/12/2026', descripcion: 'Navidad', tipo: 'Feriado Nacional', activo: true },
  { id: 'nl-04', mes: 'Diciembre', fecha: '26/12/2026', descripcion: 'Día No Laborable Navidad', tipo: 'No Laborable', activo: true },
];

export const MESES_DEL_ANIO = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];
