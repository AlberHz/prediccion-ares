"use client";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { 
  Package, TrendingUp, Truck, Clock, BarChart3, ChevronDown, 
  Menu, X, Database, LogOut, CloudUpload, Users, PieChart, 
  Box, Cpu, Home as HomeIcon, ChevronLeft, 
  Settings
} from "lucide-react";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);

  // Si estamos en el Home (Launchpad), no mostramos el Sidebar
  const isHomePage = pathname === "/";
  const isLoginPage = pathname === "/login";

  // Auto-abrir sección del sidebar según la ruta actual
  useEffect(() => {
    if (pathname.includes("importaciones")) setOpenSection("importaciones");
    else if (pathname.includes("materia-prima")) setOpenSection("materia-prima");
    else if (pathname.includes("suministros")) setOpenSection("suministros");
  }, [pathname]);

  if (isLoginPage) return <html lang="es"><body>{children}</body></html>;

  const menuConfig = [
    {
      id: "importaciones",
      label: "Importaciones",
      icon: <Box size={18} />,
      items: [
        { name: "Predicciones IA", path: "/importaciones/predicciones", icon: <TrendingUp size={14}/> },
        { name: "Gestión de Arribos", path: "/importaciones/arribos", icon: <Truck size={14}/> },
        { name: "Gestión de Lead Time", path: "/importaciones/lead-time", icon: <Clock size={14}/> },
        { name: "Gestión de Promedios", path: "/importaciones/promedios", icon: <BarChart3 size={14}/> },
        { name: "Indicadores - KPIs", path: "/importaciones/kpis", icon: <PieChart size={14}/> },
        { name: "Cargar Base de Datos", path: "/importaciones/cargar-datos", icon: <CloudUpload size={14} className="text-[#84cc16]"/> },
      ]
    },
    {
      id: "materia-prima",
      label: "Materia Prima",
      icon: <Cpu size={18} />,
      items: [
        { name: "Predicciones IA", path: "/materia-prima/predicciones", icon: <TrendingUp size={14}/> },
        { name: "Gestión de Arribos", path: "/materia-prima/arribos", icon: <Truck size={14}/> },
        { name: "Gestión de Lead Time", path: "/materia-prima/lead-time", icon: <Clock size={14}/> },
        { name: "Gestión de Promedios", path: "/materia-prima/promedios", icon: <BarChart3 size={14}/> },
        { name: "Indicadores - KPIs", path: "/materia-prima/kpis", icon: <PieChart size={14}/> },
        { name: "Cargar Base de Datos", path: "/materia-prima/cargar-datos", icon: <CloudUpload size={14} className="text-[#84cc16]"/> },
      ]
    },
    {
      id: "suministros",
      label: "Suministros",
      icon: <Package size={18} />,
      items: [
        { name: "Predicciones IA", path: "/suministros/predicciones", icon: <TrendingUp size={14}/> },
        { name: "Gestión de Arribos", path: "/suministros/arribos", icon: <Truck size={14}/> },
        { name: "Gestión de Lead Time", path: "/suministros/lead-time", icon: <Clock size={14}/> },
        { name: "Gestión de Promedios", path: "/suministros/promedios", icon: <BarChart3 size={14}/> },
        { name: "Indicadores - KPIs", path: "/suministros/kpis", icon: <PieChart size={14}/> },
        { name: "Cargar Base de Datos", path: "/suministros/cargar-datos", icon: <CloudUpload size={14} className="text-[#84cc16]"/> },
      ]
    },
    {
      id: "Movimientos",
      label: "Movimientos",
      icon: <BarChart3 size={18} />,
      items: [
        { name: "Cargar Base de Datos", path: "/movimientos/cargar-datos", icon: <CloudUpload size={14} className="text-[#84cc16]"/> },
      ]
    },
    {
      id: "usuarios",
      label: "Usuarios",
      icon: <Users size={18} />,
      items: [
        { name: "Gestión de Usuarios", path: "/usuarios", icon: <Settings size={14}/> },
      ]
    }
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-[#d8e0e5] animate-in fade-in slide-in-from-left duration-500">
      <div className="h-[48px] flex items-center px-6 bg-[#354a5f] text-white">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-[#84cc16]" />
          <span className="font-bold text-[12px] tracking-tight uppercase italic">Ares Enterprise</span>
        </div>
      </div>

      <nav className="flex-1 px-2 py-4 overflow-y-auto space-y-1">
        {menuConfig.map((section) => (
          <div key={section.id} className="mb-1">
            <button 
              onClick={() => setOpenSection(openSection === section.id ? null : section.id)}
              className={`w-full flex items-center justify-between p-2 rounded-md font-bold text-[11px] uppercase tracking-wider transition-all ${openSection === section.id ? "bg-[#eaf0f5] text-[#0070d2]" : "text-[#556b82] hover:bg-[#f3f6f8]"}`}
            >
              <div className="flex items-center gap-3">{section.icon} {section.label}</div>
              <ChevronDown size={14} className={`transition-transform duration-300 ${openSection === section.id ? "rotate-180" : ""}`} />
            </button>

            {openSection === section.id && (
              <div className="mt-1 space-y-0.5 animate-in slide-in-from-top-1 duration-200">
                {section.items.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => { router.push(item.path); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 pl-10 pr-3 py-2 rounded-md text-[11px] font-medium transition-all text-left ${pathname === item.path ? "bg-[#0070d2] text-white shadow-md" : "text-[#556b82] hover:bg-[#f3f6f8] hover:text-[#1d2d3e]"}`}
                  >
                    {item.icon} {item.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-[#d8e0e5] bg-[#f3f6f8]">
        <button onClick={() => router.push("/login")} className="w-full flex items-center justify-center gap-2 p-2 rounded-md font-bold text-[10px] text-[#bb0000] hover:bg-[#ffebec] transition-all border border-[#ffcfd1]">
          <LogOut size={12} /> CERRAR SESIÓN
        </button>
      </div>
    </div>
  );

  return (
    <html lang="es">
      <body className="bg-[#f3f6f8] text-[#1d2d3e] min-h-screen overflow-hidden">
        <div className="flex h-screen overflow-hidden">
          
          {/* SIDEBAR DESKTOP (No se muestra en el Home) */}
          {!isHomePage && (
            <aside className="hidden lg:flex w-[260px] flex-col shrink-0 z-30">
              <SidebarContent />
            </aside>
          )}

          <div className="flex-1 flex flex-col min-w-0 relative">
            {/* SHELL BAR SAP FIORI */}
            <header className="h-[48px] bg-[#354a5f] text-white flex items-center justify-between px-4 z-40 shadow-md">
              <div className="flex items-center gap-4">
                {/* Botón Volver al Inicio (Solo si no estamos en el home) */}
                {!isHomePage && (
                  <button 
                    onClick={() => router.push("/")}
                    className="flex items-center gap-2 px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-bold uppercase tracking-tighter transition-colors"
                  >
                    <ChevronLeft size={14} /> Inicio
                  </button>
                )}
                
                {/* Hamburguesa Mobile */}
                {!isHomePage && (
                  <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-1 hover:bg-white/10 rounded">
                    <Menu size={20} />
                  </button>
                )}
                
                <span className="text-[11px] font-medium opacity-70 tracking-widest uppercase truncate">
                  {isHomePage ? "Global Launchpad" : `ARES / ${pathname.split("/").filter(Boolean).join(" / ")}`}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="hidden md:block text-[9px] font-bold py-1 px-2 border border-[#84cc16] text-[#84cc16] rounded tracking-[0.2em]">SISTEMA ACTIVO</div>
                <div className="w-7 h-7 rounded-full bg-[#84cc16] flex items-center justify-center text-[10px] font-bold text-white shadow-inner">JD</div>
              </div>
            </header>

            {/* CONTENIDO CON ANIMACIÓN SUAVE */}
            <main className="flex-1 overflow-y-auto relative bg-[#f3f6f8]">
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out">
                {children}
              </div>
            </main>
          </div>

          {/* SIDEBAR MOBILE */}
          {isMobileMenuOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div className="absolute inset-0 bg-[#1d2d3e]/60 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
              <aside className="absolute top-0 left-0 bottom-0 w-[280px] bg-white animate-in slide-in-from-left duration-300">
                <SidebarContent />
              </aside>
            </div>
          )}
        </div>
      </body>
    </html>
  );
}