// Pantalla de Menú: alta, edición y activar/desactivar platos.
// Nunca se borra un plato: hay pedidos que lo referencian. Se desactiva.
import { supabase } from '../supabase.js'
import { formatearGs, escaparHtml } from '../utils.js'

export async function mostrarMenu(contenedor) {
  contenedor.innerHTML = `
    <section class="pantalla">
      <h2>Menú</h2>
      <form class="menu-form" novalidate>
        <h3 class="menu-form-titulo">Nuevo plato</h3>
        <label>Nombre <input name="name" required /></label>
        <label>Tipo
          <select name="kind">
            <option value="plato">Plato</option>
            <option value="guarnicion">Guarnición</option>
            <option value="bebida">Bebida</option>
            <option value="postre">Postre</option>
          </select>
        </label>
        <label>Categoría <input name="category" list="categorias" /></label>
        <datalist id="categorias"></datalist>
        <label><span class="menu-precio-label">Precio (Gs)</span> <input name="price" type="number" inputmode="numeric" min="0" step="500" required /></label>
        <label>Descripción (opcional, se ve en la web)
          <textarea name="description" rows="2" maxlength="160" placeholder="Ej.: de carne, a la napolitana o simple"></textarea>
        </label>
        <label class="menu-check"><input name="show_on_web" type="checkbox" checked /> Mostrar en la página web</label>
        <p class="menu-ayuda" hidden>Las guarniciones del día se tildan en la pantalla Stock. La web las ofrece con todos los platos.</p>
        <p class="login-error" role="alert" hidden></p>
        <div class="menu-form-botones">
          <button type="submit" class="btn-grande">Guardar</button>
          <button type="button" class="btn-grande btn-sec" hidden>Cancelar</button>
        </div>
      </form>
      <div class="menu-lista">Cargando…</div>
    </section>
  `

  const form = contenedor.querySelector('.menu-form')
  const titulo = contenedor.querySelector('.menu-form-titulo')
  const error = contenedor.querySelector('.login-error')
  const btnGuardar = form.querySelector('[type=submit]')
  const btnCancelar = form.querySelector('.btn-sec')
  const lista = contenedor.querySelector('.menu-lista')
  const datalist = contenedor.querySelector('#categorias')
  const precioLabel = contenedor.querySelector('.menu-precio-label')
  const ayuda = contenedor.querySelector('.menu-ayuda')

  // Tipos de ítem. Las guarniciones se tildan cada día en Stock y la web las ofrece con los platos.
  const TIPOS = { plato: 'Plato', guarnicion: 'Guarnición', bebida: 'Bebida', postre: 'Postre' }

  // Para una guarnición el precio es un recargo (0 = viene incluida con el plato).
  function actualizarTipo() {
    const esGuarnicion = form.kind.value === 'guarnicion'
    precioLabel.textContent = esGuarnicion ? 'Recargo (Gs, 0 si viene incluida)' : 'Precio (Gs)'
    ayuda.hidden = !esGuarnicion
  }
  form.kind.addEventListener('change', actualizarTipo)

  let platos = []
  let editandoId = null // null = estamos agregando uno nuevo

  function mostrarError(texto) {
    error.textContent = texto
    error.hidden = !texto
  }

  // Traduce el error de Supabase a algo entendible, sin esconder la causa.
  function motivoError(err) {
    const texto = err.message || ''
    if (/failed to fetch|networkerror|load failed/i.test(texto)) {
      return 'No se pudo conectar con la base. Revisá internet, recargá la página y probá de nuevo.'
    }
    if (/jwt/i.test(texto) || err.code === '42501') {
      return 'Tu sesión venció o no tiene permiso. Tocá Salir, volvé a entrar y probá de nuevo.'
    }
    return `No se pudo guardar. Detalle: ${texto || err.code || 'error desconocido'}`
  }

  function resetForm() {
    editandoId = null
    form.reset()
    actualizarTipo()
    titulo.textContent = 'Nuevo plato'
    btnCancelar.hidden = true
    mostrarError('')
  }

  async function cargar() {
    const { data, error: err } = await supabase.from('menu_items').select('*').order('category').order('name')
    if (err) {
      lista.textContent = 'No se pudo cargar el menú. Revisá la conexión.'
      return
    }
    platos = data
    dibujar()
  }

  function dibujar() {
    // Sugerencias de categorías ya usadas, para no escribirlas distinto cada vez.
    const categorias = [...new Set(platos.map((p) => p.category).filter(Boolean))]
    datalist.innerHTML = categorias.map((c) => `<option value="${escaparHtml(c)}">`).join('')

    if (!platos.length) {
      lista.textContent = 'Todavía no hay platos. Agregá el primero arriba.'
      return
    }

    // Agrupamos por categoría. Como la consulta ya viene ordenada, el orden se mantiene.
    const grupos = new Map()
    for (const p of platos) {
      const cat = p.category || 'Sin categoría'
      if (!grupos.has(cat)) grupos.set(cat, [])
      grupos.get(cat).push(p)
    }

    lista.innerHTML = [...grupos]
      .map(([cat, items]) => `
        <h3 class="menu-cat">${escaparHtml(cat)}</h3>
        ${items.map((p) => `
          <div class="menu-plato ${p.active ? '' : 'inactivo'}">
            <div class="menu-plato-info">
              <strong>${escaparHtml(p.name)}</strong>
              <span>${p.kind && p.kind !== 'plato' ? `${TIPOS[p.kind] ?? p.kind} · ` : ''}${formatearGs(p.price)}${p.active ? '' : ' · inactivo'}${p.show_on_web === false ? ' · no se ve en la web' : ''}</span>
              ${p.description ? `<small class="menu-desc">${escaparHtml(p.description)}</small>` : ''}
            </div>
            <button type="button" class="btn-chico" data-accion="editar" data-id="${p.id}">Editar</button>
            <button type="button" class="btn-chico" data-accion="toggle" data-id="${p.id}">
              ${p.active ? 'Desactivar' : 'Activar'}
            </button>
          </div>`).join('')}
      `).join('')
  }

  // Un solo listener en la lista (delegación de eventos): sirve para todos los
  // botones aunque se redibujen.
  lista.addEventListener('click', async (e) => {
    const boton = e.target.closest('button[data-id]')
    if (!boton) return
    const plato = platos.find((p) => p.id === boton.dataset.id)
    if (!plato) return

    if (boton.dataset.accion === 'editar') {
      editandoId = plato.id
      form.name.value = plato.name
      form.kind.value = plato.kind || 'plato'
      form.category.value = plato.category ?? ''
      form.price.value = plato.price
      form.description.value = plato.description ?? ''
      form.show_on_web.checked = plato.show_on_web !== false
      actualizarTipo()
      titulo.textContent = 'Editar plato'
      btnCancelar.hidden = false
      mostrarError('')
      form.scrollIntoView({ behavior: 'smooth' })
    } else {
      boton.disabled = true
      const { error: err } = await supabase
        .from('menu_items')
        .update({ active: !plato.active })
        .eq('id', plato.id)
      if (err) {
        boton.disabled = false
        mostrarError('No se pudo cambiar el estado del plato.')
        return
      }
      await cargar()
    }
  })

  btnCancelar.addEventListener('click', resetForm)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const name = form.name.value.trim()
    const kind = form.kind.value
    // Las guarniciones no necesitan categoría: si queda vacía se agrupan solas.
    const category = form.category.value.trim() || (kind === 'guarnicion' ? 'Guarniciones' : '')
    const price = Number(form.price.value)
    const description = form.description.value.trim() || null
    const show_on_web = form.show_on_web.checked

    if (!name || !category) return mostrarError('Completá nombre y categoría.')
    if (!Number.isInteger(price) || price < 0) {
      return mostrarError('El precio tiene que ser un número entero de guaraníes.')
    }

    mostrarError('')
    btnGuardar.disabled = true
    const campos = { name, category, price, kind, description, show_on_web }
    const { error: err } = editandoId
      ? await supabase.from('menu_items').update(campos).eq('id', editandoId)
      : await supabase.from('menu_items').insert({ ...campos, active: true })
    if (err) {
      btnGuardar.disabled = false
      console.error('No se pudo guardar:', err)
      return mostrarError(motivoError(err))
    }

    btnGuardar.disabled = false

    resetForm()
    await cargar()
  })

  await cargar()
}
