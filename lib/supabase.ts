// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// NOTA: Asegúrate de tener tu SUPABASE_SERVICE_ROLE_KEY en tu archivo .env.local
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Cliente estándar (Sujeto a RLS - Para auth e interfaz)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cliente administrativo (Bypassea RLS - Para cargas masivas seguras)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)