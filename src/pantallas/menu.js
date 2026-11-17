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
        <label>Categoría <input name="category" list="categorias" required /></label>
        <datalist id="categorias"></datalist>
        <label>Precio (Gs) <input name="price" type="number" inputmode="numeric" min="0" step="500" required /></label>
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

  let platos = []
  let editandoId = null // null = estamos agregando uno nuevo

  function mostrarError(texto) {
    error.textContent = texto
    error.hidden = !texto
  }

  function resetForm() {
    editandoId = null
    form.reset()
    titulo.textContent = 'Nuevo plato'
    btnCancelar.hidden = true
    mostrarError('')
  }

  async function cargar() {
    const { data, error: err } = await supabase
      .from('menu_items')
      .select('*')
      .order('category')
      .order('name')
    if (err) {
      lista.textContent = 'No se pudo cargar el menú. Revisá la conexión.'
      return
    }
    platos = data
    dibujar()
  }

  function dibujar() {
    // Sugerencias de categorías ya usadas, para no escribirlas distinto cada vez.
    const categorias = [...new Set(platos.map((p) => p.category))]
    datalist.innerHTML = categorias.map((c) => `<option value="${escaparHtml(c)}">`).join('')

    if (!platos.length) {
      lista.textContent = 'Todavía no hay platos. Agregá el primero arriba.'
      return
    }

    // Agrupamos por categoría. Como la consulta ya viene ordenada, el orden se mantiene.
    const grupos = new Map()
    for (const p of platos) {
      if (!grupos.has(p.category)) grupos.set(p.category, [])
      grupos.get(p.category).push(p)
    }

    lista.innerHTML = [...grupos]
      .map(([cat, items]) => `
        <h3 class="menu-cat">${escaparHtml(cat)}</h3>
        ${items.map((p) => `
          <div class="menu-plato ${p.active ? '' : 'inactivo'}">
            <div class="menu-plato-info">
              <strong>${escaparHtml(p.name)}</strong>
              <span>${formatearGs(p.price)}${p.active ? '' : ' · inactivo'}</span>
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
      form.category.value = plato.category
      form.price.value = plato.price
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
    const category = form.category.value.trim()
    const price = Number(form.price.value)

    if (!name || !category) return mostrarError('Completá nombre y categoría.')
    if (!Number.isInteger(price) || price < 0) {
      return mostrarError('El precio tiene que ser un número entero de guaraníes.')
    }

    mostrarError('')
    btnGuardar.disabled = true
    const campos = { name, category, price }
    const { error: err } = editandoId
      ? await supabase.from('menu_items').update(campos).eq('id', editandoId)
      : await supabase.from('menu_items').insert({ ...campos, active: true })
    btnGuardar.disabled = false

    if (err) return mostrarError('No se pudo guardar el plato. Intentá de nuevo.')
    resetForm()
    await cargar()
  })

  await cargar()
}
