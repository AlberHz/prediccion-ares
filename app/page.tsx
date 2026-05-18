"use client";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { 
  BrainCircuit, Truck, BarChart3, Clock, 
  CloudUpload, ArrowRight, Activity, DollarSign 
} from "lucide-react";

export default function LaunchpadPage() {
  const router = useRouter();

  const modules = [
    {
      title: "Predicciones de Abastecimiento",
      description: "Simulador de quiebres de stock y cálculo automatizado del flujo de compras proyectado.",
      path: "/importaciones/predicciones",
      icon: <BrainCircuit size={20} />,
      badge: "Motor Estadístico"
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
        <div className="space-y-2 border-b border-slate-100 pb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Panel de Operaciones
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Selecciona un módulo
          </p>
        </div>

        {/* CONTENEDOR DE TARJETAS / MÓDULOS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {modules.map((mod, i) => (
            <motion.div
              key={mod.path}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              onClick={() => router.push(mod.path)}
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
          ))}
        </div>
      </div>

      {/* FOOTER INTERNO DEL LAUNCHPAD */}
      <div className="max-w-5xl mx-auto w-full pt-10 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] font-medium text-slate-400 tracking-wider">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1"><Activity size={12} /> Servidores estables</span>
        </div>
        <p>SISTEMA DE PLANEAMIENTO Y PREDICCION DE COMPRAS DE MATERIA PRIMA</p>
      </div>
    </div>
  );
}