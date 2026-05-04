"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Mail, ChevronRight, AlertCircle, BarChart3, BrainCircuit, Zap } from "lucide-react";
import CountUp from 'react-countup';

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Acceso denegado. Verifique credenciales de analista.");
      setLoading(false);
    } else {
      router.push("/");
    }
  };

  // Datos decorativos para el feeling predictivo
  const stats = [
    { label: "Nivel de Certeza IA", value: 94.8, suffix: "%", icon: BrainCircuit },
    { label: "SKUs Monitoreados", value: 1500, suffix: "+", icon: Zap },
  ];

  return (
    <div className="relative flex min-h-screen bg-[#fbfcfb] overflow-hidden font-sans">
      
      {/* SECCIÓN IZQUIERDA: PANEL DE DATOS PREDICTIVOS ( feeling tecnológico ) */}
      <div className="relative hidden lg:flex lg:w-1/2 bg-white border-r border-slate-100 flex-col justify-between p-16 overflow-hidden">
        
        {/* Patrón de red sutil en el fondo */}
        <div className="absolute inset-0 opacity-[0.03]" 
             style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'\%2384cc16\' fill-opacity=\'0.4\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} 
        />

        <div className="relative z-10">
          <img src="/logo.png" alt="ARES Logo" className="h-14 w-auto mb-16 drop-shadow-sm" />
          
          <motion.div initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} transition={{delay:0.2}} className="space-y-4 max-w-lg">
            <h1 className="text-5xl font-extrabold text-slate-950 tracking-tighter leading-tight uppercase italic">
              Predicción de <span className="text-[#84cc16] not-italic">Demanda</span> y Suministros
            </h1>
            <p className="text-xl text-slate-600 font-medium leading-relaxed">
              Plataforma avanzada de Inteligencia para la optimización de compras de Materia Prima y Suministros.
            </p>
          </motion.div>
        </div>

        {/* STATS PANELES (Feeling de Dashboard) */}
        <div className="relative z-10 grid grid-cols-2 gap-8">
          {stats.map((stat, i) => (
            <motion.div 
              key={i}
              initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} transition={{delay: 0.4 + (i*0.1)}}
              className="bg-[#f7faf7] border border-[#e8f1e8] p-8 rounded-3xl flex items-start gap-6 shadow-sm"
            >
              <div className="p-3 bg-white rounded-xl text-[#84cc16] border border-[#e8f1e8] shadow-inner">
                <stat.icon size={28} strokeWidth={1.5}/>
              </div>
              <div>
                <div className="text-4xl font-black text-slate-950 tracking-tight">
                  <CountUp end={stat.value} decimals={stat.value % 1 !== 0 ? 1 : 0} duration={3} />
                  <span className="text-[#84cc16] ml-1">{stat.suffix}</span>
                </div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mt-1">{stat.label}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* SECCIÓN DERECHA: FORMULARIO DE LOGINS ( Glassmorphism Light ) */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 md:p-16 relative">
        
        {/* Decoración geométrica sutil */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#84cc16]/5 rounded-bl-full blur-[60px]" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md relative z-10"
        >
          {/* Logo para versión móvil (oculto en escritorio) */}
          <div className="lg:hidden flex justify-center mb-10">
            <img src="/logo.png" alt="ARES Logo" className="h-12 w-auto" />
          </div>

          {/* CARD WHITE - Efecto de Elevación Avanzada */}
          <div className="bg-white/80 backdrop-blur-xl border border-slate-100 p-10 rounded-[2.5rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.06)]">
            
            <div className="flex items-center gap-4 mb-10 pb-6 border-b border-slate-100">
                <div className="p-3 bg-[#f0f9f0] text-[#84cc16] rounded-2xl border border-[#e1f1e1]">
                    <BarChart3 size={24}/>
                </div>
                <div>
                    <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Módulo de Inteligencia</h2>
                    <p className="text-2xl font-black text-slate-900 tracking-tighter uppercase italic">Confirme sus <span className="text-[#84cc16] not-italic">Credenciales</span></p>
                </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2 relative">
                <Mail className="absolute left-4 top-[48px] text-slate-300 transition-colors group-focus-within:text-[#84cc16]" size={20} />
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-1">Email Corporativo</label>
                <input
                  type="email"
                  className="w-full bg-slate-50 border border-slate-100 p-4 pl-12 rounded-xl text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-[#84cc16]/10 focus:border-[#84cc16] transition-all placeholder:text-slate-300 text-sm font-medium"
                  placeholder="tunonmbre@aresperu.com"
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2 relative">
                <Lock className="absolute left-4 top-[48px] text-slate-300 transition-colors group-focus-within:text-[#84cc16]" size={20} />
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-1">Clave de Acceso</label>
                <input
                  type="password"
                  className="w-full bg-slate-50 border border-slate-100 p-4 pl-12 rounded-xl text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-[#84cc16]/10 focus:border-[#84cc16] transition-all placeholder:text-slate-300 text-sm"
                  placeholder="••••••••"
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{opacity: 0}} className="flex items-center gap-3 text-red-600 bg-red-50 p-4 rounded-xl border border-red-100 text-xs font-semibold shadow-inner">
                    <AlertCircle size={18} />
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button
                whileHover={{ scale: 1.02, backgroundColor: "#76b813" }}
                whileTap={{ scale: 0.98 }}
                disabled={loading}
                className="w-full bg-[#84cc16] p-5 text-white font-extrabold rounded-xl shadow-lg shadow-[#84cc16]/30 transition-all flex items-center justify-center gap-3 disabled:opacity-50 uppercase tracking-widest text-sm"
              >
                {loading ? "VERIFICANDO..." : "ACCEDER AL MOTOR PREDICTIVO"}
                {!loading && <ChevronRight size={20} className="mt-0.5" />}
              </motion.button>
            </form>
          </div>
          
          <footer className="mt-12 text-center text-slate-400 text-[10px] font-medium tracking-[0.2em] uppercase">
            ARES IBP Planning Core v1.0 | © 2026 Supply Chain
            <br/>
            <br/>
            Desarrollaod por Alber Hernández
          </footer>
        </motion.div>
      </div>
    </div>
  );
}