// Cliente único de Supabase. Las variables VITE_* se leen de .env;
// Vite solo expone al navegador las que empiezan con VITE_.
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
)
