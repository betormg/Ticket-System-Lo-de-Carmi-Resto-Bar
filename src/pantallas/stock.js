// Pantalla de Stock del día: cargar las porciones de cada plato activo.
// Se guardan todas juntas con set_daily_stock (una sola llamada).
import { supabase } from '../supabase.js'
import { formatearGs, escaparHtml } from '../utils.js'

// Fecha de hoy en Asunción como "AAAA-MM-DD". El locale 'sv-SE' da justo ese
// formato, y timeZone evita que a la noche "hoy" cambie según la hora del celular.
export function hoyAsuncion() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Asuncion' })
}

export async function mostrarStock(contenedor) {
  contenedor.innerHTML = `
    <section class="pantalla">
      <h2>Stock del día</h2>
      <form class="stock-form" novalidate>
        <div class="stock-lista">Cargando…</div>
        <p class="login-error" role="alert" hidden></p>
        <p class="stock-ok" role="status" hidden></p>
        <button type="submit" class="btn-grande" disabled>Guardar stock</button>
      </form>
    </section>
  `

  const form = contenedor.querySelector('.stock-form')
  const lista = contenedor.querySelector('.stock-lista')
  const error = contenedor.querySelector('.login-error')
  const ok = contenedor.querySelector('.stock-ok')
  const btn = form.querySelector('[type=submit]')

  function mostrarMensaje(el, texto) {
    error.hidden = true
    ok.hidden = true
    el.textContent = texto
    el.hidden = !texto
  }

  async function cargar() {
    const hoy = hoyAsuncion()
    // Pedimos platos activos y el stock de hoy en paralelo.
    const [platosRes, stockRes] = await Promise.all([
      supabase.from('menu_items').select('*').eq('active', true).order('category').order('name'),
      supabase.from('daily_stock').select('item_id, qty_initial, qty_sold').eq('stock_date', hoy),
    ])
    if (platosRes.error || stockRes.error) {
      lista.textContent = 'No se pudo cargar el stock. Revisá la conexión.'
      return
    }
    const platos = platosRes.data
    if (!platos.length) {
      lista.textContent = 'No hay platos activos. Cargalos primero en Menú.'
      return
    }
    // Mapa item_id -> fila de stock, para precargar los valores en O(1).
    const stock = new Map(stockRes.data.map((s) => [s.item_id, s]))

    const grupos = new Map()
    for (const p of platos) {
      if (!grupos.has(p.category)) grupos.set(p.category, [])
      grupos.get(p.category).push(p)
    }

    lista.innerHTML = [...grupos].map(([cat, items]) => `
      <h3 class="menu-cat">${escaparHtml(cat)}</h3>
      ${items.map((p) => {
        const s = stock.get(p.id)
        return `
          <label class="menu-plato stock-fila">
            <span class="menu-plato-info">
              <strong>${escaparHtml(p.name)}</strong>
              <span>${formatearGs(p.price)}${s ? ` · vendidas: ${s.qty_sold}` : ''}</span>
            </span>
            <input type="number" inputmode="numeric" min="${s ? s.qty_sold : 0}" step="1"
              data-id="${p.id}" value="${s ? s.qty_initial : ''}" placeholder="0" />
          </label>`
      }).join('')}
    `).join('')
    btn.disabled = false
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const items = []
    for (const input of form.querySelectorAll('input[data-id]')) {
      // Vacío = no se cargó ese plato hoy (queda sin stock y no se puede vender).
      if (input.value.trim() === '') continue
      const qty = Number(input.value)
      if (!Number.isInteger(qty) || qty < 0) {
        return mostrarMensaje(error, 'Las porciones tienen que ser números enteros, 0 o más.')
      }
      items.push({ item_id: input.dataset.id, qty })
    }
    if (!items.length) return mostrarMensaje(error, 'Cargá las porciones de al menos un plato.')

    mostrarMensaje(error, '')
    btn.disabled = true
    const { error: err } = await supabase.rpc('set_daily_stock', {
      p_items: items,
      p_date: hoyAsuncion(),
    })
    btn.disabled = false

    if (err) {
      // Si la base rechaza (p. ej. bajar por debajo de lo ya vendido), lo decimos claro.
      return mostrarMensaje(error, `No se pudo guardar el stock: ${err.message}`)
    }
    mostrarMensaje(ok, 'Stock guardado.')
    await cargar()
    ok.hidden = false
    ok.textContent = 'Stock guardado.'
  })

  await cargar()
}
