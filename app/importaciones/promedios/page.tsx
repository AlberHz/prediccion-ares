"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Search, Edit2, TrendingUp, Layers, X, Check } from "lucide-react";

// ==========================================
// 🔮 1. COMPONENTE INTERNO: MODAL DE CONSUMO
// ==========================================
interface ModalConsumoProps {
  producto: {
    id: string;
    code: string;
    description: string;
    custom_average_consumption: number;
  } | null;
  onClose: () => void;
  onSuccess: (id: string, nuevoConsumo: number) => void;
}

function ModalConsumoPromedio({ producto, onClose, onSuccess }: ModalConsumoProps) {
  const [inputValue, setInputValue] = useState<string>("");
  const [guardando, setGuardando] = useState(false);

  // Sincronizar de forma estricta el valor del producto al abrir el modal
  useEffect(() => {
    if (producto) {
      setInputValue(String(producto.custom_average_consumption || 0));
    }
  }, [producto]);

  if (!producto) return null;

  const handleGuardar = async () => {
    setGuardando(true);
    const valorNumerico = Math.max(0, parseInt(inputValue, 10) || 0);

    try {
      const { error } = await supabase
        .from("products")
        .update({ custom_average_consumption: valorNumerico })
        .eq("id", producto.id);

      if (error) throw error;

      // Retornar con éxito e inmediatez al componente padre
      onSuccess(producto.id, valorNumerico);
      onClose();
    } catch (err) {
      console.error("Error al actualizar el consumo manual:", err);
      alert("No se pudo guardar el valor. Revisa la conexión o la columna 'custom_average_consumption' en Supabase.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl w-full max-w-md p-6 relative text-slate-800">
        <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded-lg hover:bg-slate-100 text-slate-400">
          <X size={16} />
        </button>
        
        <div className="mb-4">
          <span className="text-[9px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider inline-flex items-center gap-1">
            <TrendingUp size={10} /> Ajuste de Consumos Inflados
          </span>
          <h3 className="text-sm font-black text-slate-900 mt-1">Forzar Consumo SKU: {producto.code}</h3>
          <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">{producto.description}</p>
        </div>

        <div className="my-5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Consumo Promedio Mensual Manual
          </label>
          <input 
            type="number" 
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs font-bold font-mono text-purple-700 outline-none focus:bg-white focus:border-purple-300"
            placeholder="Ej: 350"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <p className="text-[10px] text-slate-400 font-medium mt-1.5 leading-normal">
            * Al escribir un valor mayor a 0, se **sobreescribirá con máxima prioridad** cualquier historial de salidas reales o infladas. Si lo dejas en <strong>0</strong>, el planificador volverá a promediar basándose en todos los meses disponibles.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button onClick={onClose} className="px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-50">
            Cancelar
          </button>
          <button 
            onClick={handleGuardar}
            disabled={guardando}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : (
              <>
                <Check size={12} />
                Fijar Consumo
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 🏛️ 2. COMPONENTE PRINCIPAL DE LA VISTA
// ==========================================
export default function ConsumosPromediosPage() {
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroFamilia, setFiltroFamilia] = useState("TODOS");
  const [productToEdit, setProductToEdit] = useState<any | null>(null);

  async function fetchCatalog() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("id, code, description, family, custom_average_consumption, active")
        .eq("active", true);

      if (error) throw error;

      if (data) {
        const procesados = data.map((p: any) => ({
          id: p.id,
          code: p.code ? String(p.code).trim() : "SIN CÓDIGO",
          description: p.description ? String(p.description).trim() : "SIN DESCRIPCIÓN",
          family: p.family ? String(p.family).trim() : "GENERAL",
          custom_average_consumption: p.custom_average_consumption != null ? Number(p.custom_average_consumption) : 0,
        }));
        setProductos(procesados);
      }
    } catch (err) {
      console.error("Error cargando catálogo para consumos:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCatalog();
  }, []);

  const handleUpdateSuccess = (id: string, nuevoConsumo: number) => {
    setProductos((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          return { ...p, custom_average_consumption: nuevoConsumo };
        }
        return p;
      })
    );
  };

  const dataFiltrada = useMemo(() => {
    return productos.filter((p) => {
      const cumpleBusqueda = p.code.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase());
      const cumpleFamilia = filtroFamilia === "TODOS" || p.family === filtroFamilia;
      return cumpleBusqueda && cumpleFamilia;
    });
  }, [productos, search, filtroFamilia]);

  const dataAgrupada = useMemo(() => {
    return dataFiltrada.reduce((acc: { [key: string]: any[] }, item) => {
      const familia = item.family || "GENERAL";
      if (!acc[familia]) acc[familia] = [];
      acc[familia].push(item);
      return acc;
    }, {});
  }, [dataFiltrada]);

  const familiasUnicas = useMemo(() => {
    return Array.from(new Set(productos.map((p) => p.family).filter(Boolean)));
  }, [productos]);

  if (loading) return (
    <div className="min-h-[80vh] flex items-center justify-center bg-[#f8fafc]">
      <div className="text-center space-y-2">
        <div className="w-8 h-8 border-2 border-slate-800 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cargando Catálogo de Consumos Ares...</p>
      </div>
    </div>
  );

  return (
    <div className="bg-[#f8fafc] min-h-screen text-slate-800 antialiased font-sans p-5 space-y-4">
      
      {/* HEADER */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2">
        <TrendingUp size={20} className="text-purple-600" />
        <div>
          <h1 className="text-base font-black text-slate-900 leading-tight">Configuración de Consumos Promedios Manuales</h1>
          <p className="text-[11px] text-slate-500 font-medium">Asigna consumos fijos para sobreescribir históricos inflados o heredar demandas en SKUs nuevos.</p>
        </div>
      </div>

      {/* FILTROS */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[320px]">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Buscar Código o Descripción</label>
          <input 
            type="text" 
            placeholder="Buscar por SKU..." 
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-medium outline-none focus:bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="w-64">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Filtrar por Familia</label>
          <select 
            className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-[11px] font-bold cursor-pointer"
            value={filtroFamilia}
            onChange={(e) => setFiltroFamilia(e.target.value)}
          >
            <option value="TODOS">TODAS LAS FAMILIAS</option>
            {familiasUnicas.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
          </select>
        </div>
      </div>

      {/* TABLA DE PRODUCTOS */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto w-full max-h-[650px] custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#0f172a] text-slate-200 font-semibold text-[11px] tracking-wider uppercase sticky top-0 z-20 whitespace-nowrap">
                <th className="p-3 w-20 text-center">Acción</th>
                <th className="p-3 w-48">Código SKU</th>
                <th className="p-3">Descripción Completa</th>
                <th className="p-3 text-right w-64 bg-purple-950 text-purple-200 font-black">Consumo Fijo / Heredado (u/mes)</th>
                <th className="p-3 w-40 text-center">Origen de Datos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px]">
              {Object.keys(dataAgrupada).map((familia) => [
                <tr key={`group-${familia}`} className="bg-slate-100/80 font-bold text-slate-700 tracking-wide">
                  <td colSpan={5} className="p-2.5 pl-4 border-y border-slate-200">
                    <span className="inline-flex items-center gap-2 text-[11px] uppercase text-slate-900 font-black">
                      <Layers size={13} className="text-purple-600" />
                      FAMILIA: {familia}
                      <span className="text-[10px] font-normal text-slate-500 normal-case bg-white border border-slate-200 px-2 py-0.5 rounded-full ml-1">
                        {dataAgrupada[familia].length} SKUs
                      </span>
                    </span>
                  </td>
                </tr>,
                dataAgrupada[familia].map((row) => {
                  const tieneConsumoManual = Number(row.custom_average_consumption) > 0;
                  return (
                    <tr key={`sku-${row.id}-${row.custom_average_consumption}`} className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                      <td className="p-3 text-center border-r border-slate-100">
                        <button
                          onClick={() => setProductToEdit(row)}
                          className="p-1.5 hover:bg-slate-200 text-slate-500 hover:text-slate-900 rounded transition-all"
                        >
                          <Edit2 size={12} />
                        </button>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-900">{row.code}</td>
                      <td className="p-3 font-medium text-slate-600 truncate max-w-xl">{row.description}</td>
                      <td className={`p-3 text-right font-mono font-bold ${tieneConsumoManual ? "bg-purple-100 text-purple-950" : "bg-slate-50/50 text-slate-400"}`}>
                        {Number(row.custom_average_consumption).toLocaleString()} u/mes
                      </td>
                      <td className="p-3 text-center">
                        {tieneConsumoManual ? (
                          <span className="bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-md font-bold text-[9px] uppercase tracking-tight">
                            Manual Fijo
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-md font-medium text-[9px] uppercase tracking-tight">
                            Historial Movs
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ])}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL */}
      {productToEdit && (
        <ModalConsumoPromedio
          key={`modal-edit-${productToEdit.id}`}
          producto={productToEdit}
          onClose={() => setProductToEdit(null)}
          onSuccess={handleUpdateSuccess}
        />
      )}
    </div>
  );
}