// Pantalla de login: email + contraseña con Supabase Auth.
// No hay registro: Roberto crea los usuarios en el panel de Supabase.
import { supabase } from '../supabase.js'

// Traduce los errores de Supabase a mensajes claros para el local.
function mensajeError(error) {
  if (error.message === 'Invalid login credentials') {
    return 'Email o contraseña incorrectos.'
  }
  if (error.message?.includes('Failed to fetch')) {
    return 'No hay conexión. Revisá internet e intentá de nuevo.'
  }
  return 'No se pudo iniciar sesión. Intentá de nuevo.'
}

// Dibuja el login dentro de `contenedor`. No sabe nada de qué pantalla viene
// después: el cambio de pantalla lo decide main.js escuchando la sesión.
export function mostrarLogin(contenedor) {
  contenedor.innerHTML = `
    <main class="login">
      <form class="login-form" novalidate>
        <h1>Lo de Carmi</h1>
        <p class="login-sub">Caja</p>
        <label>Email
          <input type="email" name="email" autocomplete="username" required />
        </label>
        <label>Contraseña
          <input type="password" name="password" autocomplete="current-password" required />
        </label>
        <p class="login-error" role="alert" hidden></p>
        <button type="submit" class="btn-grande">Entrar</button>
      </form>
    </main>
  `

  const form = contenedor.querySelector('form')
  const error = contenedor.querySelector('.login-error')
  const boton = contenedor.querySelector('button')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    error.hidden = true

    const email = form.email.value.trim()
    const password = form.password.value
    if (!email || !password) {
      error.textContent = 'Completá email y contraseña.'
      error.hidden = false
      return
    }

    // Deshabilitamos el botón para evitar toques dobles mientras espera.
    boton.disabled = true
    boton.textContent = 'Entrando…'

    const { error: errLogin } = await supabase.auth.signInWithPassword({ email, password })

    if (errLogin) {
      error.textContent = mensajeError(errLogin)
      error.hidden = false
      boton.disabled = false
      boton.textContent = 'Entrar'
    }
    // Si salió bien no hacemos nada: main.js se entera por onAuthStateChange.
  })
}
