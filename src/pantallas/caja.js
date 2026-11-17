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
    </section>
  `
  const zonaPlatos = contenedor.querySelector('.caja-platos')
  const zonaCarrito = contenedor.querySelector('.caja-carrito')

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
      .filter((s) => s.menu_items?.active)
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

  await cargar()
}
