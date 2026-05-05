"use client";
import { useRouter } from "next/navigation";
import { 
  Box, Cpu, Package, ChevronRight, 
  Info, ShieldCheck, Activity, Target
} from "lucide-react";

export default function Home() {
  const router = useRouter();

  const modulos = [
    { 
      nombre: "IMPORTACIONES", 
      ruta: "/importaciones/predicciones", 
      icono: <Box size={28} />, 
      info: "Gestión de suministro internacional, Gestiòn de los Lead times, colocaciòn de fechas y cantidades de arribos y modificacion de los consumos promedios." 
    },
    { 
      nombre: "MATERIA PRIMA", 
      ruta: "/materia-prima/predicciones", 
      icono: <Cpu size={28} />, 
      info: "Gestiòn del suministro local, Planeaciòn de insumos criticos y modificaciones de los aspectos basicos del abastecimiento." 
    },
    { 
      nombre: "SUMINISTROS", 
      ruta: "/suministros/predicciones", 
      icono: <Package size={28} />, 
      info: "Administración de materiales indirectos, consumibles y stock de operación." 
    },
  ];

  return (
    <div className="min-h-screen bg-[#f3f6f8] flex flex-col font-sans antialiased">
      
      {/* Shell Bar Superior - SAP Standard */}
      <header className="h-[48px] bg-[#354a5f] flex items-center justify-between px-8 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-[2px] h-5 bg-[#84cc16]" />
          <h1 className="text-white text-sm font-semibold tracking-tight uppercase">
            Ares <span className="opacity-70">Enterprise Launchpad </span>
          </h1>
        </div>
        <div className="flex items-center gap-3 text-white/50 text-[10px] font-bold tracking-widest">
          <ShieldCheck size={14} className="text-[#84cc16]" /> SISTEMA ACTIVO
        </div>
      </header>

      {/* Área Central */}
      <main className="flex-1 flex flex-col items-center justify-center p-8 max-w-7xl mx-auto w-full">
        
        {/* Sección Informativa del Sistema */}
        <section className="text-center mb-16 max-w-2xl animate-in fade-in duration-1000 slide-in-from-bottom-4">
          <h2 className="text-4xl font-light text-[#1d2d3e] mb-4">
            Panel de <span className="font-bold text-[#84cc16]">Planificación</span>
          </h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-6 font-medium">
            Plataforma centralizada para la toma de decisiones estratégicas. 
            Se integra modelos estadisticos y algoritmos de Inteligencia Artificial para predecir la demanda y 
            optimizar el flujo de inventario en tiempo real, garantizando la continuidad 
            operativa y ahorro de costos en toda la cadena de suministro.
          </p>
          <div className="flex items-center justify-center gap-6">
             <div className="flex items-center gap-2 text-[10px] font-black text-[#354a5f] uppercase tracking-tighter">
                <Activity size={14} className="text-[#84cc16]"/> Sincronización Real-time
             </div>
             <div className="flex items-center gap-2 text-[10px] font-black text-[#354a5f] uppercase tracking-tighter">
                <Target size={14} className="text-[#84cc16]"/> Precisión en Predicción
             </div>
          </div>
        </section>

        {/* Grid Centrado - 3 Columnas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl">
          {modulos.map((mod, index) => (
            <button
              key={mod.nombre}
              onClick={() => router.push(mod.ruta)}
              className="group flex flex-col bg-white border border-[#d8e0e5] rounded-sm p-8 text-left transition-all duration-500 hover:shadow-2xl hover:border-[#0070d2] relative overflow-hidden h-[220px]"
              style={{ animationDelay: `${index * 150}ms` }}
            >
              <div className="absolute top-0 left-0 w-full h-[4px] bg-transparent group-hover:bg-[#0070d2] transition-colors" />
              
              <div className="text-[#354a5f] group-hover:text-[#0070d2] transition-all duration-300 group-hover:scale-110 mb-6">
                {mod.icono}
              </div>

              <div className="flex-1">
                <h3 className="font-bold text-sm text-[#1d2d3e] mb-3 tracking-tight group-hover:text-[#0070d2] uppercase">
                  {mod.nombre}
                </h3>
                <p className="text-[12px] text-slate-400 leading-snug font-medium">
                  {mod.info}
                </p>
              </div>

              <div className="flex items-center justify-between mt-4">
                <span className="text-[10px] font-black text-[#0070d2] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                  Iniciar Gestión
                </span>
                <ChevronRight size={18} className="text-[#0070d2] transform group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          ))}
        </div>

      </main>

      {/* Footer SAP Fiori */}
      <footer className="h-[48px] border-t border-[#d8e0e5] flex items-center justify-between px-10 bg-white text-[10px] text-[#556b82] font-bold uppercase tracking-widest">
        <span>ARES ENTERPRISE v2.0</span>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#84cc16] animate-pulse" />
          Sincronizado con Supabase Engine
        </div>
      </footer>
    </div>
  );
}