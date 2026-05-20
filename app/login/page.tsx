"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Mail, ChevronRight, AlertCircle, BarChart3, BrainCircuit, Zap, Eye, EyeOff } from "lucide-react";
import CountUp from 'react-countup';

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.status === 400 ? "Credenciales incorrectas. Verifique el correo o contraseña." : authError.message);
      setLoading(false);
    } else {
      // Redirección directa al flujo de predicciones y compras proyectadas
      router.push("/importaciones/predicciones");
    }
  };

  const stats = [
    { label: "Nivel de Certeza Estadístico", value: 94.8, suffix: "%", icon: BrainCircuit },
    { label: "SKUs Monitoreados", value: 1500, suffix: "+", icon: Zap },
  ];

  return (
    <div className="relative flex min-h-screen bg-slate-50 overflow-hidden font-sans select-none antialiased text-slate-900">
      
      {/* SECCIÓN IZQUIERDA: PANEL DE DATOS PREDICTIVOS */}
      <div className="relative hidden lg:flex lg:w-1/2 bg-white border-r border-slate-200/60 flex-col justify-between p-16 overflow-hidden">
        
        {/* Patrón de red corporativo sutil monocromático */}
        <div className="absolute inset-0 opacity-[0.015]" 
             style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'\%230f172a\' fill-opacity=\'0.8\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} 
        />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-16">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white text-sm font-bold font-mono shadow-md">A</div>
            <span className="text-sm font-bold tracking-wider uppercase text-slate-800">Sistema Predicitivo Ares Group </span>
          </div>
          
          <motion.div initial={{opacity:0, y:12}} animate={{opacity:1, y:0}} transition={{duration: 0.4}} className="space-y-4 max-w-lg">
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
              Proyección de <span className="text-slate-800 underline decoration-slate-300 decoration-4 underline-offset-4">Demanda</span> <br /> y Flujo de Compras.
            </h1>
            <p className="text-sm text-slate-500 font-medium leading-relaxed">
              Plataforma analítica para la simulación de importaciones, cálculo de Lead Times y abastecimiento de materias primas.
            </p>
          </motion.div>
        </div>

        {/* METRICAS (Estilo Linear / Vercel) */}
        <div className="relative z-10 grid grid-cols-2 gap-6">
          {stats.map((stat, i) => (
            <motion.div 
              key={i}
              initial={{opacity:0, y:12}} animate={{opacity:1, y:0}} transition={{delay: 0.15 + (i*0.08)}}
              className="bg-slate-50 border border-slate-200/50 p-5 rounded-xl flex items-center gap-4 shadow-xs"
            >
              <div className="p-2.5 bg-white rounded-lg text-slate-700 border border-slate-200/60 shadow-xs">
                <stat.icon size={20} strokeWidth={2}/>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900 tracking-tight">
                  <CountUp end={stat.value} decimals={stat.value % 1 !== 0 ? 1 : 0} duration={2} />
                  <span className="text-slate-500 text-lg font-medium ml-0.5">{stat.suffix}</span>
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{stat.label}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* SECCIÓN DERECHA: FORMULARIO DE ACCESO */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-16 relative bg-slate-50">
        
        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md relative z-10"
        >
          {/* Logo móvil */}
          <div className="lg:hidden flex justify-center items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white text-sm font-bold font-mono">A</div>
            <span className="text-sm font-bold tracking-wider uppercase text-slate-800">Ares System</span>
          </div>

          {/* CARD DE LOGIN */}
          <div className="bg-white border border-slate-200/60 p-8 md:p-10 rounded-2xl shadow-sm">
            
            <div className="flex items-center gap-3.5 mb-8 pb-5 border-b border-slate-100">
              <div className="p-2.5 bg-slate-50 text-slate-800 rounded-lg border border-slate-200/60 shadow-xs">
                <BarChart3 size={18}/>
              </div>
              <div>
                <h2 className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.18em]">Módulo Control de Compras</h2>
                <p className="text-lg font-bold text-slate-900 tracking-tight">Ingreso al Sistema</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              {/* INPUT: EMAIL */}
              <div className="space-y-1.5 relative group">
                <label className="text-[11px] font-bold text-slate-500 tracking-tight ml-0.5">Correo Corporativo</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" size={16} />
                  <input
                    type="email"
                    className="w-full bg-slate-50 border border-slate-200 p-3 pl-10 rounded-lg text-slate-800 outline-none focus:bg-white focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 transition-all placeholder:text-slate-400 text-xs font-medium"
                    placeholder="ejemplo@aresperu.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* INPUT: PASSWORD */}
              <div className="space-y-1.5 relative group">
                <label className="text-[11px] font-bold text-slate-500 tracking-tight ml-0.5">Clave de Acceso</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" size={16} />
                  <input
                    type={showPassword ? "text" : "password"}
                    className="w-full bg-slate-50 border border-slate-200 p-3 pl-10 pr-10 rounded-lg text-slate-800 outline-none focus:bg-white focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 transition-all placeholder:text-slate-400 text-xs font-medium"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* ALERTA DE ERROR */}
              <AnimatePresence mode="wait">
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -6 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: -6 }} 
                    className="flex items-start gap-2.5 text-slate-800 bg-red-50 p-3 rounded-lg border border-red-200/60 text-[11px] font-medium shadow-xs"
                  >
                    <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-600" />
                    <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* BOTÓN DE LOGIN */}
              <motion.button
                whileHover={{ y: -0.5 }}
                whileTap={{ y: 0 }}
                disabled={loading}
                className="w-full bg-slate-900 hover:bg-slate-800 active:bg-slate-950 p-3 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-60 text-xs tracking-wide shadow-sm"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Procesando acceso...
                  </span>
                ) : (
                  <>
                    Ingresar al Sistema Predictivo
                    <ChevronRight size={14} />
                  </>
                )}
              </motion.button>
            </form>
          </div>
          
          <footer className="mt-8 text-center text-slate-600 text-[12px] font-medium tracking-wider space-y-1">
            <p>ARES Planning Core v1.0 | © 2026 Supply Chain</p>
            <p className="text-slate-600 font-semibold">Desarrollado por Alber Hernández</p>
          </footer>
        </motion.div>
      </div>
    </div>
  );
}