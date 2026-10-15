// Estilos y utilidades compartidas para cuadros interactivos estilo Trello con efecto dinámico

export const getTrelloCardStyle = (accentColor = '#38bdf8', isHovered = false) => ({
  background: 'linear-gradient(160deg, #17233d 0%, #0f172a 100%)',
  border: isHovered ? `1px solid ${accentColor}` : '1px solid rgba(148, 163, 184, 0.22)',
  borderRadius: '12px',
  padding: '0.95rem 1.1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.65rem',
  boxShadow: isHovered
    ? `0 12px 28px rgba(0, 0, 0, 0.65), 0 0 18px ${accentColor}33`
    : '0 4px 16px rgba(0, 0, 0, 0.4)',
  transform: isHovered ? 'translateY(-3px)' : 'translateY(0)',
  transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
  boxSizing: 'border-box',
  position: 'relative',
  overflow: 'hidden',
});

export const inputFieldStyle = {
  width: '100%',
  background: '#090d16',
  border: '1px solid #334155',
  borderRadius: '6px',
  padding: '0.45rem 0.65rem',
  color: '#f8fafc',
  fontSize: '0.88rem',
  fontWeight: 700,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s ease',
};
