"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Search, Clock, Save, RefreshCw, 
  AlertCircle, Edit3, X, Info
} from "lucide-react";

export default function ModuloLeadTime() {
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  // Estados para el Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [itemSeleccionado, setItemSeleccionado] = useState<any>(null);
  const [tempValue, setTempValue] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Traemos los datos de la vista
      const { data, error } = await supabase
        .from("v_importaciones_unidas")
        .select("codigo, descripcion, familia, lead_time, stock");
      
      if (error) throw error;

      // Al cargar, definimos que el valor 'original' es el que viene de la base de datos
      const dataMapeada = (data || []).map(item => ({
        ...item,
        lead_time_original: item.lead_time 
      }));

      setProductos(dataMapeada);
    } catch (err) { 
      console.error("Error fetching:", err); 
    } finally { 
      setLoading(false); 
    }
  }

  const handleAbrirModal = (item: any) => {
    setItemSeleccionado(item);
    setTempValue(item.lead_time || 0);
    setModalOpen(true);
  };

  const handleCerrarModal = () => {
    setModalOpen(false);
    setItemSeleccionado(null);
  };

  async function handleSave() {
    if (!itemSeleccionado) return;
    setIsSaving(true);
    try {
      // Actualizamos en la tabla física imp_maestro
      const { error } = await supabase
        .from("imp_maestro")
        .update({ lead_time: tempValue })
        .eq("codigo", itemSeleccionado.codigo);

      if (error) throw error;
      
      // Actualizamos el estado local para que la UI reaccione inmediatamente
      setProductos(prev => prev.map(p => 
        p.codigo === itemSeleccionado.codigo ? { ...p, lead_time: tempValue } : p
      ));
      handleCerrarModal();
    } catch (err: any) {
      alert("Error al actualizar: " + err.message);
    } finally { 
      setIsSaving(false); 
    }
  }

  const filteredData = useMemo(() => {
    return productos.filter(p => 
      p.codigo.toLowerCase().includes(search.toLowerCase()) || 
      (p.descripcion || "").toLowerCase().includes(search.toLowerCase())
    );
  }, [productos, search]);

  return (
    <div className="bg-[#f4f7f9] min-h-screen font-sans text-[#1d2d3d] pb-10">
      
      <header className="bg-[#1e293b] text-white p-4 shadow-lg flex justify-between items-center sticky top-0 z-50 border-b-4 border-blue-500">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded shadow-inner">
            <Clock size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter uppercase text-white">Gestión de Lead Times</h1>
            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.2em]">Configuración de Tiempos de Tránsito Logístico</p>
          </div>
        </div>
        <button onClick={fetchData} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-all">
          <RefreshCw size={18} className={loading ? "animate-spin text-blue-400" : "text-slate-300"} />
        </button>
      </header>

      <main className="max-w-[1400px] mx-auto p-6 space-y-6">
        
        <div className="bg-white p-5 rounded-xl shadow-md border border-slate-200 flex items-center px-6 group transition-all focus-within:border-blue-300">
          <Search className="text-slate-400 mr-4 group-focus-within:text-blue-500 transition-colors" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por SKU o descripción de material..."
            className="w-full py-2 outline-none text-sm font-bold bg-transparent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 overflow-hidden">
          {loading ? (
            <div className="p-20 text-center flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="font-black text-slate-400 uppercase tracking-widest text-sm">Cargando datos maestros...</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[650px] custom-scrollbar">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] sticky top-0 z-10 border-b border-slate-300">
                    <th className="p-4 w-20 text-center">Editar</th>
                    <th className="p-4">SKU Material</th>
                    <th className="p-4 w-1/3">Descripción</th>
                    <th className="p-4 text-center">Stock</th>
                    <th className="p-4 text-center bg-blue-50 text-blue-800 italic">Lead Time (Días)</th>
                    <th className="p-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredData.map((item) => {
                    // LÓGICA DE STATUS: Solo muestra si cambió respecto al valor original de carga
                    const fueModificado = item.lead_time !== item.lead_time_original;
                    
                    return (
                      <tr key={item.codigo} className="group hover:bg-blue-50/50 transition-colors">
                        <td className="p-3 text-center">
                          <button onClick={() => handleAbrirModal(item)} className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-white hover:shadow-md rounded-lg transition-all">
                            <Edit3 size={16} />
                          </button>
                        </td>
                        <td className="p-4 font-black text-slate-800">{item.codigo}</td>
                        <td className="p-4">
                          <div className="font-bold text-slate-500 uppercase text-[11px] leading-tight">{item.descripcion}</div>
                          <div className="mt-1 text-[9px] font-black text-blue-400 uppercase tracking-tighter italic opacity-70">
                            {item.familia || 'IMPORTACIONES'}
                          </div>
                        </td>
                        <td className="p-4 text-center font-black text-slate-700">
                          {Math.round(item.stock || 0).toLocaleString()}
                        </td>
                        <td className="p-4 text-center bg-blue-50/30 font-black text-blue-600 text-base italic">
                          {item.lead_time || 0}
                        </td>
                        <td className="p-4 text-center">
                          {fueModificado ? (
                            <span className="inline-flex items-center bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border border-amber-200 shadow-sm animate-pulse">
                              Modificado
                            </span>
                          ) : (
                            <span className="text-slate-300 text-[10px] font-bold uppercase">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* MODAL FIORI PREMIUM */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#1e293b]/60 backdrop-blur-md animate-in fade-in duration-300" onClick={handleCerrarModal} />
          
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in duration-200 border border-slate-200">
            <div className="bg-[#1e293b] p-6 text-white flex justify-between items-center border-b-4 border-blue-600">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded shadow-lg"><Clock size={18} /></div>
                <h3 className="font-black italic uppercase text-xs tracking-widest">Ajustar Lead Time</h3>
              </div>
              <button onClick={handleCerrarModal} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>

            <div className="p-8 space-y-6">
              <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Producto SAP</p>
                <h4 className="font-black text-slate-800 text-xl tracking-tighter">{itemSeleccionado?.codigo}</h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase truncate italic">{itemSeleccionado?.descripcion}</p>
              </div>

              <div className="space-y-3 text-center">
                <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center justify-center gap-2">
                   Días de Tránsito <Info size={12} />
                </label>
                <input 
                  type="number"
                  autoFocus
                  className="w-full p-6 bg-blue-50 border-2 border-blue-100 rounded-[2rem] font-black text-5xl text-blue-600 outline-none focus:border-blue-500 focus:bg-white transition-all text-center"
                  value={tempValue}
                  onChange={(e) => setTempValue(parseInt(e.target.value) || 0)}
                  onFocus={(e) => e.target.select()}
                />
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button onClick={handleCerrarModal} className="flex-1 py-4 text-slate-400 font-black text-[10px] uppercase">Cancelar</button>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-2"
              >
                {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                Confirmar SAP
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      `}</style>
    </div>
  );
}