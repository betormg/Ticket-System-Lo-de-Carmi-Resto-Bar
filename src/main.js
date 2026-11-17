// Punto de entrada de la app. Vite carga este archivo desde index.html.
import './style.css'
import { supabase } from './supabase.js'
import { mostrarLogin } from './pantallas/login.js'

const app = document.getElementById('app')

// Pantalla provisoria para quien ya tiene sesión (se reemplaza por la Caja).
function mostrarHola(sesion) {
  app.innerHTML = `
    <main class="login">
      <div class="login-form">
        <h1>Hola</h1>
        <p class="login-sub">${sesion.user.email}</p>
        <button type="button" class="btn-grande" id="salir">Salir</button>
      </div>
    </main>
  `
  document.getElementById('salir').addEventListener('click', () => supabase.auth.signOut())
}

function render(sesion) {
  if (sesion) mostrarHola(sesion)
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
