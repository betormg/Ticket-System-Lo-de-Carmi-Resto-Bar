// Pantalla de Pedidos de hoy: lista con detalle, avanzar estado y anular.
import { supabase } from '../supabase.js'
import { formatearGs, escaparHtml } from '../utils.js'
import { hoyAsuncion } from './stock.js'

// Orden del flujo. Cada estado apunta al siguiente; "entregado" es el final.
const SIGUIENTE = {
  pendiente: { estado: 'en_cocina', texto: 'Pasar a cocina' },
  en_cocina: { estado: 'listo', texto: 'Marcar listo' },
  listo: { estado: 'entregado', texto: 'Marcar entregado' },
}

const ETIQUETA = {
  pendiente: 'Pendiente',
  en_cocina: 'En cocina',
  listo: 'Listo',
  entregado: 'Entregado',
  anulado: 'Anulado',
}

export async function mostrarPedidos(contenedor) {
  contenedor.innerHTML = `
    <section class="pantalla">
      <h2>Pedidos de hoy</h2>
      <p class="login-error" role="alert" hidden></p>
      <div class="pedidos-lista">Cargando…</div>
    </section>
  `
  const lista = contenedor.querySelector('.pedidos-lista')
  const error = contenedor.querySelector('.login-error')

  function mostrarError(texto) {
    error.textContent = texto
    error.hidden = !texto
  }

  async function cargar() {
    // Un solo pedido a la base: orders + sus renglones + el nombre de cada plato
    // (join anidado de PostgREST: order_items -> menu_items).
    const { data, error: err } = await supabase
      .from('orders')
      .select('*, order_items(qty, unit_price, menu_items(name))')
      .eq('order_date', hoyAsuncion())
      .order('ticket_no', { ascending: false })
    if (err) {
      lista.textContent = 'No se pudieron cargar los pedidos. Revisá la conexión.'
      return
    }
    if (!data.length) {
      lista.textContent = 'Todavía no hay pedidos hoy.'
      return
    }
    lista.innerHTML = data.map(tarjeta).join('')
  }

  function tarjeta(p) {
    const hora = new Date(p.created_at).toLocaleTimeString('es-PY', {
      timeZone: 'America/Asuncion', hour: '2-digit', minute: '2-digit',
    })
    const sig = SIGUIENTE[p.status]
    const anulable = p.status !== 'anulado'
    const cliente = [p.customer_name, p.customer_phone].filter(Boolean).map(escaparHtml).join(' · ')
    return `
      <article class="pedido ${p.status === 'anulado' ? 'anulado' : ''}" data-id="${p.id}">
        <header class="pedido-cab">
          <strong>Ticket #${p.ticket_no}</strong>
          <span class="estado estado-${p.status}">${ETIQUETA[p.status] ?? escaparHtml(p.status)}</span>
        </header>
        <p class="ticket-meta">${hora} · ${escaparHtml(p.channel)} · pago: ${escaparHtml(p.payment_method)}</p>
        ${cliente ? `<p class="ticket-meta">${cliente}</p>` : ''}
        <ul class="pedido-items">
          ${p.order_items.map((i) => `
            <li><span>${i.qty} × ${escaparHtml(i.menu_items?.name ?? 'Plato')}</span>
            <span>${formatearGs(i.qty * i.unit_price)}</span></li>`).join('')}
        </ul>
        ${p.notes ? `<p class="ticket-meta">Nota: ${escaparHtml(p.notes)}</p>` : ''}
        <p class="pedido-total"><span>Total</span><span>${formatearGs(p.total)}</span></p>
        <div class="pedido-botones">
          ${sig ? `<button type="button" class="btn-grande" data-accion="avanzar" data-estado="${sig.estado}">${sig.texto}</button>` : ''}
          ${anulable ? '<button type="button" class="btn-grande btn-sec" data-accion="anular">Anular</button>' : ''}
        </div>
      </article>`
  }

  // Un solo listener en la lista (delegación): sirve para todos los botones,
  // incluso los que se crean después de recargar.
  lista.addEventListener('click', async (e) => {
    const boton = e.target.closest('button[data-accion]')
    if (!boton) return
    const id = boton.closest('.pedido').dataset.id
    const ticket = boton.closest('.pedido').querySelector('strong').textContent
    mostrarError('')

    if (boton.dataset.accion === 'anular') {
      if (!confirm(`¿Anular el ${ticket}? Se devuelve el stock y no se puede deshacer.`)) return
      boton.disabled = true
      // cancel_order marca anulado y devuelve el stock en una sola operación.
      const { error: err } = await supabase.rpc('cancel_order', { p_order_id: id })
      if (err) mostrarError(`No se pudo anular: ${err.message}`)
    } else {
      boton.disabled = true
      const { error: err } = await supabase
        .from('orders').update({ status: boton.dataset.estado }).eq('id', id)
      if (err) mostrarError(`No se pudo cambiar el estado: ${err.message}`)
    }
    await cargar()
  })

  await cargar()
}
