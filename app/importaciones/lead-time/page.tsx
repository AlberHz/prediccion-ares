"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Clock, Search, CheckCircle2, AlertCircle, RefreshCw, SlidersHorizontal } from "lucide-react";

/**
 * ARES SYSTEM - MÓDULO DE GESTIÓN DE LEAD TIMES
 * - Edición en tiempo real de tiempos de entrega en días (columna física 'lead_time' #int4).
 * - Buscador interactivo por SKU (código) y descripción comercial.
 * - Sistema de guardado rápido mediante Blur (perder foco) o tecla Enter.
 */

export default function GestionLeadTime() {
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroFamilia, setFiltroFamilia] = useState("TODAS");
  const [familias, setFamilias] = useState<string[]>([]);
  
  // Estados para notificaciones de guardado
  const [savingId, setSavingId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    cargarProductos();
  }, []);

  async function cargarProductos() {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Obtenemos los campos clave de la tabla 'products'
      const { data, error } = await supabase
        .from("products")
        .select("id, code, description, lead_time, family, stock")
        .order("code", { ascending: true });

      if (error) throw error;
      
      setProductos(data || []);

      // Extraer familias únicas para el selector de filtros
      const listaFamilias = Array.from(
        new Set((data || []).map((p: any) => p.family).filter(Boolean))
      ) as string[];
      setFamilias(listaFamilias);

    } catch (error: any) {
      console.error("Error al cargar productos para Lead Time:", error);
      setErrorMsg(`Error de comunicación: ${error?.message || error}`);
    } finally {
      setLoading(false);
    }
  }

  // Función núcleo para actualizar el Lead Time en Supabase
  async function handleUpdateLeadTime(id: string, nuevoValor: number) {
    if (nuevoValor < 0 || isNaN(nuevoValor)) return;
    
    setSavingId(id);
    setSuccessId(null);
    setErrorMsg(null);

    try {
      const { error } = await supabase
        .from("products")
        .update({ lead_time: nuevoValor }) // Modifica la columna física int4
        .eq("id", id);

      if (error) throw error;

      // Actualizar el estado local para reflejar el cambio sin recargar todo de la red
      setProductos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, lead_time: nuevoValor } : p))
      );
      
      setSuccessId(id);
      // Desvanecer el check de éxito en 2 segundos
      setTimeout(() => setSuccessId(null), 2000);

    } catch (error: any) {
      console.error("Error al actualizar lead_time:", error);
      setErrorMsg(`No se pudo actualizar el Lead Time: ${error.message}`);
    } finally {
      setSavingId(null);
    }
  }

  // Filtrado lógico en cliente (Rápido y fluido)
  const productosFiltrados = productos.filter((p) => {
    const minTerm = searchTerm.toLowerCase();
    const codigo = p.code?.toLowerCase() || "";
    const desc = p.description?.toLowerCase() || "";
    const coincideBusqueda = codigo.includes(minTerm) || desc.includes(minTerm);
    
    const coincideFamilia = filtroFamilia === "TODAS" || p.family === filtroFamilia;
    
    return coincideBusqueda && coincideFamilia;
  });

  if (loading) return (
    <div className="min-h-[80vh] flex items-center justify-center bg-[#f8fafc]">
      <div className="text-center space-y-2">
        <div className="w-8 h-8 border-2 border-slate-800 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Accediendo a la matriz de tiempos logísticos...</p>
      </div>
    </div>
  );

  return (
    <div className="bg-[#f8fafc] min-h-screen text-slate-800 antialiased font-sans">
      {/* Encabezado del Módulo */}
      <header className="bg-white border-b border-slate-200 p-5">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-base tracking-tight">
          <Clock size={18} className="text-amber-500 animate-pulse" />
          <span>Configuración Avanzada de Lead Times (Tiempos de Entrega)</span>
        </div>
        <p className="text-[11px] text-slate-400 font-medium mt-0.5">
          Modifica los días de tránsito por SKU. Los cambios impactarán directamente la simulación de Cobertura, Fechas Límites de OC y Alertas de Quiebre.
        </p>
      </header>

      <main className="p-5 max-w-[1920px] mx-auto space-y-4">
        
        {/* Barra de Herramientas / Filtros */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Buscador de SKUs o Detalle */}
          <div className="relative flex-1 w-full max-w-md">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={13} />
            <input
              type="text"
              placeholder="Buscar por código SKU o descripción comercial..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 focus:border-slate-300 focus:bg-white rounded-lg text-[11px] font-medium outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Filtros de Familia e Información General */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal size={12} className="text-slate-400" />
              <select
                className="bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 p-1.5 outline-none focus:bg-white cursor-pointer"
                value={filtroFamilia}
                onChange={(e) => setFiltroFamilia(e.target.value)}
              >
                <option value="TODAS">TODAS LAS FAMILIAS</option>
                {familias.map((f) => (
                  <option key={f} value={f}>{f.toUpperCase()}</option>
                ))}
              </select>
            </div>

            <button 
              onClick={cargarProductos}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 rounded-lg bg-white transition-all"
              title="Sincronizar tablas"
            >
              <RefreshCw size={12} />
            </button>

            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg whitespace-nowrap">
              {productosFiltrados.length} ARTÍCULOS ENCONTRADOS
            </span>
          </div>
        </div>

        {/* Notificaciones de Error Globales */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold rounded-lg flex items-center gap-2">
            <AlertCircle size={14} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Tabla de Modificación de Lead Times */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto w-full max-h-[700px] custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#0f172a] text-slate-200 font-semibold text-[10px] tracking-wider uppercase sticky top-0 z-10 whitespace-nowrap">
                  <th className="p-3 border-b border-slate-700 w-36">Código</th>
                  <th className="p-3 border-b border-slate-700">Descripción del Artículo</th>
                  <th className="p-3 border-b border-slate-700 w-44">Familia</th>
                  <th className="p-3 text-right border-b border-slate-700 w-32">Stock Actual</th>
                  <th className="p-3 text-center border-b border-slate-700 bg-amber-950 text-amber-300 w-48">Lead Time Configurado</th>
                  <th className="p-3 text-center border-b border-slate-700 w-24">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {productosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-400 font-medium">
                      Ningún artículo coincide con los criterios de búsqueda actuales.
                    </td>
                  </tr>
                ) : (
                  productosFiltrados.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      {/* Código SKU */}
                      <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                        {p.code}
                      </td>
                      
                      {/* Descripción */}
                      <td className="p-3 font-medium text-slate-600 truncate max-w-[350px]" title={p.description}>
                        {p.description ? p.description.toUpperCase() : "SIN DESCRIPCIÓN COMERCIAL"}
                      </td>

                      {/* Familia */}
                      <td className="p-3 text-slate-500 whitespace-nowrap font-semibold">
                        <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] text-slate-500">
                          {p.family || "GENERAL"}
                        </span>
                      </td>

                      {/* Stock Actual */}
                      <td className="p-3 text-right font-bold text-slate-700 whitespace-nowrap">
                        {Number(p.stock || 0).toLocaleString()}
                      </td>

                      {/* Lead Time Configurado (Celda Interactiva) */}
                      <td className="p-3 bg-amber-50/20 text-center border-x border-slate-100">
                        <div className="flex items-center justify-center gap-2">
                          <input
                            type="number"
                            min="0"
                            className="w-20 px-2 py-1 bg-white border border-slate-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-center rounded-lg font-black text-[12px] text-slate-900 outline-none transition-all shadow-sm"
                            defaultValue={p.lead_time}
                            onBlur={(e) => {
                              const valor = Number(e.target.value);
                              if (valor !== p.lead_time) {
                                handleUpdateLeadTime(p.id, valor);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const valor = Number((e.target as HTMLInputElement).value);
                                handleUpdateLeadTime(p.id, valor);
                                (e.target as HTMLInputElement).blur(); // Quita foco al procesar
                              }
                            }}
                          />
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Días</span>
                        </div>
                      </td>

                      {/* Estado visual de sincronización */}
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center min-h-[20px]">
                          {savingId === p.id && (
                            <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                          )}
                          {successId === p.id && (
                            <CheckCircle2 size={14} className="text-emerald-500 animate-bounce" />
                          )}
                          {savingId !== p.id && successId !== p.id && (
                            <span className="w-1.5 h-1.5 bg-slate-300 rounded-full" title="Sincronizado"></span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Estilos locales para los scrolls */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 9999px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        /* Ocultar flechas del input number para mayor estética */
        input[type=number]::-webkit-inner-spin-button, 
        input[type=number]::-webkit-outer-spin-button { 
          -webkit-appearance: none; 
          margin: 0; 
        }
      `}</style>
    </div>
  );
}