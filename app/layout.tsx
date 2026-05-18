"use client";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase"; 
import { motion, AnimatePresence } from "framer-motion";
import { 
  Truck, Clock, BarChart3, ChevronDown, Menu, 
  CloudUpload, Users, Box, ChevronLeft, LogOut, 
  Zap, BrainCircuit, LayoutDashboard, PanelLeftClose, PanelLeftOpen
} from "lucide-react";
import "./globals.css";

interface UsuarioPerfil {
  nombre: string | null;
  email: string;
  rol: string;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>("importaciones");
  const [userPerfil, setUserPerfil] = useState<UsuarioPerfil | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const isHomePage = pathname === "/";
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoadingUser(true);
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const { data: perfil, error } = await supabase
            .from("usuarios")
            .select("nombre, email, rol")
            .eq("id", user.id)
            .maybeSingle();

          if (perfil && !error) {
            setUserPerfil(perfil);
          } else {
            const nombreFallback = user.user_metadata?.nombre || 
                                   (user.email ? user.email.split("@")[0].toUpperCase() : "Analista Ares");
            
            const esAlber = user.email?.toLowerCase().includes("alber");

            setUserPerfil({
              nombre: nombreFallback,
              email: user.email || "",
              rol: esAlber ? "admin" : (user.user_metadata?.rol || "usuario")
            });
          }
        } else {
          setUserPerfil(null);
        }
      } catch (err) {
        console.error("Error capturando datos de cuenta:", err);
      } finally {
        setLoadingUser(false);
      }
    };

    fetchUserData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setUserPerfil(null);
        router.push("/login");
      } else if (event === "SIGNED_IN" && session) {
        fetchUserData();
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const getInitials = () => {
    if (!userPerfil?.nombre) return "??";
    const parts = userPerfil.nombre.trim().split(" ");
    return parts.length >= 2 
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() 
      : parts[0].substring(0, 2).toUpperCase();
  };

  if (isLoginPage) return <html lang="es"><body>{children}</body></html>;

  const menuConfig = [
    {
      id: "importaciones",
      label: "Importaciones",
      icon: <Box size={16} />,
      items: [
        { name: "Dashboard Central", path: "/", icon: <LayoutDashboard size={14}/> },
        { name: "Prediccion", path: "/importaciones/predicciones", icon: <BrainCircuit size={14}/> },
        { name: "Gestión de Arribos", path: "/importaciones/arribos", icon: <Truck size={14}/> },
        { name: "Monitor Lead Time", path: "/importaciones/lead-time", icon: <Clock size={14}/> },
        { name: "Cronología", path: "/importaciones/cronologia", icon: <Clock size={14}/> },
        { name: "Panel de KPIs", path: "/importaciones/kpis", icon: <BarChart3 size={14}/> },
        { name: "Carga de Datos", path: "/importaciones/cargar-datos", icon: <CloudUpload size={14}/> },
      ]
    },
    {
      id: "control-acceso",
      label: "Control de Acceso",
      icon: <Users size={16} />,
      items: [
        { name: "Usuarios y Roles", path: "/usuarios", icon: <Users size={14}/> },
      ]
    }
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-slate-50 border-r border-slate-200/60 select-none">
      
      {/* BRANDING LOGO */}
      <div className={`h-16 flex items-center ${isCollapsed ? "justify-center" : "px-5"} shrink-0 border-b border-slate-200/40`}>
        {isCollapsed ? (
          <div className="w-7 h-7 bg-slate-900 rounded-md flex items-center justify-center text-white text-xs font-bold font-mono">A</div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-slate-900 rounded-md flex items-center justify-center text-white text-[10px] font-bold font-mono">A</div>
            <span className="text-xs font-bold tracking-wider uppercase text-slate-800">PLANEAMIENTO DE COMPRAS</span>
          </div>
        )}
      </div>

      {/* MENÚ DE NAVEGACIÓN */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {menuConfig.map((section) => (
          <div key={section.id} className="space-y-0.5">
            <button 
              onClick={() => {
                if(isCollapsed) setIsCollapsed(false);
                setOpenSection(openSection === section.id ? null : section.id);
              }}
              className={`w-full flex items-center justify-between p-2 rounded-md transition-all text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 ${
                openSection === section.id && !isCollapsed ? "text-slate-900" : ""
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-slate-400 shrink-0">{section.icon}</span>
                {!isCollapsed && (
                  <span className="text-xs font-medium tracking-tight truncate">{section.label}</span>
                )}
              </div>
              {!isCollapsed && (
                <ChevronDown 
                  size={12} 
                  className={`transition-transform duration-200 text-slate-400 shrink-0 ${
                    openSection === section.id ? "rotate-180" : ""
                  }`} 
                />
              )}
            </button>

            {/* SUBITEMS CON ANIMACIÓN */}
            <div className="overflow-hidden">
              {openSection === section.id && !isCollapsed && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="pl-2"
                >
                  <div className="py-1 my-0.5 border-l border-slate-200 ml-2.5 pl-2.5 space-y-0.5">
                    {section.items.map((item) => {
                      const isActive = pathname === item.path;
                      return (
                        <button
                          key={item.path}
                          onClick={() => { router.push(item.path); setIsMobileMenuOpen(false); }}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                            isActive 
                              ? "text-slate-900 bg-slate-200/60 shadow-xs" 
                              : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/30"
                          }`}
                        >
                          <span className={`shrink-0 ${isActive ? "text-slate-900" : "text-slate-400"}`}>{item.icon}</span>
                          <span className="truncate">{item.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        ))}
      </nav>

      {/* PERFIL / CONFIGURACIÓN DE CUENTA */}
      <div className="p-3 border-t border-slate-200/40 shrink-0 bg-slate-50">
        {loadingUser ? (
          <div className="h-12 w-full flex items-center justify-center">
            <div className="w-3 h-3 border border-slate-300 border-t-slate-900 rounded-full animate-spin" />
          </div>
        ) : userPerfil && (
          <div className="space-y-2">
            <div className={`flex items-center gap-2 px-1 ${isCollapsed ? "justify-center" : ""}`}>
              <div className="w-7 h-7 rounded-md border border-slate-200 text-slate-700 flex items-center justify-center font-semibold text-[10px] shrink-0 bg-white shadow-xs">
                {getInitials()}
              </div>
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-slate-800 truncate leading-tight">
                    {userPerfil.nombre}
                  </p>
                  <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider block truncate">
                    {userPerfil.rol}
                  </span>
                </div>
              )}
            </div>

            {!isCollapsed ? (
              <button 
                onClick={handleSignOut} 
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-medium text-slate-500 hover:text-slate-900 hover:bg-white hover:border-slate-200/80 transition-all border border-transparent"
              >
                <LogOut size={11} />
                Cerrar sesión
              </button>
            ) : (
              <button 
                onClick={handleSignOut} 
                title="Cerrar sesión"
                className="w-full flex items-center justify-center p-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-white hover:border-slate-200 transition-all border border-transparent"
              >
                <LogOut size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <html lang="es">
      <body className="bg-white text-slate-900 min-h-screen overflow-hidden font-sans antialiased selection:bg-slate-100">
        <div className="flex h-screen overflow-hidden">
          
          {/* SIDEBAR ESCRITORIO (DINÁMICO SEGÚN COLAPSO) */}
          {!isHomePage && (
            <motion.aside 
              className="hidden lg:flex flex-col shrink-0 z-30"
              animate={{ width: isCollapsed ? 68 : 240 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              <SidebarContent />
            </motion.aside>
          )}

          <div className="flex-1 flex flex-col min-w-0 relative bg-white">
            
            {/* HEADER MINIMALISTA */}
            <header className="h-16 bg-white flex items-center justify-between px-6 z-40 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                {!isHomePage && (
                  <div className="flex items-center gap-2">
                    {/* Botón Móvil */}
                    <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-1.5 text-slate-500 hover:bg-slate-50 rounded-md transition-colors">
                      <Menu size={18} />
                    </button>
                    
                    {/* Botón Colapsar Escritorio */}
                    <button 
                      onClick={() => setIsCollapsed(!isCollapsed)} 
                      className="hidden lg:block p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-all"
                      title={isCollapsed ? "Expandir menú" : "Colapsar menú"}
                    >
                      {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                    </button>

                    <button onClick={() => router.push("/")} className="flex items-center gap-0.5 text-slate-400 hover:text-slate-800 transition-colors text-xs font-medium group ml-1">
                      <ChevronLeft size={14} /> 
                      Deslizar
                    </button>
                  </div>
                )}
                {!isHomePage && <div className="h-4 w-[1px] bg-slate-200 hidden sm:block mx-1" />}
                <span className="text-[9px] font-semibold text-slate-400 tracking-[0.2em] uppercase hidden sm:block">
                  Simulación de Abastecimiento 
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden md:flex items-center gap-1.5 text-slate-500 px-2 py-0.5 rounded-md text-[9px] font-semibold border border-slate-200/60 bg-slate-50 tracking-wider uppercase">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                  Live
                </div>
                <div className="w-7 h-7 rounded-md border border-slate-200/60 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors cursor-pointer">
                  <Zap size={12} />
                </div>
              </div>
            </header>

            {/* CONTENEDOR PRINCIPAL */}
            <main className="flex-1 overflow-y-auto relative bg-white">
              <AnimatePresence mode="wait">
                <motion.div 
                  key={pathname}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="h-full"
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>

          {/* SIDEBAR MÓVIL (MANTIENE ANCHO COMPLETO SIEMPRE) */}
          <AnimatePresence>
            {isMobileMenuOpen && (
              <div className="fixed inset-0 z-50 lg:hidden">
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 bg-slate-950/20 backdrop-blur-xs" 
                  onClick={() => setIsMobileMenuOpen(false)} 
                />
                <motion.aside 
                  initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="absolute top-0 left-0 bottom-0 w-[240px] bg-white shadow-xl"
                >
                  <SidebarContent />
                </motion.aside>
              </div>
            )}
          </AnimatePresence>

        </div>
      </body>
    </html>
  );
}