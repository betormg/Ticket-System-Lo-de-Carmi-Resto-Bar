// Punto de entrada de la app. Vite carga este archivo desde index.html.
import './style.css'
import { supabase } from './supabase.js'
import { mostrarLogin } from './pantallas/login.js'
import { mostrarCaja } from './pantallas/caja.js'
import { mostrarMenu } from './pantallas/menu.js'
import { mostrarStock } from './pantallas/stock.js'
import { mostrarPedidos } from './pantallas/pedidos.js'

const app = document.getElementById('app')

// Pantallas disponibles en la navegación. Para sumar una nueva (Caja, Stock…)
// alcanza con importarla y agregar una línea acá.
const pantallas = [
  { id: 'caja', titulo: 'Caja', mostrar: mostrarCaja },
  { id: 'menu', titulo: 'Menú', mostrar: mostrarMenu },
  { id: 'stock', titulo: 'Stock', mostrar: mostrarStock },
  { id: 'pedidos', titulo: 'Pedidos', mostrar: mostrarPedidos },
]

// Estructura con la barra de navegación y un contenedor donde va la pantalla activa.
function mostrarApp() {
  app.innerHTML = `
    <nav class="nav">
      ${pantallas.map((p) => `<button type="button" data-id="${p.id}">${p.titulo}</button>`).join('')}
      <button type="button" class="nav-salir">Salir</button>
    </nav>
    <main id="contenido"></main>
  `
  const contenido = document.getElementById('contenido')

  function ir(id) {
    const pantalla = pantallas.find((p) => p.id === id)
    app.querySelectorAll('.nav button[data-id]').forEach((b) =>
      b.classList.toggle('activa', b.dataset.id === id))
    pantalla.mostrar(contenido)
  }

  app.querySelector('.nav').addEventListener('click', (e) => {
    const boton = e.target.closest('button')
    if (!boton) return
    if (boton.classList.contains('nav-salir')) supabase.auth.signOut()
    else ir(boton.dataset.id)
  })

  ir(pantallas[0].id)
}

function render(sesion) {
  if (sesion) mostrarApp()
  else mostrarLogin(app)
}

// supabase-js guarda la sesión en localStorage y la renueva solo, así que al
// recargar getSession() la devuelve y no hay que loguearse de nuevo.
const { data } = await supabase.auth.getSession()
render(data.session)

// Después, cada login/logout dispara este evento. Ignoramos TOKEN_REFRESHED
// para no redibujar la pantalla cada vez que se renueva el token.
supabase.auth.onAuthStateChange((evento, sesion) => {
  if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') render(sesion)
})
