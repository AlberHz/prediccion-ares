// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// NOTA: La Service Key NUNCA debe exponerse al cliente con NEXT_PUBLIC_.
// Si este archivo corre en el navegador, usará la anon key de respaldo de forma segura.
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey

// 1. Cliente estándar (Sujeto a RLS - Para auth e interfaz en el navegador)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 2. Cliente administrativo (Para operaciones del servidor / cargas masivas)
// 💡 Desactivamos el almacenamiento de Auth aquí para evitar el conflicto de GoTrueClient
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,     // Evita que intente escribir en el localStorage del navegador
    autoRefreshToken: false,  // Evita bucles de refresco concurrentes
    detectSessionInUrl: false // No compite por capturar tokens en la URL
  }
})