"use client";
import React, { useState } from "react";
import Link from "next/link"; // Usamos Link para navegación instantánea sin recargas
import { motion } from "framer-motion";
import { useGlobalData } from "@/lib/DataContext"; // Validamos el estado global
import { supabase } from "@/lib/supabase"; // 💡 IMPORTANTE: Usamos tu cliente nativo centralizado
import { 
  BrainCircuit, Truck, BarChart3, Clock, 
  CloudUpload, ArrowRight, Activity, TrendingUp,
  Mail, Loader2 
} from "lucide-react";

export default function LaunchpadPage() {
  // Consumimos el contexto global. Al estar mapeado aquí, Next.js mantiene viva la memoria
  const { productos, loading } = useGlobalData();

  // 💡 ESTADOS PARA EL BOTÓN DE ENVÍO MANUAL
  const [enviando, setEnviando] = useState(false);
  const [notificacion, setNotificacion] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null);

  // 🚀 FUNCIÓN OPTIMIZADA USANDO EL SDK NATIVO DE SUPABASE
  const handleEnviarInformeManual = async () => {
    setEnviando(true);
    setNotificacion(null);

    try {
      // El SDK maneja de forma automática las URLs, la Anon Key, la autorización y los pre-flights CORS
      const { data, error } = await supabase.functions.invoke('alerta-abastecimiento', {
        method: 'POST',
        body: {}
      });

      // Si el servidor o la función retornan un error, lo atrapamos aquí
      if (error) throw error;

      setNotificacion({
        tipo: 'exito',
        texto: `¡Informe enviado a Alfredo con éxito! (${data?.comprarYa || 0} críticos).`
      });
      setTimeout(() => setNotificacion(null), 5000);

    } catch (error: any) {
      console.error("Error detallado al invocar la función:", error);
      setNotificacion({
        tipo: 'error',
        texto: `No se pudo enviar: ${error.message || 'Error de comunicación o CORS.'}`
      });
    } finally {
      setEnviando(false);
    }
  };

  const modules = [
    {
      title: "Predicciones de Abastecimiento",
      description: "Simulador de quiebres de stock y cálculo automatizado del flujo de compras proyectado.",
      path: "/importaciones/predicciones",
      icon: <BrainCircuit size={20} />,
      badge: "Motor Estadístico"
    },
    {
      title: "Consumos Promedios",
      description: "Cálculo, revisión y ajuste de promedios móviles e históricos para bases de reaprovisionamiento.",
      path: "/importaciones/promedios",
      icon: <TrendingUp size={20} />,
      badge: "Cálculos"
    },
    {
      title: "Gestión de Arribos",
      description: "Monitoreo de importaciones y compras en tránsito. Simulación de ingresos a la línea de tiempo.",
      path: "/importaciones/arribos",
      icon: <Truck size={20} />,
      badge: "Tránsito"
    },
    {
      title: "Monitor de Lead Times",
      description: "Análisis histórico de tiempos de entrega de proveedores y desviaciones logísticas.",
      path: "/importaciones/lead-time",
      icon: <Clock size={20} />,
    },
    {
      title: "Cronología",
      description: "Análisis histórico de tiempos de entrega de proveedores y desviaciones logísticas.",
      path: "/importaciones/cronologia",
      icon: <Clock size={20} />,
    },
    {
      title: "Panel de KPIs de Compras",
      description: "Visualización de volúmenes, presupuestos requeridos por mes y códigos críticos a comprar.",
      path: "/importaciones/kpis",
      icon: <BarChart3 size={20} />,
    },
    {
      title: "Carga de Datos Iniciales",
      description: "Consola de importación para actualizar la foto del Stock Actual y la Tabla de Movimientos.",
      path: "/importaciones/cargar-datos",
      icon: <CloudUpload size={20} />,
    },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-white p-8 md:p-12 flex flex-col justify-between select-none">
      <div className="max-w-5xl mx-auto w-full space-y-10">
        
        {/* ENCABEZADO DE BIENVENIDA */}
        <div className="space-y-2 border-b border-slate-100 pb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Panel de Operaciones
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Selecciona un módulo para trabajar
            </p>
          </div>
          
          {/* CONTENEDOR DE ACCIONES */}
          <div className="flex flex-col items-end gap-2 w-full sm:w-auto relative">
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
              
              <button
                onClick={handleEnviarInformeManual}
                disabled={enviando}
                className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 px-3 py-1.5 rounded-md border transition-all duration-150 ${
                  enviando 
                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" 
                    : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800 cursor-pointer shadow-xs"
                }`}
              >
                {enviando ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Enviando a Alfredo...
                  </>
                ) : (
                  <>
                    <Mail size={12} />
                    Enviar informe por correo electrónico
                  </>
                )}
              </button>

              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 px-2.5 py-1.5 rounded-md h-[28px]">
                <div className={`w-1.5 h-1.5 rounded-full ${loading ? "bg-amber-500 animate-spin" : "bg-emerald-500"}`} />
                {loading ? "Sincronizando caché..." : `${productos?.length || 0} SKUs en memoria`}
              </div>
            </div>

            {/* NOTIFICACIONES FLOTANTES */}
            {notificacion && (
              <motion.div 
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`absolute top-9 z-10 text-[11px] font-medium px-3 py-1.5 rounded-md border shadow-xs max-w-xs text-right whitespace-nowrap ${
                  notificacion.tipo === 'exito' 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {notificacion.texto}
              </motion.div>
            )}
          </div>
        </div>

        {/* CONTENEDOR DE TARJETAS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {modules.map((mod, i) => (
            <Link key={mod.path} href={mod.path} passHref className="block">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className="group relative bg-slate-50 hover:bg-slate-900 border border-slate-200/60 hover:border-slate-900 p-6 rounded-xl transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[140px] shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-white text-slate-800 rounded-lg border border-slate-200/60 group-hover:bg-slate-800 group-hover:text-white group-hover:border-slate-700 shadow-xs transition-colors">
                      {mod.icon}
                    </div>
                    {mod.badge && (
                      <span className="text-[9px] font-bold tracking-wider uppercase bg-white border border-slate-200 text-slate-500 group-hover:bg-slate-800 group-hover:text-slate-300 group-hover:border-slate-700 px-2 py-0.5 rounded-md transition-colors">
                        {mod.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-white transition-colors tracking-tight">
                    {mod.title}
                  </h3>
                  <p className="text-xs text-slate-500 group-hover:text-slate-400 transition-colors mt-1.5 font-medium leading-relaxed max-w-sm">
                    {mod.description}
                  </p>
                </div>

                <div className="flex justify-end mt-4">
                  <ArrowRight size={14} className="text-slate-400 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      </div>

      {/* FOOTER */}
      <div className="max-w-5xl mx-auto w-full pt-10 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] font-medium text-slate-400 tracking-wider">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1"><Activity size={12} /> Servidores estables</span>
        </div>
        <p>SISTEMA DE PLANEAMIENTO Y PREDICCION DE COMPRAS DE MATERIA PRIMA</p>
      </div>
    </div>
  );
}