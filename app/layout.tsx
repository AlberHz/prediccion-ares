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
  
  // NUEVO: Estado para colapsar la barra lateral en Desktop
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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

  // Modificamos el componente para aceptar el estado colapsado
  const SidebarContent = ({ collapsed = false }: { collapsed?: boolean }) => (
    <div className="flex flex-col h-full bg-white border-r border-[#d8e0e5]">
      <div className={`h-[48px] flex items-center bg-[#354a5f] text-white transition-all duration-300 ${collapsed ? 'justify-center px-0' : 'px-6'}`}>
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-[#84cc16]" />
          {!collapsed && <span className="font-bold text-[12px] tracking-tight uppercase italic whitespace-nowrap overflow-hidden">Ares Enterprise</span>}
        </div>
      </div>

      <nav className="flex-1 px-2 py-4 overflow-y-auto overflow-x-hidden space-y-1 FioriScrollbar">
        {menuConfig.map((section) => (
          <div key={section.id} className="mb-1">
            <button 
              onClick={() => {
                // Si está colapsado y hacen clic, lo abrimos y desplegamos la sección
                if (collapsed) {
                  setIsSidebarCollapsed(false);
                  setOpenSection(section.id);
                } else {
                  setOpenSection(openSection === section.id ? null : section.id);
                }
              }}
              className={`w-full flex items-center p-2 rounded-md font-bold text-[11px] uppercase tracking-wider transition-all ${openSection === section.id && !collapsed ? "bg-[#eaf0f5] text-[#0070d2]" : "text-[#556b82] hover:bg-[#f3f6f8]"} ${collapsed ? 'justify-center' : 'justify-between'}`}
              title={collapsed ? section.label : ""}
            >
              <div className="flex items-center gap-3">
                <span className={`${collapsed ? 'scale-110' : ''} transition-transform`}>{section.icon}</span>
                {!collapsed && <span className="whitespace-nowrap">{section.label}</span>}
              </div>
              {!collapsed && (
                <ChevronDown size={14} className={`transition-transform duration-300 shrink-0 ${openSection === section.id ? "rotate-180" : ""}`} />
              )}
            </button>

            {/* Solo mostramos los submenús si NO está colapsado */}
            {openSection === section.id && !collapsed && (
              <div className="mt-1 space-y-0.5 animate-in slide-in-from-top-1 duration-200">
                {section.items.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => { router.push(item.path); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 pl-10 pr-3 py-2 rounded-md text-[11px] font-medium transition-all text-left ${pathname === item.path ? "bg-[#0070d2] text-white shadow-md" : "text-[#556b82] hover:bg-[#f3f6f8] hover:text-[#1d2d3e]"}`}
                  >
                    <span className="shrink-0">{item.icon}</span> 
                    <span className="whitespace-nowrap overflow-hidden text-ellipsis">{item.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className={`p-4 border-t border-[#d8e0e5] bg-[#f3f6f8] transition-all duration-300 ${collapsed ? 'px-2' : ''}`}>
        <button 
          onClick={() => router.push("/login")} 
          className={`w-full flex items-center justify-center gap-2 p-2 rounded-md font-bold text-[10px] text-[#bb0000] hover:bg-[#ffebec] transition-all border border-[#ffcfd1] ${collapsed ? 'px-0' : ''}`}
          title={collapsed ? "Cerrar Sesión" : ""}
        >
          <LogOut size={14} className="shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">CERRAR SESIÓN</span>}
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
            <aside className={`hidden lg:flex flex-col shrink-0 z-30 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-[68px]' : 'w-[260px]'}`}>
              <SidebarContent collapsed={isSidebarCollapsed} />
            </aside>
          )}

          <div className="flex-1 flex flex-col min-w-0 relative">
            {/* SHELL BAR SAP FIORI */}
            <header className="h-[48px] bg-[#354a5f] text-white flex items-center justify-between px-4 z-40 shadow-md shrink-0">
              <div className="flex items-center gap-4">
                
                {/* Controles de navegación y menús (Solo si no estamos en el home) */}
                {!isHomePage && (
                  <div className="flex items-center gap-2">
                    {/* Botón de Colapsar/Expandir Desktop */}
                    <button 
                      onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
                      className="hidden lg:flex p-1 hover:bg-white/10 rounded transition-colors"
                      title={isSidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
                    >
                      <Menu size={20} />
                    </button>

                    {/* Hamburguesa Mobile */}
                    <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-1 hover:bg-white/10 rounded transition-colors">
                      <Menu size={20} />
                    </button>

                    {/* Botón Volver al Inicio */}
                    <button 
                      onClick={() => router.push("/")}
                      className="flex items-center gap-2 px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-bold uppercase tracking-tighter transition-colors ml-2"
                    >
                      <ChevronLeft size={14} /> Inicio
                    </button>
                  </div>
                )}
                
                <span className="text-[11px] font-medium opacity-70 tracking-widest uppercase truncate hidden sm:block">
                  {isHomePage ? "Global Launchpad" : `ARES / ${pathname.split("/").filter(Boolean).join(" / ")}`}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="hidden md:block text-[9px] font-bold py-1 px-2 border border-[#84cc16] text-[#84cc16] rounded tracking-[0.2em]">SISTEMA ACTIVO</div>
                <div className="w-7 h-7 rounded-full bg-[#84cc16] flex items-center justify-center text-[10px] font-bold text-white shadow-inner cursor-pointer hover:opacity-90 transition-opacity">JD</div>
              </div>
            </header>

            {/* CONTENIDO CON ANIMACIÓN SUAVE Y RECARGA POR RUTA */}
            <main className="flex-1 overflow-y-auto relative bg-[#f3f6f8]">
              {/* LA MAGIA ESTÁ AQUÍ: key={pathname} fuerza a React a ejecutar la animación en cada cambio de ruta */}
              <div key={pathname} className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out h-full">
                {children}
              </div>
            </main>
          </div>

          {/* SIDEBAR MOBILE */}
          {isMobileMenuOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div className="absolute inset-0 bg-[#1d2d3e]/60 backdrop-blur-sm transition-opacity" onClick={() => setIsMobileMenuOpen(false)} />
              <aside className="absolute top-0 left-0 bottom-0 w-[280px] bg-white animate-in slide-in-from-left duration-300">
                {/* En mobile NUNCA está colapsado */}
                <SidebarContent collapsed={false} />
              </aside>
            </div>
          )}
        </div>
      </body>
    </html>
  );
}