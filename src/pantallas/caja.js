// Pantalla de Caja: grilla de platos de hoy + carrito con total en vivo.
import { supabase } from '../supabase.js'
import { formatearGs, escaparHtml } from '../utils.js'
import { hoyAsuncion } from './stock.js'

export async function mostrarCaja(contenedor) {
  contenedor.innerHTML = `
    <section class="pantalla">
      <h2>Caja</h2>
      <div class="caja-platos">Cargando…</div>
      <div class="caja-carrito"></div>
      <form class="menu-form caja-form" novalidate hidden>
        <h3>Datos del pedido</h3>
        <label>Canal
          <select name="canal">
            <option value="local">Local</option>
            <option value="delivery">Delivery</option>
            <option value="vianda">Vianda</option>
          </select>
        </label>
        <label>Nombre (opcional)<input name="nombre" type="text" autocomplete="off" /></label>
        <label>Teléfono (opcional)<input name="telefono" type="tel" inputmode="tel" autocomplete="off" /></label>
        <label>Forma de pago
          <select name="pago">
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="pendiente">Pendiente de cobro</option>
          </select>
        </label>
        <label>Nota (opcional)<input name="nota" type="text" autocomplete="off" /></label>
        <p class="login-error" role="alert" hidden></p>
        <button type="submit" class="btn-grande">Confirmar pedido</button>
      </form>
    </section>
  `
  const zonaPlatos = contenedor.querySelector('.caja-platos')
  const zonaCarrito = contenedor.querySelector('.caja-carrito')
  const form = contenedor.querySelector('.caja-form')
  const error = form.querySelector('.login-error')
  const btnConfirmar = form.querySelector('[type=submit]')

  // Estado: platos de hoy (con su disponible) y carrito (item_id -> cantidad).
  // Un Map mantiene el orden en que se agregaron los platos.
  let platos = []
  const carrito = new Map()

  async function cargar() {
    // Leemos daily_stock con join a menu_items (v_stock_hoy no trae item_id).
    const { data, error } = await supabase
      .from('daily_stock')
      .select('*, menu_items(*)')
      .eq('stock_date', hoyAsuncion())
    if (error) {
      zonaPlatos.textContent = 'No se pudo cargar el menú de hoy. Revisá la conexión.'
      return
    }
    platos = data
      // Las guarniciones del día también tienen fila en daily_stock, pero no se venden solas.
      .filter((s) => s.menu_items?.active && s.menu_items.kind !== 'guarnicion')
      .map((s) => ({
        id: s.item_id,
        nombre: s.menu_items.name,
        categoria: s.menu_items.category,
        precio: s.menu_items.price,
        disponible: s.qty_initial - s.qty_sold,
      }))
      .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre))
    if (!platos.length) {
      zonaPlatos.textContent = 'No hay platos con stock cargado para hoy. Cargalo en Stock.'
      return
    }
    dibujar()
  }

  function dibujar() {
    // Agrupamos por categoría (ya vienen ordenados).
    const grupos = new Map()
    for (const p of platos) {
      if (!grupos.has(p.categoria)) grupos.set(p.categoria, [])
      grupos.get(p.categoria).push(p)
    }
    zonaPlatos.innerHTML = [...grupos].map(([cat, items]) => `
      <h3 class="menu-cat">${escaparHtml(cat)}</h3>
      ${items.map((p) => {
        const cant = carrito.get(p.id) || 0
        const agotado = p.disponible <= 0
        return `
          <div class="menu-plato${agotado ? ' inactivo' : ''}">
            <span class="menu-plato-info">
              <strong>${escaparHtml(p.nombre)}</strong>
              <span>${formatearGs(p.precio)} · ${agotado ? 'Agotado' : `quedan ${p.disponible}`}</span>
            </span>
            <button type="button" class="btn-cant" data-id="${p.id}" data-delta="-1"
              aria-label="Quitar uno" ${cant === 0 ? 'disabled' : ''}>−</button>
            <span class="cant">${cant}</span>
            <button type="button" class="btn-cant" data-id="${p.id}" data-delta="1"
              aria-label="Agregar uno" ${agotado || cant >= p.disponible ? 'disabled' : ''}>+</button>
          </div>`
      }).join('')}
    `).join('')
    dibujarCarrito()
  }

  function dibujarCarrito() {
    const lineas = [...carrito].map(([id, cant]) => {
      const p = platos.find((x) => x.id === id)
      return { p, cant, subtotal: p.precio * cant }
    })
    const total = lineas.reduce((suma, l) => suma + l.subtotal, 0)
    form.hidden = !lineas.length
    zonaCarrito.innerHTML = lineas.length ? `
      <div class="carrito">
        <h3>Pedido</h3>
        ${lineas.map((l) => `
          <div class="carrito-linea">
            <span>${l.cant} × ${escaparHtml(l.p.nombre)}</span>
            <span>${formatearGs(l.subtotal)}</span>
          </div>`).join('')}
        <div class="carrito-total"><span>Total</span><span>${formatearGs(total)}</span></div>
      </div>` : ''
  }

  // Un solo listener para todos los botones (delegación de eventos).
  zonaPlatos.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-cant')
    if (!btn) return
    const p = platos.find((x) => x.id === btn.dataset.id)
    // Nunca dejamos pasar del disponible ni bajar de 0.
    const nueva = Math.min(p.disponible, Math.max(0, (carrito.get(p.id) || 0) + Number(btn.dataset.delta)))
    if (nueva === 0) carrito.delete(p.id)
    else carrito.set(p.id, nueva)
    dibujar()
  })

  // Traduce los errores de la base a mensajes claros para quien atiende.
  function traducirError(err) {
    const msg = err.message || ''
    if (msg.includes('Sin stock suficiente')) return 'No alcanza el stock de alguno de los platos. Revisá las cantidades.'
    if (msg.includes('Plato inexistente o inactivo')) return 'Alguno de los platos ya no está disponible. Actualizá la caja.'
    if (msg.includes('No autorizado')) return 'Tu sesión venció. Volvé a iniciar sesión.'
    return 'No se pudo confirmar el pedido. Revisá la conexión e intentá de nuevo.'
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!carrito.size) return
    error.hidden = true
    btnConfirmar.disabled = true // evita doble toque = pedido duplicado

    const datos = new FormData(form)
    const lineas = [...carrito].map(([id, cant]) => {
      const p = platos.find((x) => x.id === id)
      return { nombre: p.nombre, cant, precio: p.precio }
    })
    const { data: pedido, error: err } = await supabase.rpc('create_order', {
      p_channel: datos.get('canal'),
      p_customer_name: datos.get('nombre').trim() || null,
      p_customer_phone: datos.get('telefono').trim() || null,
      p_payment: datos.get('pago'),
      p_notes: datos.get('nota').trim() || null,
      p_items: [...carrito].map(([item_id, qty]) => ({ item_id, qty })),
    })
    btnConfirmar.disabled = false

    if (err) {
      error.textContent = traducirError(err)
      error.hidden = false
      // Si faltó stock, recargamos para mostrar los disponibles actuales.
      if (err.message?.includes('Sin stock')) { carrito.clear(); await cargar() }
      return
    }
    mostrarTicket(pedido, lineas)
  })

  // Ticket digital: reemplaza la pantalla hasta que se arma un pedido nuevo.
  function mostrarTicket(pedido, lineas) {
    const fecha = new Date(pedido.created_at).toLocaleString('es-PY', { timeZone: 'America/Asuncion' })
    const etiquetaPago = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', pendiente: 'Pendiente de cobro' }
    const canal = pedido.channel.charAt(0).toUpperCase() + pedido.channel.slice(1)
    const resumen = [
      `Lo de Carmi - Pedido N° ${pedido.ticket_no}`,
      ...lineas.map((l) => `${l.cant} x ${l.nombre} - ${formatearGs(l.precio * l.cant)}`),
      `Total: ${formatearGs(pedido.total)}`,
      `Pago: ${etiquetaPago[pedido.payment_method] || pedido.payment_method}`,
      '¡Gracias!',
    ].join('\n')

    // wa.me pide el número solo con dígitos y con código de país.
    // Si lo escribieron como 0981123456, lo pasamos a 595981123456 (Paraguay).
    let tel = (pedido.customer_phone || '').replace(/\D/g, '')
    if (tel.startsWith('0')) tel = '595' + tel.slice(1)

    contenedor.innerHTML = `
      <section class="pantalla">
        <div class="ticket">
          <h2>Lo de Carmi</h2>
          <p class="ticket-num">Pedido N° ${pedido.ticket_no}</p>
          <p class="ticket-meta">${escaparHtml(fecha)}</p>
          <p class="ticket-meta">Canal: ${escaparHtml(canal)}${pedido.customer_name ? ` · ${escaparHtml(pedido.customer_name)}` : ''}</p>
          ${lineas.map((l) => `
            <div class="carrito-linea">
              <span>${l.cant} × ${escaparHtml(l.nombre)}</span>
              <span>${formatearGs(l.precio * l.cant)}</span>
            </div>`).join('')}
          <div class="carrito-total"><span>Total</span><span>${formatearGs(pedido.total)}</span></div>
          <p class="ticket-meta">Pago: ${escaparHtml(etiquetaPago[pedido.payment_method] || pedido.payment_method)}</p>
          ${pedido.notes ? `<p class="ticket-meta">Nota: ${escaparHtml(pedido.notes)}</p>` : ''}
        </div>
        ${tel ? `<a class="btn-grande btn-wa" target="_blank" rel="noopener"
          href="https://wa.me/${tel}?text=${encodeURIComponent(resumen)}">Compartir por WhatsApp</a>` : ''}
        <button type="button" class="btn-grande btn-sec btn-nuevo">Nuevo pedido</button>
      </section>
    `
    contenedor.querySelector('.btn-nuevo').addEventListener('click', () => mostrarCaja(contenedor))
  }

  await cargar()
}
