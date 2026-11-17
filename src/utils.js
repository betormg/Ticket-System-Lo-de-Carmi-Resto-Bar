// Funciones de ayuda compartidas por todas las pantallas.

// 25000 -> "25.000 Gs". Usamos es-PY para que el separador de miles sea el punto.
export function formatearGs(monto) {
  return `${Number(monto).toLocaleString('es-PY')} Gs`
}

// Escapa texto del usuario antes de meterlo en innerHTML, para que un nombre
// como "<b>hola</b>" se vea como texto y no se interprete como HTML.
export function escaparHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}
