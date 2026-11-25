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
        <p class="menu-ayuda" hidden>Las guarniciones no necesitan stock: alcanza con que estén activas. Para ofrecerlas, editá cada plato y tildá las que lleva.</p>
        <fieldset class="menu-guarn" hidden>
          <legend>Guarniciones de este plato (se eligen en la web)</legend>
          <div class="menu-guarn-lista"></div>
        </fieldset>
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

  // Tipos de ítem. "guarnicion" la usa la página web: se elige junto a cada plato.
  const TIPOS = { plato: 'Plato', guarnicion: 'Guarnición', bebida: 'Bebida', postre: 'Postre' }

  // Para una guarnición el precio es un recargo (0 = viene incluida con el plato).
  function actualizarTipo() {
    const esGuarnicion = form.kind.value === 'guarnicion'
    precioLabel.textContent = esGuarnicion ? 'Recargo (Gs, 0 si viene incluida)' : 'Precio (Gs)'
    ayuda.hidden = !esGuarnicion
    // Sin la tabla de relación no hay casillas: la web ofrece todas las guarniciones con todos los platos.
    ayuda.textContent = relacionesOk
      ? 'Las guarniciones no necesitan stock: alcanza con que estén activas. Para ofrecerlas, editá cada plato y tildá las que lleva.'
      : 'Las guarniciones no necesitan stock: alcanza con que estén activas. La web las ofrece con todos los platos.'
    pintarGuarn(marcadas())
  }
  form.kind.addEventListener('change', actualizarTipo)

  let platos = []
  let editandoId = null // null = estamos agregando uno nuevo

  // Qué guarniciones acepta cada plato: plato_id -> Set de guarnicion_id (tabla plato_guarniciones).
  // Si la tabla todavía no existe, relacionesOk queda en falso y la pantalla funciona igual, sin las casillas.
  let relaciones = new Map()
  let relacionesOk = true
  const fsGuarn = form.querySelector('.menu-guarn')
  const guarnLista = form.querySelector('.menu-guarn-lista')

  const guarnicionesActivas = () => platos.filter((p) => p.kind === 'guarnicion' && p.active)
  const marcadas = () => new Set([...guarnLista.querySelectorAll('input:checked')].map((i) => i.value))

  // Dibuja las casillas. Solo se muestran al editar o crear un plato (no una guarnición, bebida o postre).
  function pintarGuarn(seleccion) {
    const mostrar = relacionesOk && form.kind.value === 'plato'
    fsGuarn.hidden = !mostrar
    if (!mostrar) return
    const gs = guarnicionesActivas()
    guarnLista.innerHTML = gs.length
      ? gs.map((g) => `
          <label class="menu-check">
            <input type="checkbox" value="${g.id}" ${seleccion.has(g.id) ? 'checked' : ''} />
            ${escaparHtml(g.name)}${g.price > 0 ? ` (+${formatearGs(g.price)})` : ''}
          </label>`).join('')
      : '<p class="menu-ayuda">Todavía no hay guarniciones activas. Cargalas arriba con Tipo: Guarnición.</p>'
  }

  // Guarda las casillas. Solo toca las guarniciones activas que se ven: si una está desactivada,
  // su vínculo con el plato se conserva por si se vuelve a activar.
  async function guardarGuarniciones(platoId) {
    const elegidas = [...marcadas()]
    const quitar = guarnicionesActivas().map((g) => g.id).filter((id) => !elegidas.includes(id))
    if (elegidas.length) {
      const { error: e1 } = await supabase
        .from('plato_guarniciones')
        .upsert(elegidas.map((g) => ({ plato_id: platoId, guarnicion_id: g })), { onConflict: 'plato_id,guarnicion_id' })
      if (e1) return e1
    }
    if (quitar.length) {
      const { error: e2 } = await supabase
        .from('plato_guarniciones')
        .delete()
        .eq('plato_id', platoId)
        .in('guarnicion_id', quitar)
      if (e2) return e2
    }
    return null
  }

  function mostrarError(texto) {
    error.textContent = texto
    error.hidden = !texto
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
    const [itemsRes, relRes] = await Promise.all([
      supabase.from('menu_items').select('*').order('category').order('name'),
      supabase.from('plato_guarniciones').select('plato_id, guarnicion_id'),
    ])
    if (itemsRes.error) {
      lista.textContent = 'No se pudo cargar el menú. Revisá la conexión.'
      return
    }
    platos = itemsRes.data
    relacionesOk = !relRes.error
    relaciones = new Map()
    for (const r of relRes.data ?? []) {
      if (!relaciones.has(r.plato_id)) relaciones.set(r.plato_id, new Set())
      relaciones.get(r.plato_id).add(r.guarnicion_id)
    }
    dibujar()
  }

  // Línea "Guarniciones: Puré, Ensalada" bajo cada plato (solo las activas, que son las que se ofrecen).
  function guarnicionesDe(plato) {
    if (!relacionesOk || plato.kind !== 'plato') return ''
    const ids = relaciones.get(plato.id) ?? new Set()
    const nombres = guarnicionesActivas().filter((g) => ids.has(g.id)).map((g) => escaparHtml(g.name))
    return `<small class="menu-desc">${nombres.length ? `Guarniciones: ${nombres.join(', ')}` : 'Sin guarniciones'}</small>`
  }

  function dibujar() {
    // Sugerencias de categorías ya usadas, para no escribirlas distinto cada vez.
    const categorias = [...new Set(platos.map((p) => p.category).filter(Boolean))]
    datalist.innerHTML = categorias.map((c) => `<option value="${escaparHtml(c)}">`).join('')
    pintarGuarn(marcadas()) // la lista de guarniciones pudo cambiar

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
              ${guarnicionesDe(p)}
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
      pintarGuarn(relaciones.get(plato.id) ?? new Set())
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
    let platoId = editandoId
    let err
    if (editandoId) {
      ;({ error: err } = await supabase.from('menu_items').update(campos).eq('id', editandoId))
    } else {
      // .select('id') devuelve el id del plato nuevo, que hace falta para guardar sus guarniciones.
      const res = await supabase.from('menu_items').insert({ ...campos, active: true }).select('id').single()
      err = res.error
      platoId = res.data?.id
    }
    if (err) {
      btnGuardar.disabled = false
      return mostrarError('No se pudo guardar el plato. Intentá de nuevo.')
    }

    // Guarniciones: solo para platos, y solo si la tabla existe.
    const errGuarn = relacionesOk && kind === 'plato' ? await guardarGuarniciones(platoId) : null
    btnGuardar.disabled = false

    resetForm()
    await cargar()
    if (errGuarn) mostrarError('El plato se guardó, pero no se pudieron guardar las guarniciones. Editalo y probá de nuevo.')
  })

  await cargar()
}
