"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { 
  AlertCircle, Ship, Package, RefreshCw, 
  BarChart3, Calendar, ChevronDown, ChevronUp, 
  TrendingDown, Layers, Filter, Activity, 
  Search, ArrowUpRight, TrendingUp,
  CheckCircle2
} from "lucide-react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, AreaChart, Area, ReferenceLine, Label
} from 'recharts';

// --- COMPONENTES DE UI ---

const KPIStatusCard = ({ title, value, subtitle, icon: Icon, colorClass, loading }: any) => (
  <div className={`bg-white border-l-4 ${colorClass} p-5 shadow-sm hover:shadow-md transition-all group relative overflow-hidden`}>
    <div className="flex justify-between items-start">
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter mb-1">{title}</p>
        {loading ? (
          <div className="h-8 w-24 bg-slate-100 animate-pulse rounded" />
        ) : (
          <p className="text-3xl font-light tracking-tight text-slate-800">{value}</p>
        )}
      </div>
      <div className={`p-2 rounded-lg ${colorClass.replace('border-', 'bg-')}/10`}>
        <Icon size={20} className={colorClass.replace('border-', 'text-')} />
      </div>
    </div>
    <div className="mt-4">
      <span className="text-[9px] font-bold py-0.5 px-2 bg-slate-100 rounded-full text-slate-500 uppercase tracking-wider">
        {subtitle}
      </span>
    </div>
  </div>
);

const SectionHeader = ({ title, subtitle, icon: Icon }: any) => (
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-white rounded-lg shadow-sm border border-slate-100">
      <Icon size={18} className="text-slate-600" />
    </div>
    <div>
      <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider">{title}</h2>
      <p className="text-[10px] text-slate-400 font-medium">{subtitle}</p>
    </div>
  </div>
);

export default function DashboardLogisticoPro() {
  const [data, setData] = useState<any[]>([]);
  const [arribos, setArribos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFamilia, setFilterFamilia] = useState("TODAS");
  const [selectedSKU, setSelectedSKU] = useState<string | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<number | null>(1);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: vData } = await supabase.from("v_importaciones_unidas").select("*");
      const { data: aData } = await supabase.from("imp_arribos").select("*");
      setData(vData || []);
      setArribos(aData || []);
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  }

  const analytics = useMemo(() => {
    if (!data.length) return null;

    const processed = data.map(p => {
      const stock = Math.max(0, Math.floor(parseFloat(p.stock) || 0));
      const leadTimeDias = parseFloat(p.lead_time) || 30;
      const leadTimeMeses = leadTimeDias / 30;
      
      let history: any[] = [];
      let totalSalidas = 0;

      // Escaneo dinámico de columnas de salida (s25_, s26_, etc)
      Object.keys(p).forEach(key => {
        if (/^s\d{2}_/i.test(key)) {
          const valor = Math.abs(parseFloat(p[key]) || 0);
          totalSalidas += valor;
          const label = key.replace(/^s\d{2}_/i, '').toUpperCase();
          history.push({ mes: label, unidades: valor });
        }
      });

      const promedio = parseFloat(p.promedio_mensual) || (totalSalidas / (history.length || 1));
      const cobertura = promedio > 0 ? stock / promedio : (stock > 0 ? 99 : 0);

      // --- LÓGICA DE SALUD (Basada en Lead Time solicitado) ---
      let estadoSalud = "OKEY";
      if (cobertura < 1) estadoSalud = "CRÍTICO";
      else if (cobertura <= leadTimeMeses) estadoSalud = "RIESGO";
      else if (stock > (promedio * (leadTimeMeses + 3))) estadoSalud = "SOBRESTOCK";
      else if (stock > (promedio * (leadTimeMeses + 1))) estadoSalud = "ÓPTIMO";

      return { 
        ...p, stock, promedio, cobertura, history, estadoSalud, leadTimeMeses,
        maxSalida: Math.max(...history.map(h => h.unidades), 0)
      };
    });

    // Quiebres y Riesgo Total (Mes 1 al 5)
    const quiebres = { m1: [], m2: [], m3: [], m4: [], m5: [] };
    processed.forEach(p => {
      for(let i=1; i<=5; i++) {
        if (p.cobertura >= i-1 && p.cobertura < i) (quiebres as any)[`m${i}`].push(p);
      }
    });

    const totalRiesgoM1M5 = Object.values(quiebres).reduce((acc, curr) => acc + curr.length, 0);

    // ABC Filtrable
    const dataABC = filterFamilia === "TODAS" ? processed : processed.filter(p => p.familia === filterFamilia);
    const totalVentas = dataABC.reduce((acc, p) => acc + (p.promedio * 12), 0);
    let acumulado = 0;
    const sortedABC = [...dataABC].sort((a, b) => b.promedio - a.promedio).map(p => {
      acumulado += (p.promedio * 12);
      const pct = (acumulado / totalVentas) * 100;
      return { ...p, pct, clase: pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C' };
    });

    return {
      processed,
      sortedABC,
      quiebres,
      totalRiesgoM1M5,
      familias: Array.from(new Set(processed.map(p => p.familia).filter(Boolean))),
      stats: {
        critico: processed.filter(p => p.estadoSalud === "CRÍTICO").length,
        riesgo: processed.filter(p => p.estadoSalud === "RIESGO").length,
        optimo: processed.filter(p => p.estadoSalud === "ÓPTIMO").length,
        sobrestock: processed.filter(p => p.estadoSalud === "SOBRESTOCK").length,
        totalStock: processed.reduce((acc, p) => acc + p.stock, 0)
      }
    };
  }, [data, filterFamilia]);

  const selectedData = useMemo(() => 
    analytics?.processed.find(p => p.codigo === selectedSKU), [selectedSKU, analytics]
  );

  if (loading) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900">
      <RefreshCw size={40} className="animate-spin text-blue-500 mb-4" />
      <span className="text-white font-black text-xs tracking-[0.3em]">SINCRONIZANDO CD...</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 pb-10">
      {/* HEADER */}
      <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white">
            <Package size={18} />
          </div>
          <h1 className="font-black text-xs uppercase tracking-tighter">SAP Supply Chain <span className="text-blue-600">Planning</span></h1>
        </div>
        <button onClick={fetchData} className="text-[10px] font-black bg-slate-100 px-3 py-1.5 rounded hover:bg-slate-200 transition-all flex items-center gap-2">
          <RefreshCw size={12} /> REFRESCAR DASHBOARD
        </button>
      </header>

      <div className="max-w-[1600px] mx-auto p-6 space-y-6">
        
        {/* KPI ROW */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KPIStatusCard title="Stock Total CD" value={analytics?.stats.totalStock.toLocaleString()} subtitle="Unidades Físicas" icon={Package} colorClass="border-slate-800" />
          <KPIStatusCard title="Riesgo Total (1-5M)" value={analytics?.totalRiesgoM1M5} subtitle="SKUs bajo lead time" icon={AlertCircle} colorClass="border-red-500" />
          <KPIStatusCard title="Eficiencia Óptima" value={analytics?.stats.optimo} subtitle="Stock balanceado" icon={CheckCircle2} colorClass="border-emerald-500" />
          <KPIStatusCard title="Exceso Detectado" value={analytics?.stats.sobrestock} subtitle="Capital inmovilizado" icon={TrendingUp} colorClass="border-amber-500" />
        </div>

        {/* MIDDLE SECTION: SALUD Y ARRIBOS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <SectionHeader title="Salud del Inventario" subtitle="Criterio: Stock vs Lead Time" icon={Activity} />
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                  <p className="text-[10px] font-black text-red-600 uppercase">Crítico (&lt;1M)</p>
                  <p className="text-2xl font-light">{analytics?.stats.critico}</p>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg border border-orange-100">
                  <p className="text-[10px] font-black text-orange-600 uppercase">En Riesgo (&lt;LT)</p>
                  <p className="text-2xl font-light">{analytics?.stats.riesgo}</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                  <p className="text-[10px] font-black text-emerald-600 uppercase">Óptimo</p>
                  <p className="text-2xl font-light">{analytics?.stats.optimo}</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-[10px] font-black text-blue-600 uppercase">Sobrestock</p>
                  <p className="text-2xl font-light">{analytics?.stats.sobrestock}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-slate-400" />
                  <span className="text-[10px] font-black uppercase text-slate-500">Cronograma de Quiebre</span>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {[1, 2, 3, 4, 5].map(m => (
                  <div key={m}>
                    <button onClick={() => setExpandedMonth(expandedMonth === m ? null : m)} className="w-full p-4 flex justify-between items-center hover:bg-slate-50">
                      <span className="text-[11px] font-bold text-slate-600 tracking-tight">Mes de Quiebre: {m}</span>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-black rounded-full">{(analytics?.quiebres as any)[`m${m}`].length}</span>
                        {expandedMonth === m ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                      </div>
                    </button>
                    {expandedMonth === m && (
                      <div className="bg-slate-50/50 max-h-48 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        {(analytics?.quiebres as any)[`m${m}`].map((p: any) => (
                          <div key={p.codigo} className="bg-white p-2 border border-slate-100 rounded text-[10px] flex justify-between items-center">
                            <span className="font-bold">{p.codigo}</span>
                            <span className="text-red-500 font-black">{p.cobertura.toFixed(1)}m</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
              <SectionHeader title="Monitor de Arribos" subtitle="Tránsitos y ETAs confirmadas" icon={Ship} />
            </div>
            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white border-b text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="p-4">SKU / Identificador</th>
                    <th className="p-4">Contenedor</th>
                    <th className="p-4 text-center">Cantidad</th>
                    <th className="p-4 text-center">ETA CD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {arribos.map((a, i) => (
                    <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                      <td className="p-4 text-[11px] font-bold text-slate-700">{a.codigo}</td>
                      <td className="p-4 text-[10px] font-medium text-blue-500">{a.contenedor || 'EN TRÁNSITO'}</td>
                      <td className="p-4 text-center font-mono font-bold text-xs">{Math.floor(a.arribo).toLocaleString()}</td>
                      <td className="p-4 text-center">
                        <span className="bg-slate-100 px-2 py-1 rounded text-[10px] font-bold">{a.fecha_arribo || 'POR CONFIRMAR'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION: ABC Y GRÁFICO */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-[600px] flex flex-col">
            <div className="p-5 border-b flex items-center justify-between bg-white">
              <SectionHeader title="Clasificación ABC" subtitle="Análisis de Pareto por Familia" icon={TrendingDown} />
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input 
                    type="text" placeholder="Buscar SKU..." 
                    className="pl-9 pr-4 py-2 bg-slate-100 border-none rounded-lg text-xs font-bold"
                    onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                  />
                </div>
                <select 
                  className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black rounded-lg uppercase"
                  value={filterFamilia} onChange={(e) => setFilterFamilia(e.target.value)}
                >
                  <option value="TODAS">TODAS LAS FAMILIAS</option>
                  {analytics?.familias.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-slate-50 text-[9px] font-black text-slate-400 uppercase border-b">
                  <tr>
                    <th className="p-4">Producto</th>
                    <th className="p-4 text-center">Promedio Mensual</th>
                    <th className="p-4 text-center">Stock CD</th>
                    <th className="p-4 text-center">Cobertura</th>
                    <th className="p-4 text-center">Salud</th>
                    <th className="p-4 text-center">Clase</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {analytics?.sortedABC
                    .filter(p => p.codigo.includes(searchTerm) || p.descripcion.includes(searchTerm))
                    .map((p, i) => (
                    <tr key={i} onClick={() => setSelectedSKU(p.codigo)} className={`hover:bg-blue-50 cursor-pointer ${selectedSKU === p.codigo ? 'bg-blue-50' : ''}`}>
                      <td className="p-4">
                        <p className="text-[11px] font-black text-slate-800">{p.codigo}</p>
                        <p className="text-[9px] text-slate-400 uppercase truncate w-60">{p.descripcion}</p>
                      </td>
                      <td className="p-4 text-center font-mono text-xs text-blue-600 font-bold">{Math.floor(p.promedio).toLocaleString()}</td>
                      <td className="p-4 text-center font-mono text-xs font-bold">{p.stock.toLocaleString()}</td>
                      <td className="p-4 text-center">
                        <span className={`text-[10px] font-black ${p.cobertura < 1 ? 'text-red-500' : 'text-slate-700'}`}>
                          {p.cobertura.toFixed(1)} M
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`text-[8px] font-black px-2 py-1 rounded-full ${
                          p.estadoSalud === 'CRÍTICO' ? 'bg-red-100 text-red-600' : 
                          p.estadoSalud === 'RIESGO' ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'
                        }`}>
                          {p.estadoSalud}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-black mx-auto ${
                          p.clase === 'A' ? 'bg-emerald-500 text-white' : p.clase === 'B' ? 'bg-blue-500 text-white' : 'bg-slate-200'
                        }`}>
                          {p.clase}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-[600px] flex flex-col">
            <SectionHeader title="Histórico de Salidas" subtitle={selectedSKU || "Seleccione un SKU"} icon={BarChart3} />
            <div className="flex-1 mt-6">
              {selectedSKU ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={selectedData?.history}>
                    <defs>
                      <linearGradient id="colorSal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: 700}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: 700}} />
                    <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                    <Area type="monotone" dataKey="unidades" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorSal)" />
                    {/* Referencia de Pico Máximo */}
                    <ReferenceLine y={selectedData?.maxSalida} stroke="#ef4444" strokeDasharray="3 3">
                      <Label value="PICO MAX" position="top" fill="#ef4444" fontSize={8} fontWeight={900} />
                    </ReferenceLine>
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Seleccione un SKU en la tabla</p>
                </div>
              )}
            </div>
            {selectedSKU && (
              <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Promedio Mensual</span>
                  <span className="text-sm font-bold text-slate-700">{Math.floor(selectedData?.promedio).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Lead Time (M)</span>
                  <span className="text-sm font-bold text-blue-600">{selectedData?.leadTimeMeses.toFixed(1)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
}