"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Search, Ship, Save, X, Edit2, PackageCheck, Truck } from "lucide-react";

export default function GestionArribosSAP() {
  const [materiales, setMateriales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroConArribo, setFiltroConArribo] = useState(false);
  
  const [editandoCodigo, setEditandoCodigo] = useState<string | null>(null);
  // Cambiado a string para permitir borrar el 0 en el input
  const [tempData, setTempData] = useState({ arribo: "" as string | number, fecha_arribo: "" });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const { data, error } = await supabase
      .from("v_importaciones_unidas")
      .select("codigo, descripcion, stock, arribo, fecha_arribo")
      .order("codigo");
      
    if (data) setMateriales(data);
    if (error) console.error("Error cargando vista:", error);
    setLoading(false);
  }

  const iniciarEdicion = (item: any) => {
    setEditandoCodigo(item.codigo);
    setTempData({ 
      // Si es 0, dejamos vacío para que el usuario no tenga que borrar el 0
      arribo: item.arribo === 0 ? "" : item.arribo, 
      fecha_arribo: item.fecha_arribo || "" 
    });
  };

  const cancelarEdicion = () => {
    setEditandoCodigo(null);
  };

  const guardarArribo = async (codigo: string) => {
    setGuardando(true);
    // Convertimos a número antes de enviar
    const valorArribo = Number(tempData.arribo) || 0;
    
    try {
      const { error } = await supabase
        .from("imp_arribos") 
        .upsert({ 
          codigo: codigo,
          arribo: valorArribo, 
          fecha_arribo: tempData.fecha_arribo === "" ? null : tempData.fecha_arribo 
        }, { onConflict: 'codigo' });

      if (error) throw error;

      setMateriales(prev => prev.map(m => 
        m.codigo === codigo 
          ? { ...m, arribo: valorArribo, fecha_arribo: tempData.fecha_arribo } 
          : m
      ));
      setEditandoCodigo(null);
    } catch (error) {
      console.error("Error guardando:", error);
      alert("Error al actualizar arribo. Asegúrate de haber ejecutado el SQL de permisos.");
    } finally {
      setGuardando(false);
    }
  };

  const dataFiltrada = materiales.filter(m => {
    const busqueda = search.toLowerCase();
    const cumpleBusqueda = m.codigo?.toLowerCase().includes(busqueda) || 
                           m.descripcion?.toLowerCase().includes(busqueda);
    const cumpleFiltro = filtroConArribo ? (m.arribo > 0) : true;
    return cumpleBusqueda && cumpleFiltro;
  });

  return (
    <div className="bg-[#f4f7f9] min-h-screen font-sans text-[#1d2d3d] pb-10">
      <header className="bg-[#1e293b] text-white p-4 shadow-lg flex justify-between items-center sticky top-0 z-50 border-b-4 border-blue-500">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded shadow-inner"><Truck size={24} /></div>
          <div>
            <h1 className="text-xl font-black tracking-tighter">INBOUND LOGISTICS</h1>
            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.2em]">Gestión de Arribos en Tránsito</p>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto p-6 space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 flex flex-wrap gap-6 items-center justify-between">
          <div className="flex-1 min-w-[350px] relative">
            <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Filtrar por SKU o nombre de material..." 
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-sm"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setFiltroConArribo(!filtroConArribo)}
            className={`px-6 py-3.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-sm border ${filtroConArribo ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
          >
            <PackageCheck size={18}/>
            {filtroConArribo ? "VIENDO SOLO EN TRÁNSITO" : "VER TODO EL MAESTRO"}
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 overflow-hidden">
          {loading ? (
             <div className="p-20 text-center flex flex-col items-center gap-4">
               <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
               <p className="font-black text-slate-400 uppercase tracking-widest text-sm">Sincronizando con Servidor SAP...</p>
             </div>
          ) : (
            <div className="overflow-x-auto max-h-[650px] custom-scrollbar">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] sticky top-0 z-10 border-b border-slate-300">
                    <th className="p-4 w-20 text-center">Editar</th>
                    <th className="p-4">SKU Material</th>
                    <th className="p-4 w-1/3">Descripción Comercial</th>
                    <th className="p-4 text-center">Stock Actual</th>
                    <th className="p-4 text-center bg-blue-50 text-blue-800">Cantidad Arribo</th>
                    <th className="p-4 text-center bg-blue-50 text-blue-800">Fecha ETA (Arribo)</th>
                    <th className="p-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dataFiltrada.map(item => {
                    const enEdicion = editandoCodigo === item.codigo;
                    return (
                      <tr key={item.codigo} className={`group transition-colors ${enEdicion ? 'bg-blue-50/70' : 'hover:bg-slate-50'}`}>
                        <td className="p-3 text-center">
                          {enEdicion ? (
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => guardarArribo(item.codigo)} disabled={guardando} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-md transition-transform active:scale-90"><Save size={16}/></button>
                              <button onClick={cancelarEdicion} className="p-2 bg-white border border-red-200 text-red-500 rounded-lg hover:bg-red-50 shadow-sm"><X size={16}/></button>
                            </div>
                          ) : (
                            <button onClick={() => iniciarEdicion(item)} className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-white hover:shadow-md rounded-lg transition-all">
                              <Edit2 size={16}/>
                            </button>
                          )}
                        </td>
                        <td className="p-4 font-black text-slate-800">{item.codigo}</td>
                        <td className="p-4 font-bold text-slate-500 uppercase text-[11px] leading-tight">{item.descripcion}</td>
                        <td className="p-4 text-center font-black text-slate-700">{Number(item.stock || 0).toLocaleString()}</td>
                        
                        <td className={`p-4 text-center ${enEdicion ? 'bg-white' : ''}`}>
                          {enEdicion ? (
                            <input 
                              type="number" 
                              className="w-28 p-2 text-center font-black border-2 border-blue-400 rounded-lg focus:outline-none focus:ring-4 focus:ring-blue-100"
                              value={tempData.arribo}
                              placeholder="0"
                              onFocus={(e) => e.target.select()}
                              onChange={e => setTempData({...tempData, arribo: e.target.value})}
                            />
                          ) : (
                            <span className={`font-black text-base ${item.arribo > 0 ? 'text-blue-600' : 'text-slate-300'}`}>
                              {item.arribo > 0 ? `+${item.arribo.toLocaleString()}` : "0"}
                            </span>
                          )}
                        </td>

                        <td className={`p-4 text-center ${enEdicion ? 'bg-white' : ''}`}>
                          {enEdicion ? (
                            <input 
                              type="date" 
                              className="w-40 p-2 text-center font-bold border-2 border-blue-400 rounded-lg focus:outline-none focus:ring-4 focus:ring-blue-100 text-xs uppercase"
                              value={tempData.fecha_arribo}
                              onChange={e => setTempData({...tempData, fecha_arribo: e.target.value})}
                            />
                          ) : (
                            <span className="font-bold text-slate-600 text-xs">
                              {item.fecha_arribo ? new Date(`${item.fecha_arribo}T12:00:00`).toLocaleDateString('es-ES', {day:'2-digit', month:'short', year:'numeric'}) : "---"}
                            </span>
                          )}
                        </td>

                        <td className="p-4 text-center">
                          {item.arribo > 0 ? (
                            <span className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter">
                                <Ship size={10}/> Navegando
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-300 uppercase">Sin tránsito</span>
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
    </div>
  );
}