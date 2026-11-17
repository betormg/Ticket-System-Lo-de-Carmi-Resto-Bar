// Pantalla de Reportes: ventas de un día (total y por forma de pago) y ranking de platos.
import { supabase } from '../supabase.js'
import { formatearGs, escaparHtml } from '../utils.js'
import { hoyAsuncion } from './stock.js'

export async function mostrarReportes(contenedor) {
  contenedor.innerHTML = `
    <section class="pantalla">
      <h2>Reportes</h2>
      <label class="reporte-fecha">Fecha
        <input type="date" id="rep-fecha" value="${hoyAsuncion()}" max="${hoyAsuncion()}">
      </label>
      <p class="login-error" role="alert" hidden></p>
      <div class="reporte-cuerpo">Cargando…</div>
    </section>
  `
  const inputFecha = contenedor.querySelector('#rep-fecha')
  const cuerpo = contenedor.querySelector('.reporte-cuerpo')
  const error = contenedor.querySelector('.login-error')

  async function cargar() {
    const fecha = inputFecha.value
    error.hidden = true
    if (!fecha) return
    cuerpo.textContent = 'Cargando…'

    // Las dos vistas se piden en paralelo, filtradas por la fecha elegida.
    // El ranking se ordena de mayor a menor por lo recaudado.
    const [diaRes, platosRes] = await Promise.all([
      supabase.from('v_ventas_por_dia').select('*').eq('fecha', fecha).maybeSingle(),
      supabase.from('v_ventas_por_plato').select('*').eq('fecha', fecha)
        .order('recaudado', { ascending: false }),
    ])
    // Si el usuario cambió la fecha mientras cargaba, descartamos esta respuesta.
    if (fecha !== inputFecha.value) return

    if (diaRes.error || platosRes.error) {
      cuerpo.textContent = ''
      error.textContent = 'No se pudo cargar el reporte. Revisá la conexión.'
      error.hidden = false
      return
    }

    const dia = diaRes.data
    if (!dia) {
      cuerpo.innerHTML = '<p>No hay ventas en esta fecha.</p>'
      return
    }

    const formas = [
      ['Efectivo', dia.efectivo],
      ['Transferencia', dia.transferencia],
      ['Tarjeta', dia.tarjeta],
      ['Pendiente de cobro', dia.pendiente_cobro],
    ]
    cuerpo.innerHTML = `
      <article class="pedido">
        <p class="pedido-total"><span>Total vendido</span><span>${formatearGs(dia.total_vendido)}</span></p>
        <p class="ticket-meta">${dia.pedidos} pedido${dia.pedidos === 1 ? '' : 's'}</p>
        <ul class="pedido-items">
          ${formas.map(([nombre, monto]) => `
            <li><span>${nombre}</span><span>${formatearGs(monto ?? 0)}</span></li>`).join('')}
        </ul>
      </article>
      <h3 class="menu-cat">Platos más vendidos</h3>
      <article class="pedido">
        <ul class="pedido-items">
          ${platosRes.data.map((p, i) => `
            <li><span>${i + 1}. ${escaparHtml(p.plato)} <small>(${p.unidades} u.)</small></span>
            <span>${formatearGs(p.recaudado)}</span></li>`).join('')}
        </ul>
      </article>
    `
  }

  inputFecha.addEventListener('change', cargar)
  await cargar()
}
