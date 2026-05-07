"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Search, Ship, X, Edit2, PackageCheck, Truck, Plus, Trash2, Save } from "lucide-react";

export default function GestionArribosSAP() {
  const [materiales, setMateriales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroConArribo, setFiltroConArribo] = useState(false);
  
  const [modalAbierto, setModalAbierto] = useState(false);
  const [itemSeleccionado, setItemSeleccionado] = useState<any>(null);
  const [arribosDetalle, setArribosDetalle] = useState<any[]>([]);
  const [guardando, setGuardando] = useState(false);

  // Lista de meses para las columnas de la tabla (ajusta según necesites)
  const MESES = [
    { id: 4, nombre: "MAY" },
    { id: 5, nombre: "JUN" },
    { id: 6, nombre: "JUL" },
    { id: 7, nombre: "AGO" },
    { id: 8, nombre: "SEP" },
    { id: 9, nombre: "OCT" },
  ];

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    
    // Traemos datos en paralelo para mayor velocidad
    const [maestroRes, arribosRes] = await Promise.all([
      supabase.from("imp_maestro").select("codigo, descripcion, stock").order("codigo"),
      supabase.from("imp_arribos").select("id, codigo, arribo, fecha_arribo")
    ]);

    if (maestroRes.data && arribosRes.data) {
      const dataUnificada = maestroRes.data.map(item => {
        // Filtramos todos los arribos que pertenecen a este código
        const arribosDelItem = arribosRes.data.filter(a => a.codigo === item.codigo);
        
        // Sumamos las cantidades
        const totalArribos = arribosDelItem.reduce((sum, curr) => sum + Number(curr.arribo), 0);
        
        // Obtenemos el ETA más cercano (ordenando por fecha)
        const proximoEta = arribosDelItem.length > 0 
          ? arribosDelItem.sort((a,b) => new Date(a.fecha_arribo).getTime() - new Date(b.fecha_arribo).getTime())[0].fecha_arribo 
          : null;

        return {
          ...item,
          total_arribo: totalArribos,
          lista_arribos: arribosDelItem, // Guardamos la lista para colorear los meses
          tiene_multiples: arribosDelItem.length > 1,
          primer_arribo: proximoEta
        };
      });
      setMateriales(dataUnificada);
    }
    setLoading(false);
  }

  // Lógica para determinar si un mes específico tiene arribos planificados
  const tieneArriboEnMes = (lista: any[], mesIndex: number) => {
    return lista.some(a => {
      if (!a.fecha_arribo) return false;
      const fecha = new Date(a.fecha_arribo + "T12:00:00");
      return fecha.getMonth() === mesIndex;
    });
  };

  const abrirModal = async (item: any) => {
    setItemSeleccionado(item);
    setArribosDetalle(item.lista_arribos || []);
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setItemSeleccionado(null);
    setArribosDetalle([]);
  };

  const agregarFila = () => {
    setArribosDetalle([...arribosDetalle, { id: `temp_${Date.now()}`, arribo: "", fecha_arribo: "" }]);
  };

  const actualizarFila = (id: any, campo: string, valor: any) => {
    setArribosDetalle(prev => prev.map(fila => 
      fila.id === id ? { ...fila, [campo]: valor } : fila
    ));
  };

  const eliminarFila = async (id: any) => {
    if (typeof id === 'number') {
      await supabase.from("imp_arribos").delete().eq("id", id);
    }
    setArribosDetalle(prev => prev.filter(fila => fila.id !== id));
  };

  const guardarArribosMultiples = async () => {
    setGuardando(true);
    try {
      const codigo = itemSeleccionado.codigo;

      const nuevos = arribosDetalle
        .filter(f => typeof f.id === 'string' && f.id.startsWith('temp_') && Number(f.arribo) > 0 && f.fecha_arribo)
        .map(f => ({ codigo, arribo: Number(f.arribo), fecha_arribo: f.fecha_arribo }));

      const existentes = arribosDetalle
        .filter(f => typeof f.id === 'number' && Number(f.arribo) > 0 && f.fecha_arribo)
        .map(f => ({ id: f.id, codigo, arribo: Number(f.arribo), fecha_arribo: f.fecha_arribo }));

      if (nuevos.length > 0) {
        const { error: err1 } = await supabase.from("imp_arribos").insert(nuevos);
        if (err1) throw err1;
      }
      if (existentes.length > 0) {
        const { error: err2 } = await supabase.from("imp_arribos").upsert(existentes);
        if (err2) throw err2;
      }

      await fetchData();
      cerrarModal();
    } catch (error) {
      console.error(error);
      alert("Error al guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const dataFiltrada = materiales.filter(m => {
    const busqueda = search.toLowerCase();
    const cumpleBusqueda = m.codigo?.toLowerCase().includes(busqueda) || 
                           m.descripcion?.toLowerCase().includes(busqueda);
    const cumpleFiltro = filtroConArribo ? (m.total_arribo > 0) : true;
    return cumpleBusqueda && cumpleFiltro;
  });

  return (
    <div className="bg-[#f4f7f9] min-h-screen font-sans text-[#1d2d3d] pb-10">
      <header className="bg-[#1e293b] text-white p-4 shadow-lg flex justify-between items-center sticky top-0 z-40 border-b-4 border-blue-500">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded shadow-inner"><Truck size={24} /></div>
          <div>
            <h1 className="text-xl font-black tracking-tighter">INBOUND LOGISTICS</h1>
            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.2em]">Gestión Centralizada</p>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 space-y-6">
        {/* Filtros */}
        <div className="bg-white p-6 rounded-xl shadow-md flex flex-wrap gap-6 items-center justify-between border border-slate-200">
          <div className="flex-1 min-w-[350px] relative">
            <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar material..." 
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setFiltroConArribo(!filtroConArribo)}
            className={`px-6 py-3 rounded-xl text-xs font-black transition-all border ${filtroConArribo ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-slate-600'}`}
          >
            {filtroConArribo ? "CÓDIGOS EN TRÁNSITO" : "VER TODO EL MAESTRO"}
          </button>
        </div>

        {/* Tabla Principal */}
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 overflow-hidden">
          {loading ? (
             <div className="p-20 text-center animate-pulse font-black text-slate-400">CARGANDO DATOS...</div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] sticky top-0 z-10 border-b border-slate-300">
                    <th className="p-4 text-center">Edit</th>
                    <th className="p-4">Código</th>
                    <th className="p-4 w-64">Descripción</th>
                    <th className="p-4 text-center">Stock</th>
                    <th className="p-4 text-center bg-blue-50 text-blue-800">Tránsito</th>
                    <th className="p-4 text-center">Próximo ETA</th>
                    {MESES.map(m => (
                      <th key={m.id} className="p-4 text-center border-l border-slate-200 w-20">{m.nombre}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dataFiltrada.map(item => (
                    <tr key={item.codigo} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-center">
                        <button onClick={() => abrirModal(item)} className="p-2 text-slate-400 hover:text-blue-600 transition-all">
                          <Edit2 size={16}/>
                        </button>
                      </td>
                      <td className="p-4 font-black text-slate-800">{item.codigo}</td>
                      <td className="p-4 font-bold text-slate-500 uppercase text-[10px] truncate max-w-xs">{item.descripcion}</td>
                      <td className="p-4 text-center font-black text-slate-700">{Number(item.stock || 0).toLocaleString()}</td>
                      <td className="p-4 text-center bg-blue-50/50">
                        <span className={`font-black text-base ${item.total_arribo > 0 ? 'text-blue-600' : 'text-slate-300'}`}>
                          {item.total_arribo > 0 ? `+${item.total_arribo.toLocaleString()}` : "0"}
                        </span>
                      </td>
                      <td className="p-4 text-center font-bold text-slate-600 text-xs">
                        {item.primer_arribo ? new Date(`${item.primer_arribo}T12:00:00`).toLocaleDateString() : "---"}
                      </td>
                      {/* Celdas de Meses Coloreadas */}
                      {MESES.map(mes => {
                        const activo = tieneArriboEnMes(item.lista_arribos, mes.id);
                        return (
                          <td key={mes.id} className={`p-4 text-center border-l border-slate-100 transition-all ${activo ? 'bg-blue-500 text-white font-black' : 'text-slate-200'}`}>
                            {activo ? <Ship size={14} className="mx-auto" /> : "0"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Modal - Mismo funcionamiento pero más robusto */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="bg-slate-800 text-white p-5 flex justify-between items-center">
              <div>
                <h2 className="font-black text-lg">Planificar Arribos</h2>
                <p className="text-xs text-slate-300 font-bold">{itemSeleccionado?.codigo} - {itemSeleccionado?.descripcion}</p>
              </div>
              <button onClick={cerrarModal} className="p-2 hover:bg-red-500 rounded-lg"><X size={18}/></button>
            </div>
            <div className="p-6 bg-slate-50 space-y-3 max-h-[60vh] overflow-y-auto">
              {arribosDetalle.map((fila) => (
                <div key={fila.id} className="flex items-center gap-4 bg-white p-3 rounded-xl border shadow-sm">
                  <div className="flex-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Cantidad</label>
                    <input type="number" className="w-full p-2 font-black border rounded-lg outline-none" value={fila.arribo} onChange={(e) => actualizarFila(fila.id, 'arribo', e.target.value)} />
                  </div>
                  <div className="flex-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Fecha ETA</label>
                    <input type="date" className="w-full p-2 font-bold border rounded-lg outline-none" value={fila.fecha_arribo} onChange={(e) => actualizarFila(fila.id, 'fecha_arribo', e.target.value)} />
                  </div>
                  <button onClick={() => eliminarFila(fila.id)} className="mt-4 p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
                </div>
              ))}
              <button onClick={agregarFila} className="w-full py-3 border-2 border-dashed border-blue-300 text-blue-600 font-bold rounded-xl hover:bg-blue-50 flex items-center justify-center gap-2">
                <Plus size={18} /> AGREGAR NUEVO ARRIBO
              </button>
            </div>
            <div className="p-4 border-t bg-white flex justify-end gap-3">
              <button onClick={cerrarModal} className="px-5 py-2 font-bold text-slate-500">Cancelar</button>
              <button onClick={guardarArribosMultiples} disabled={guardando} className="px-6 py-2 font-black text-white bg-blue-600 rounded-xl shadow-md">
                {guardando ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}