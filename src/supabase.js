// Cliente único de Supabase. Las variables VITE_* se leen de .env;
// Vite solo expone al navegador las que empiezan con VITE_.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Vite "hornea" las variables en el build: si en Vercel faltan al momento de
// construir, la app queda rota. Este error lo hace evidente en la consola.
if (!url || !key) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. ' +
      'Cargalas en .env (local) o en Vercel > Settings > Environment Variables y volvé a desplegar.'
  )
}

export const supabase = createClient(url, key)
