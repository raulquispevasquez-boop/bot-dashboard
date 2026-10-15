import React, { useState, useEffect } from 'react';
import { X, Key, User, Globe, Eye, EyeOff, Send, Mail, Bell } from 'lucide-react';

// Credenciales compartidas por toda la familia de bots PME (HVAC, Alumbrado, Frio, General...).
// Se guardan bajo el botId 'bot_pme_spsa' porque es el archivo de configuracion que
// todos los extractores de la familia PME leen para autenticarse y para enviar alertas.
const CREDENCIALES_BOT_ID = 'bot_pme_spsa';

const PLANTILLA_DEFAULT = '🔥 CONSUMO FUERA DE HORARIO [{servicio}]\nSede: {sede}\nFecha: {fecha}  Hora pico: {hora}\nConsumo pico: {valor} kWh (línea base: {linea_base} kWh)\nConsumo total en el rango: {total_kwh} kWh\nCosto estimado: S/ {costo} (S/ {precio_kwh} por kWh)\nRango vigilado: {hora_inicio} a {hora_fin}\n(Detalle hora por hora adjunto en Excel)';

// Cada tarjeta/bot de servicio PME tiene su propia alerta de consumo fuera de
// horario, configurable aqui de forma centralizada (a quien avisa cada uno).
const SERVICIOS = [
  { id: 'bot_pme_hvac', label: 'HVAC' },
  { id: 'bot_pme_iluminacion', label: 'Iluminación' },
  { id: 'bot_pme_frio_alimentario', label: 'Frío Alimentario' },
  { id: 'bot_pme_general', label: 'General' }
];

const alertaDefaultPara = (label) => ({
  activo: false, hora_inicio: '23:00', hora_fin: '06:00', linea_base_kwh: 1.0,
  precio_kwh: 0.0, adjuntar_excel: true, umbral_critico_soles_dia: 0.0, umbral_medio_soles_dia: 0.0,
  alertas_individuales_activo: false,
  destinatarios: '', copia: '', cuerpo_mensaje: PLANTILLA_DEFAULT,
  asunto: `Alerta Consumo fuera de horario - ${label}`,
  nombre_remitente: `Alertas ${label} PME`,
  descripcion_solicitud_servicio: `Se requiere revisar y configurar el encendido de los equipos de ${label} ya que existe operación fuera del horario de consumo. En caso de no existir un sistema de control de encendidos, se solicita cotizarlo.`,
  descripcion_solicitud_medidor: 'Se requiere revisar el medidor de energía {medidor_nombre} ya que no está enviando datos desde {ultima_fecha_con_datos}. Verificar conexión/comunicación del equipo; podría requerir mantenimiento o reemplazo.',
  // Señales especificas de cargas continuas 24/7 (ej. Frio Alimentario)
  maximo_kwh_dia: 0.0, maximo_kwh_hora: 0.0,
  ventana_baja_activo: false, ventana_baja_hora_inicio: '01:00', ventana_baja_hora_fin: '05:00', ventana_baja_linea_base_kwh: 0.0,
  linea_base_dinamica_activo: true, linea_base_dinamica_umbral_pct: 20.0
});

const inputStyle = { width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #475569', background: '#0f172a', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box' };
const labelStyle = { fontSize: '0.85rem', color: '#cbd5e1', display: 'block', marginBottom: '6px', fontWeight: 500 };
const smallLabelStyle = { fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' };
const smallInputStyle = { width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', boxSizing: 'border-box' };

const PmeCredencialesModal = ({ isOpen, onClose, socket }) => {
  const [config, setConfig] = useState({
    url: 'https://10.30.4.124/Web/Auth?ReturnUrl=%2fWeb%2f#Trends/',
    username: 'Supervisor',
    password: '',
    telegram_bot_token: '',
    telegram_chat_id: '',
    gmail_remitente: '',
    gmail_app_password: '',
    email_destinatario: '',
    email_copia: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showTelegramToken, setShowTelegramToken] = useState(false);
  const [showAppPassword, setShowAppPassword] = useState(false);

  const [configsServicio, setConfigsServicio] = useState(() =>
    Object.fromEntries(SERVICIOS.map(s => [s.id, { dias_historico: 7, agregacion: 'hora', alerta_consumo: alertaDefaultPara(s.label) }]))
  );
  const [servicioActivo, setServicioActivo] = useState(SERVICIOS[0].id);

  useEffect(() => {
    if (!socket || !isOpen) return;

    socket.emit('get_bot_config', CREDENCIALES_BOT_ID);
    SERVICIOS.forEach(s => socket.emit('get_bot_config', s.id));

    const handleConfig = (d) => {
      if (d.id === CREDENCIALES_BOT_ID && d.config) {
        setConfig(prev => ({ ...prev, ...d.config }));
        return;
      }
      const servicioMatch = SERVICIOS.find(s => s.id === d.id);
      if (servicioMatch && d.config) {
        setConfigsServicio(prev => ({
          ...prev,
          [d.id]: {
            ...prev[d.id],
            ...d.config,
            alerta_consumo: { ...alertaDefaultPara(servicioMatch.label), ...(d.config.alerta_consumo || {}) }
          }
        }));
      }
    };

    socket.on('bot_config', handleConfig);
    return () => socket.off('bot_config', handleConfig);
  }, [socket, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (socket) {
      socket.emit('save_bot_config', { botId: CREDENCIALES_BOT_ID, config });
    }
    onClose();
  };

  const guardarAlertaServicio = (cambios) => {
    const actual = configsServicio[servicioActivo];
    const nuevo = { ...actual, alerta_consumo: { ...actual.alerta_consumo, ...cambios } };
    setConfigsServicio(prev => ({ ...prev, [servicioActivo]: nuevo }));
    if (socket) {
      socket.emit('save_bot_config', { botId: servicioActivo, config: nuevo });
    }
  };

  const alerta = configsServicio[servicioActivo].alerta_consumo;
  const labelActivo = SERVICIOS.find(s => s.id === servicioActivo)?.label || '';

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(3, 4, 6, 0.85)', backdropFilter: 'blur(8px)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
    }}>
      <div style={{
        width: '100%', maxWidth: '760px', maxHeight: '90vh', overflowY: 'auto', backgroundColor: '#1e293b',
        border: '1px solid #334155', borderRadius: '16px', padding: '1.75rem',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #334155', paddingBottom: '0.85rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Key size={18} color="#22c55e" /> Credenciales del Servidor PME
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 0, marginBottom: '1.25rem' }}>
          Estas credenciales son compartidas por todos los bots de la familia PME (HVAC, Alumbrado, Frío, General...).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={labelStyle}>
              <Globe size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> URL Plataforma PME
            </label>
            <input
              type="text"
              value={config.url}
              onChange={e => setConfig(p => ({ ...p, url: e.target.value }))}
              placeholder="https://10.30.4.124/..."
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>
                <User size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Usuario
              </label>
              <input
                type="text"
                value={config.username}
                onChange={e => setConfig(p => ({ ...p, username: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>
                <Key size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Contraseña
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={config.password}
                  onChange={e => setConfig(p => ({ ...p, password: e.target.value }))}
                  style={{ ...inputStyle, padding: '0.65rem 2.5rem 0.65rem 0.85rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
                >
                  {showPassword ? <EyeOff size={18} color="#22c55e" /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Notificaciones: Telegram */}
        <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid #334155' }}>
          <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Send size={16} color="#38bdf8" /> Alertas por Telegram
          </h4>
          <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.2rem', marginBottom: '0.85rem' }}>
            Bot: @spsa_pme_alertas_bot. Se usa para avisos de medidores desconectados y consumo fuera de horario.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Token del bot</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showTelegramToken ? 'text' : 'password'}
                  value={config.telegram_bot_token}
                  onChange={e => setConfig(p => ({ ...p, telegram_bot_token: e.target.value }))}
                  placeholder="123456789:AAH..."
                  style={{ ...inputStyle, padding: '0.65rem 2.5rem 0.65rem 0.85rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowTelegramToken(p => !p)}
                  style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
                >
                  {showTelegramToken ? <EyeOff size={18} color="#22c55e" /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Chat ID</label>
              <input
                type="text"
                value={config.telegram_chat_id}
                onChange={e => setConfig(p => ({ ...p, telegram_chat_id: e.target.value }))}
                placeholder="8422183982"
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Notificaciones: Correo (Gmail) */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #334155' }}>
          <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Mail size={16} color="#fbbf24" /> Alertas por Correo (Gmail)
          </h4>
          <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.2rem', marginBottom: '0.85rem' }}>
            Cuenta remitente (una sola para todos). Requiere una "contraseña de aplicación" de 16 caracteres de Google, no tu contraseña normal.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Correo remitente</label>
              <input
                type="email"
                value={config.gmail_remitente}
                onChange={e => setConfig(p => ({ ...p, gmail_remitente: e.target.value }))}
                placeholder="alertas.spsa@gmail.com"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Contraseña de aplicación</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', maxWidth: '360px' }}>
                <input
                  type={showAppPassword ? 'text' : 'password'}
                  value={config.gmail_app_password}
                  onChange={e => setConfig(p => ({ ...p, gmail_app_password: e.target.value.replace(/\s/g, '') }))}
                  placeholder="16 caracteres"
                  style={{ ...inputStyle, padding: '0.65rem 2.5rem 0.65rem 0.85rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowAppPassword(p => !p)}
                  style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
                >
                  {showAppPassword ? <EyeOff size={18} color="#22c55e" /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Correo destinatario y copia por defecto</label>
              <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 0, marginBottom: '0.5rem' }}>
                Se usa solo si una especialidad (abajo) no tiene su propio destinatario configurado.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <input
                  type="text"
                  value={config.email_destinatario}
                  onChange={e => setConfig(p => ({ ...p, email_destinatario: e.target.value }))}
                  placeholder="raul@spsa.pe"
                  style={inputStyle}
                />
                <input
                  type="text"
                  value={config.email_copia}
                  onChange={e => setConfig(p => ({ ...p, email_copia: e.target.value }))}
                  placeholder="Copia (CC), opcional"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1.75rem', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #334155', paddingTop: '1rem' }}>
          <button
            onClick={handleSave}
            style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
          >
            Guardar Credenciales
          </button>
        </div>

        {/* Alertas de consumo fuera de horario, por especialidad */}
        <div style={{ marginTop: '1.75rem', paddingTop: '1.5rem', borderTop: '1px solid #334155' }}>
          <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Bell size={16} color="#f97316" /> Alertas de Consumo Fuera de Horario — por Especialidad
          </h4>
          <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.2rem', marginBottom: '1rem' }}>
            Cada especialidad puede avisar a personas distintas. Los cambios aquí se guardan automáticamente al editar.
          </p>

          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {SERVICIOS.map(s => (
              <button
                key={s.id}
                onClick={() => setServicioActivo(s.id)}
                style={{
                  padding: '0.4rem 0.9rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                  border: servicioActivo === s.id ? '1px solid #22c55e' : '1px solid #475569',
                  background: servicioActivo === s.id ? 'rgba(34, 197, 94, 0.15)' : '#0f172a',
                  color: servicioActivo === s.id ? '#4ade80' : '#cbd5e1'
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '1.1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#fff', fontWeight: 600, cursor: 'pointer', marginBottom: '0.9rem' }}>
              <input
                type="checkbox"
                checked={alerta.activo}
                onChange={e => guardarAlertaServicio({ activo: e.target.checked })}
                style={{ width: '16px', height: '16px', accentColor: '#22c55e' }}
              />
              Activar alerta para {SERVICIOS.find(s => s.id === servicioActivo)?.label}
            </label>

            {servicioActivo !== 'bot_pme_frio_alimentario' ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.9rem', opacity: alerta.activo ? 1 : 0.5 }}>
                  <div>
                    <label style={smallLabelStyle}>Desde</label>
                    <input
                      type="time"
                      value={alerta.hora_inicio}
                      disabled={!alerta.activo}
                      onChange={e => guardarAlertaServicio({ hora_inicio: e.target.value })}
                      style={smallInputStyle}
                    />
                  </div>
                  <div>
                    <label style={smallLabelStyle}>Hasta</label>
                    <input
                      type="time"
                      value={alerta.hora_fin}
                      disabled={!alerta.activo}
                      onChange={e => guardarAlertaServicio({ hora_fin: e.target.value })}
                      style={smallInputStyle}
                    />
                  </div>
                  <div>
                    <label style={smallLabelStyle}>Línea base (kWh)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={alerta.linea_base_kwh}
                      disabled={!alerta.activo}
                      onChange={e => guardarAlertaServicio({ linea_base_kwh: parseFloat(e.target.value) || 0 })}
                      style={smallInputStyle}
                    />
                  </div>
                  <div>
                    <label style={smallLabelStyle}>Precio por kWh (S/)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={alerta.precio_kwh}
                      disabled={!alerta.activo}
                      onChange={e => guardarAlertaServicio({ precio_kwh: parseFloat(e.target.value) || 0 })}
                      style={smallInputStyle}
                    />
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#cbd5e1', cursor: alerta.activo ? 'pointer' : 'default', marginBottom: '0.9rem', opacity: alerta.activo ? 1 : 0.5 }}>
                  <input
                    type="checkbox"
                    checked={alerta.adjuntar_excel}
                    disabled={!alerta.activo}
                    onChange={e => guardarAlertaServicio({ adjuntar_excel: e.target.checked })}
                    style={{ width: '15px', height: '15px', accentColor: '#22c55e' }}
                  />
                  📎 Adjuntar Excel con el detalle hora por hora (correo y Telegram)
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#cbd5e1', cursor: alerta.activo ? 'pointer' : 'default', marginBottom: '0.9rem', opacity: alerta.activo ? 1 : 0.5 }}>
                  <input
                    type="checkbox"
                    checked={!!alerta.alertas_individuales_activo}
                    disabled={!alerta.activo}
                    onChange={e => guardarAlertaServicio({ alertas_individuales_activo: e.target.checked })}
                    style={{ width: '15px', height: '15px', accentColor: '#22c55e' }}
                  />
                  📱 Enviar también alerta individual por sede/día (detalle, además del reporte general)
                </label>
                <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '-0.6rem', marginBottom: '0.9rem', opacity: alerta.activo ? 1 : 0.5 }}>
                  Apagado por defecto: ese detalle ya se ve en PME y agrega llamadas de red extra a la descarga (más lenta y más sensible a cortes). Actívalo solo si más adelante quieres enrutar avisos a un contacto específico de cada sede.
                </p>

                <div style={{ marginBottom: '0.9rem', opacity: alerta.activo ? 1 : 0.5 }}>
                  <label style={smallLabelStyle}>Umbral de sede crítica (S/ por día)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={alerta.umbral_critico_soles_dia}
                    disabled={!alerta.activo}
                    onChange={e => guardarAlertaServicio({ umbral_critico_soles_dia: parseFloat(e.target.value) || 0 })}
                    placeholder="0 = sin resaltar"
                    style={{ ...smallInputStyle, maxWidth: '220px' }}
                  />
                  <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.35rem', marginBottom: 0 }}>
                    Las sedes cuyo costo diario fuera de horario supere este monto se resaltan en <strong style={{ color: '#fca5a5' }}>rojo</strong> en el gráfico. Déjalo en 0 para no resaltar ninguna.
                  </p>
                </div>

                <div style={{ marginBottom: '0.9rem', opacity: alerta.activo ? 1 : 0.5 }}>
                  <label style={smallLabelStyle}>Umbral de sede media (S/ por día)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={alerta.umbral_medio_soles_dia}
                    disabled={!alerta.activo}
                    onChange={e => guardarAlertaServicio({ umbral_medio_soles_dia: parseFloat(e.target.value) || 0 })}
                    placeholder="0 = sin nivel medio"
                    style={{ ...smallInputStyle, maxWidth: '220px' }}
                  />
                  <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.35rem', marginBottom: 0 }}>
                    Segundo umbral (debe ser menor al crítico) para clasificar sedes en 3 niveles de prioridad: <strong style={{ color: '#fca5a5' }}>Crítica</strong> (≥ umbral crítico), <strong style={{ color: '#fdba74' }}>Media</strong> (≥ este valor) y <strong style={{ color: '#93c5fd' }}>Baja</strong> (el resto). Se usa en el historial de resultados y el PDF de Perfil de Resultados.
                  </p>
                </div>
              </>
            ) : (
              <div style={{ opacity: alerta.activo ? 1 : 0.5, marginBottom: '0.9rem' }}>
                <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 0, marginBottom: '0.9rem' }}>
                  El frío alimentario opera 24/7 — no hay un "horario en que debería estar apagado". Se evalúa contra 4 señales independientes en vez de un rango horario fijo. Estos son los valores <strong>globales por defecto</strong>; se pueden afinar por sede en la tabla <code>pme_config_sedes</code>.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.9rem' }}>
                  <div>
                    <label style={smallLabelStyle}>① Máximo diario (kWh/día)</label>
                    <input
                      type="number" step="1" min="0"
                      value={alerta.maximo_kwh_dia || 0}
                      disabled={!alerta.activo}
                      onChange={e => guardarAlertaServicio({ maximo_kwh_dia: parseFloat(e.target.value) || 0 })}
                      placeholder="0 = desactivado"
                      style={smallInputStyle}
                    />
                  </div>
                  <div>
                    <label style={smallLabelStyle}>② Máximo por hora (kWh) — aplica a las 24h</label>
                    <input
                      type="number" step="0.1" min="0"
                      value={alerta.maximo_kwh_hora || 0}
                      disabled={!alerta.activo}
                      onChange={e => guardarAlertaServicio({ maximo_kwh_hora: parseFloat(e.target.value) || 0 })}
                      placeholder="0 = desactivado"
                      style={smallInputStyle}
                    />
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#cbd5e1', cursor: alerta.activo ? 'pointer' : 'default', marginBottom: '0.6rem' }}>
                  <input
                    type="checkbox"
                    checked={!!alerta.ventana_baja_activo}
                    disabled={!alerta.activo}
                    onChange={e => guardarAlertaServicio({ ventana_baja_activo: e.target.checked })}
                    style={{ width: '15px', height: '15px', accentColor: '#22c55e' }}
                  />
                  ③ Ventana de bajo consumo esperado (opcional)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.9rem', opacity: alerta.ventana_baja_activo ? 1 : 0.5 }}>
                  <div>
                    <label style={smallLabelStyle}>Desde</label>
                    <input
                      type="time"
                      value={alerta.ventana_baja_hora_inicio || '01:00'}
                      disabled={!alerta.activo || !alerta.ventana_baja_activo}
                      onChange={e => guardarAlertaServicio({ ventana_baja_hora_inicio: e.target.value })}
                      style={smallInputStyle}
                    />
                  </div>
                  <div>
                    <label style={smallLabelStyle}>Hasta</label>
                    <input
                      type="time"
                      value={alerta.ventana_baja_hora_fin || '05:00'}
                      disabled={!alerta.activo || !alerta.ventana_baja_activo}
                      onChange={e => guardarAlertaServicio({ ventana_baja_hora_fin: e.target.value })}
                      style={smallInputStyle}
                    />
                  </div>
                  <div>
                    <label style={smallLabelStyle}>Techo esperado (kWh)</label>
                    <input
                      type="number" step="0.1" min="0"
                      value={alerta.ventana_baja_linea_base_kwh || 0}
                      disabled={!alerta.activo || !alerta.ventana_baja_activo}
                      onChange={e => guardarAlertaServicio({ ventana_baja_linea_base_kwh: parseFloat(e.target.value) || 0 })}
                      style={smallInputStyle}
                    />
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#cbd5e1', cursor: alerta.activo ? 'pointer' : 'default', marginBottom: '0.6rem' }}>
                  <input
                    type="checkbox"
                    checked={alerta.linea_base_dinamica_activo !== false}
                    disabled={!alerta.activo}
                    onChange={e => guardarAlertaServicio({ linea_base_dinamica_activo: e.target.checked })}
                    style={{ width: '15px', height: '15px', accentColor: '#22c55e' }}
                  />
                  ④ Línea base dinámica (semana actual vs. semana anterior)
                </label>
                <div style={{ opacity: alerta.linea_base_dinamica_activo !== false ? 1 : 0.5, marginBottom: '0.4rem' }}>
                  <label style={smallLabelStyle}>Umbral de variación (%)</label>
                  <input
                    type="number" step="1" min="0"
                    value={alerta.linea_base_dinamica_umbral_pct ?? 20}
                    disabled={!alerta.activo || alerta.linea_base_dinamica_activo === false}
                    onChange={e => guardarAlertaServicio({ linea_base_dinamica_umbral_pct: parseFloat(e.target.value) || 0 })}
                    style={{ ...smallInputStyle, maxWidth: '160px' }}
                  />
                  <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.35rem', marginBottom: 0 }}>
                    Alerta si el promedio diario de la semana actual supera al de la semana anterior en más de este %. Necesita al menos 14 días de historia ya acumulada por sede.
                  </p>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#cbd5e1', cursor: alerta.activo ? 'pointer' : 'default', margin: '0.9rem 0', opacity: alerta.activo ? 1 : 0.5 }}>
                  <input
                    type="checkbox"
                    checked={alerta.adjuntar_excel}
                    disabled={!alerta.activo}
                    onChange={e => guardarAlertaServicio({ adjuntar_excel: e.target.checked })}
                    style={{ width: '15px', height: '15px', accentColor: '#22c55e' }}
                  />
                  📎 Adjuntar Excel con el detalle de las 4 señales (correo y Telegram)
                </label>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.4rem', opacity: alerta.activo ? 1 : 0.5 }}>
              <div>
                <label style={smallLabelStyle}>Destinatarios (a quién avisa)</label>
                <input
                  type="text"
                  value={alerta.destinatarios}
                  disabled={!alerta.activo}
                  onChange={e => guardarAlertaServicio({ destinatarios: e.target.value })}
                  placeholder="tecnico.hvac@spsa.pe, ..."
                  style={smallInputStyle}
                />
              </div>
              <div>
                <label style={smallLabelStyle}>Copia (CC)</label>
                <input
                  type="text"
                  value={alerta.copia}
                  disabled={!alerta.activo}
                  onChange={e => guardarAlertaServicio({ copia: e.target.value })}
                  placeholder="jefe.energia@spsa.pe, ..."
                  style={smallInputStyle}
                />
              </div>
            </div>
            <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 0, marginBottom: '0.9rem', opacity: alerta.activo ? 1 : 0.5 }}>
              Varios correos separados por coma. Si se dejan vacíos, se usa el destinatario/copia por defecto de arriba.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.4rem', opacity: alerta.activo ? 1 : 0.5 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={smallLabelStyle}>Nombre del remitente</label>
                  <button
                    type="button"
                    disabled={!alerta.activo}
                    onClick={() => guardarAlertaServicio({ nombre_remitente: alertaDefaultPara(labelActivo).nombre_remitente })}
                    style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: alerta.activo ? 'pointer' : 'default', fontSize: '0.68rem', textDecoration: 'underline' }}
                  >
                    Restaurar
                  </button>
                </div>
                <input
                  type="text"
                  value={alerta.nombre_remitente}
                  disabled={!alerta.activo}
                  onChange={e => guardarAlertaServicio({ nombre_remitente: e.target.value })}
                  placeholder={`Alertas ${labelActivo} PME`}
                  style={smallInputStyle}
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={smallLabelStyle}>Asunto del correo</label>
                  <button
                    type="button"
                    disabled={!alerta.activo}
                    onClick={() => guardarAlertaServicio({ asunto: alertaDefaultPara(labelActivo).asunto })}
                    style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: alerta.activo ? 'pointer' : 'default', fontSize: '0.68rem', textDecoration: 'underline' }}
                  >
                    Restaurar
                  </button>
                </div>
                <input
                  type="text"
                  value={alerta.asunto}
                  disabled={!alerta.activo}
                  onChange={e => guardarAlertaServicio({ asunto: e.target.value })}
                  placeholder={`Alerta Consumo fuera de horario - ${labelActivo}`}
                  style={smallInputStyle}
                />
              </div>
            </div>
            <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 0, marginBottom: '0.9rem', opacity: alerta.activo ? 1 : 0.5 }}>
              El nombre del remitente hace que el correo se vea como "{alerta.nombre_remitente || `Alertas ${labelActivo} PME`} &lt;{config.gmail_remitente || 'tu-correo@gmail.com'}&gt;" en vez del correo pelado. Ambos campos aceptan las mismas variables que el cuerpo del mensaje.
            </p>

            {servicioActivo !== 'bot_pme_frio_alimentario' && (
              <>
                <div style={{ opacity: alerta.activo ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={smallLabelStyle}>Cuerpo del mensaje</label>
                    <button
                      type="button"
                      disabled={!alerta.activo}
                      onClick={() => guardarAlertaServicio({ cuerpo_mensaje: PLANTILLA_DEFAULT })}
                      style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: alerta.activo ? 'pointer' : 'default', fontSize: '0.72rem', textDecoration: 'underline' }}
                    >
                      Restaurar por defecto
                    </button>
                  </div>
                  <textarea
                    value={alerta.cuerpo_mensaje}
                    disabled={!alerta.activo}
                    onChange={e => guardarAlertaServicio({ cuerpo_mensaje: e.target.value })}
                    rows={5}
                    style={{ ...smallInputStyle, fontFamily: 'monospace', fontSize: '0.78rem', resize: 'vertical' }}
                  />
                  <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.4rem', marginBottom: 0 }}>
                    Variables disponibles: <code>{'{servicio} {sede} {fecha} {hora} {valor} {linea_base} {hora_inicio} {hora_fin} {total_kwh} {precio_kwh} {costo}'}</code>
                  </p>
                </div>

                <div style={{ marginTop: '1.1rem', opacity: alerta.activo ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={smallLabelStyle}>🛠️ Descripción de la solicitud de servicio (Plan de Acción)</label>
                    <button
                      type="button"
                      disabled={!alerta.activo}
                      onClick={() => guardarAlertaServicio({ descripcion_solicitud_servicio: alertaDefaultPara(labelActivo).descripcion_solicitud_servicio })}
                      style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: alerta.activo ? 'pointer' : 'default', fontSize: '0.72rem', textDecoration: 'underline' }}
                    >
                      Restaurar por defecto
                    </button>
                  </div>
                  <textarea
                    value={alerta.descripcion_solicitud_servicio}
                    disabled={!alerta.activo}
                    onChange={e => guardarAlertaServicio({ descripcion_solicitud_servicio: e.target.value })}
                    rows={3}
                    style={{ ...smallInputStyle, fontFamily: 'monospace', fontSize: '0.78rem', resize: 'vertical' }}
                  />
                  <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.4rem', marginBottom: 0 }}>
                    Se usa una vez por cada sede crítica (según el umbral de arriba) para armar el mensaje "Plan de Acción: Solicitudes de Servicio" que llega por Telegram como texto (para copiar/pegar al crear la solicitud en la plataforma de mantenimiento) y también se agrega como hoja adicional en el Excel.
                  </p>
                </div>
              </>
            )}

            <div style={{ marginTop: '1.1rem', opacity: alerta.activo ? 1 : 0.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={smallLabelStyle}>🔌 Descripción de la solicitud por medidor desconectado</label>
                <button
                  type="button"
                  disabled={!alerta.activo}
                  onClick={() => guardarAlertaServicio({ descripcion_solicitud_medidor: alertaDefaultPara(labelActivo).descripcion_solicitud_medidor })}
                  style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: alerta.activo ? 'pointer' : 'default', fontSize: '0.72rem', textDecoration: 'underline' }}
                >
                  Restaurar por defecto
                </button>
              </div>
              <textarea
                value={alerta.descripcion_solicitud_medidor}
                disabled={!alerta.activo}
                onChange={e => guardarAlertaServicio({ descripcion_solicitud_medidor: e.target.value })}
                rows={3}
                style={{ ...smallInputStyle, fontFamily: 'monospace', fontSize: '0.78rem', resize: 'vertical' }}
              />
              <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.4rem', marginBottom: 0 }}>
                Se usa una vez por cada medidor sin datos (sección "Medidores Desconectados") para armar el mensaje "Plan de Acción: Medidores de Energía Desconectados" por Telegram, y se agrega como columnas extra en la hoja "Medidores Desconectados" del Excel. Variables disponibles: <code>{'{medidor_nombre} {ultima_fecha_con_datos}'}</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PmeCredencialesModal;
