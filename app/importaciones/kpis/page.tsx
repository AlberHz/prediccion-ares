"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { 
  AlertCircle, Ship, Package, RefreshCw, Activity, 
  PieChart, Tag, Calendar, ChevronDown, ChevronUp, 
  ShoppingCart, Box, BarChart3, Filter,
  TrendingDown, ListChecks, ArrowUpRight, Search,
  Clock, CheckCircle2, AlertTriangle, Info,
  TrendingUp, Layers, HardDrive, Globe
} from "lucide-react";

// --- COMPONENTES ATÓMICOS DE UI ---

const FioriBadge = ({ label, color }: { label: string, color: string }) => (
  <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase border ${color}`}>
    {label}
  </span>
);

const KPIStatusCard = ({ title, value, subtitle, icon: Icon, colorClass, loading }: any) => (
  <div className={`bg-white border-b-4 ${colorClass} p-5 shadow-sm hover:shadow-md transition-all group relative overflow-hidden`}>
    <div className="flex justify-between items-start">
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter mb-1">{title}</p>
        {loading ? (
          <div className="h-8 w-24 bg-slate-100 animate-pulse rounded" />
        ) : (
          <p className={`text-3xl font-light tracking-tight ${colorClass.replace('border-', 'text-')}`}>
            {value}
          </p>
        )}
      </div>
      <div className={`p-2 rounded-lg ${colorClass.replace('border-', 'bg-')}/10`}>
        <Icon size={20} className={colorClass.replace('border-', 'text-')} />
      </div>
    </div>
    <div className="mt-4 flex items-center gap-2">
      <span className="text-[10px] font-bold py-0.5 px-2 bg-slate-100 rounded-full text-slate-600 uppercase">
        {subtitle}
      </span>
    </div>
    <div className="absolute bottom-0 right-0 opacity-5 group-hover:opacity-10 transition-opacity">
      <Icon size={80} />
    </div>
  </div>
);

export default function DashboardLogisticoMaster() {
  const [data, setData] = useState<any[]>([]);
  const [arribos, setArribos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonth, setExpandedMonth] = useState<number | null>(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterFamilia, setFilterFamilia] = useState("TODAS");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: vData } = await supabase
        .from("v_importaciones_unidas")
        .select("*")
        .order('codigo', { ascending: true });

      const { data: aData } = await supabase
        .from("imp_arribos")
        .select("*")
        .order('fecha_arribo', { ascending: true });

      setData(vData || []);
      setArribos(aData || []);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  }

  // --- BUSINESS LOGIC ENGINE ---
  const analytics = useMemo(() => {
    if (!data.length) return null;

    // 1. FILTRADO BASE
    const filteredBase = data.filter(p => {
      const matchesSearch = p.codigo?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           p.descripcion?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFamilia = filterFamilia === "TODAS" || p.familia === filterFamilia;
      return matchesSearch && matchesFamilia;
    });

    // 2. LÓGICA "COMPRAR YA" (Stock < 0.5 mes de venta o Estado explícito)
    const productosComprarYa = data.filter(p => p.estado === "COMPRAR YA");
    const gestionUrgenteCount = productosComprarYa.length;

    // 3. QUIEBRES FUTUROS EXCLUYENTES (PIRÁMIDE DE RIESGO)
    const getQuiebresExcluyentes = () => {
      let yaAsignados = new Set();
      const meses = [1, 2, 3, 4, 5];
      const resultado: any = {};

      meses.forEach(m => {
        const quiebranEnEsteMes = data.filter(p => {
          if (yaAsignados.has(p.codigo)) return false;
          const stock = Number(p.stock) || 0;
          const vta = Number(p.promedio_mensual) || 0;
          const quiebra = stock < (vta * m);
          if (quiebra) yaAsignados.add(p.codigo);
          return quiebra;
        });
        resultado[`m${m}`] = quiebranEnEsteMes;
      });
      return resultado;
    };

    const quiebresMensuales = getQuiebresExcluyentes();

    // 4. CLASIFICACIÓN ABC (PARETO 80/15/5)
    const totalSalidas = data.reduce((acc, p) => acc + (Number(p.promedio_mensual) || 0), 0);
    const sortedABC = [...data]
      .sort((a, b) => (Number(b.promedio_mensual) || 0) - (Number(a.promedio_mensual) || 0))
      .reduce((acc: any[], p, i) => {
        const vtaVal = Number(p.promedio_mensual) || 0;
        const acumuladoAnterior = acc.length > 0 ? acc[acc.length - 1].acum : 0;
        const actualAcum = acumuladoAnterior + vtaVal;
        const pctAcum = totalSalidas > 0 ? (actualAcum / totalSalidas) * 100 : 0;
        
        acc.push({
          ...p,
          clase: pctAcum <= 80 ? "A" : pctAcum <= 95 ? "B" : "C",
          acum: actualAcum,
          peso: totalSalidas > 0 ? (vtaVal / totalSalidas) * 100 : 0
        });
        return acc;
      }, []);

    // 5. DENSIDAD POR FAMILIA
    const famMap = new Map();
    data.forEach(p => {
      const f = p.familia || "SIN FAMILIA";
      if (!famMap.has(f)) famMap.set(f, { total: 0, activos: 0, vtaTotal: 0 });
      const stats = famMap.get(f);
      stats.total += 1;
      stats.vtaTotal += Number(p.promedio_mensual) || 0;
      if ((Number(p.stock) || 0) > 0) stats.activos += 1;
    });

    const familiaStats = Array.from(famMap.entries()).map(([name, stats]) => ({
      name,
      ...stats,
      pctActivos: (stats.activos / stats.total) * 100
    })).sort((a, b) => b.total - a.total);

    return {
      filteredBase,
      productosComprarYa,
      gestionUrgenteCount,
      quiebresMensuales,
      sortedABC,
      familiaStats,
      stockTotal: data.reduce((acc, p) => acc + (Number(p.stock) || 0), 0),
      familiasUnicas: Array.from(new Set(data.map(p => p.familia))).filter(Boolean)
    };
  }, [data, searchTerm, filterFamilia]);

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-[#32363a] font-sans">
      
      {/* BARRA DE ESTADO SUPERIOR (SHELL BAR) */}
      <nav className="h-12 bg-[#354a5f] text-white flex items-center justify-between px-6 shadow-md sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="bg-blue-500 p-1 rounded-sm">
              <Layers size={18} />
            </div>
            <span className="font-bold tracking-tight text-sm uppercase">Logistics Master Dashboard</span>
          </div>
          <div className="h-6 w-[1px] bg-white/20 mx-2" />
          <div className="hidden md:flex gap-4 text-[11px] font-medium text-slate-300 uppercase">
            <span className="text-white border-b-2 border-blue-400 pb-1">Inteligencia de Inventarios</span>
            <span className="hover:text-white cursor-pointer transition-colors">Planificación OC</span>
            <span className="hover:text-white cursor-pointer transition-colors">Alertas de Tránsito</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end mr-4">
            <span className="text-[9px] font-bold text-blue-300 uppercase">Última Sincronización</span>
            <span className="text-[10px] font-mono">MAY 2026 - ONLINE</span>
          </div>
          <button 
            onClick={fetchData}
            className="p-2 hover:bg-white/10 rounded-full transition-all active:scale-95"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </nav>

      {/* SUB-HEADER CON FILTROS */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-[300px]">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Buscar por SKU o descripción..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="bg-slate-50 border border-slate-200 rounded-md px-4 py-2 text-xs font-bold text-slate-600 focus:outline-none"
            value={filterFamilia}
            onChange={(e) => setFilterFamilia(e.target.value)}
          >
            <option value="TODAS">TODAS LAS FAMILIAS</option>
            {analytics?.familiasUnicas.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center gap-2">
          <FioriBadge label="Sistema Activo" color="bg-emerald-50 text-emerald-700 border-emerald-200" />
          <div className="h-8 w-[1px] bg-slate-200 mx-2" />
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-xs font-bold hover:bg-blue-700 shadow-sm transition-colors">
            <ArrowUpRight size={14} /> EXPORTAR DATA
          </button>
        </div>
      </div>

      {/* ÁREA DE CONTENIDO */}
      <div className="p-8 space-y-8 animate-in fade-in duration-700">
        
        {/* KPI TILES GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPIStatusCard 
            title="Inventario Físico Total"
            value={analytics?.stockTotal.toLocaleString()}
            subtitle="Unidades en Almacén"
            icon={HardDrive}
            colorClass="border-blue-500"
            loading={loading}
          />
          <KPIStatusCard 
            title="Estado: Gestión Urgente"
            value={analytics?.gestionUrgenteCount}
            subtitle="SKUs por comprar ya"
            icon={AlertCircle}
            colorClass="border-red-500"
            loading={loading}
          />
          <KPIStatusCard 
            title="Pipeline Logístico"
            value={arribos.length}
            subtitle="Tránsitos Activos"
            icon={Ship}
            colorClass="border-amber-500"
            loading={loading}
          />
          <KPIStatusCard 
            title="Cobertura de Catálogo"
            value={`${analytics?.familiaStats.length}`}
            subtitle="Categorías Activas"
            icon={Globe}
            colorClass="border-emerald-500"
            loading={loading}
          />
        </div>

        {/* MAIN ANALYSIS GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LADO IZQUIERDO: QUIEBRES */}
          <div className="space-y-8">
            <section className="bg-white border border-slate-200 rounded-sm overflow-hidden flex flex-col h-[550px] shadow-sm">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-500 tracking-tighter">Proyección de Quiebres</h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">Análisis Excluyente por Mes</p>
                </div>
                <TrendingDown size={18} className="text-red-500" />
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {[1, 2, 3, 4, 5].map(m => {
                  const key = `m${m}`;
                  const items = analytics?.quiebresMensuales[key] || [];
                  const isOpen = expandedMonth === m;
                  return (
                    <div key={m} className={`border rounded-sm transition-all ${isOpen ? 'border-red-200 ring-1 ring-red-100' : 'border-slate-100'}`}>
                      <button 
                        onClick={() => setExpandedMonth(isOpen ? null : m)}
                        className={`w-full p-4 flex justify-between items-center text-[11px] font-bold uppercase transition-colors ${isOpen ? 'bg-red-50 text-red-700' : 'hover:bg-slate-50 text-slate-600'}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${isOpen ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                            {m}
                          </span>
                          <span>Mes {m}: Impacto de Quiebre</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="bg-white/50 px-2 py-0.5 rounded border border-red-200">{items.length} SKUs</span>
                          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </div>
                      </button>
                      
                      {isOpen && (
                        <div className="bg-white divide-y divide-slate-50 max-h-80 overflow-y-auto">
                          {items.length > 0 ? items.map((item: any, i: number) => (
                            <div key={i} className="p-3 flex justify-between items-center hover:bg-slate-50 group">
                              <div className="min-w-0">
                                <p className="font-black text-slate-800 text-[10px]">{item.codigo}</p>
                                <p className="text-[9px] text-slate-400 uppercase truncate w-40">{item.descripcion}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-red-600 text-[10px]">{Math.round(item.stock)} UN</p>
                                <p className="text-[8px] text-slate-400 uppercase">Stock Actual</p>
                              </div>
                            </div>
                          )) : (
                            <div className="p-8 text-center text-slate-400 text-[10px] font-bold uppercase">No hay quiebres nuevos en este periodo</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* DENSIDAD POR FAMILIA */}
            <section className="bg-white border border-slate-200 rounded-sm p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-black uppercase text-slate-500 tracking-tighter flex items-center gap-2">
                  <PieChart size={16} className="text-blue-500" /> Densidad de Catálogo
                </h3>
                <span className="text-[10px] font-bold text-slate-400">ACTIVIDAD POR RAMO</span>
              </div>
              <div className="space-y-5 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                {analytics?.familiaStats.map((fam, i) => (
                  <div key={i} className="group">
                    <div className="flex justify-between text-[10px] mb-1.5 items-end">
                      <div>
                        <p className="font-black text-slate-700 uppercase group-hover:text-blue-600 transition-colors">{fam.name}</p>
                        <p className="text-[9px] text-slate-400 font-medium">
                          {fam.total} TOTAL | <span className="text-emerald-600 font-bold">{fam.activos} ACTIVOS</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-slate-800">{fam.pctActivos.toFixed(0)}%</span>
                        <p className="text-[8px] text-slate-400 uppercase">Disponibilidad</p>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                      <div 
                        className={`h-full transition-all duration-1000 ${fam.pctActivos > 70 ? 'bg-emerald-500' : fam.pctActivos > 30 ? 'bg-blue-500' : 'bg-amber-500'}`} 
                        style={{ width: `${fam.pctActivos}%` }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* LADO DERECHO: TABLA ABC COMPLETA (OCUPA 2 COLUMNAS EN LG) */}
          <div className="lg:col-span-2 space-y-8">
            <section className="bg-white border border-slate-200 rounded-sm shadow-sm flex flex-col h-[1000px]">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-500 tracking-tighter">Clasificación ABC de Catálogo</h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">Ranking basado en promedio de salida mensual</p>
                </div>
                <div className="flex gap-2">
                  <div className="flex flex-col items-center px-3 border-r border-slate-200">
                    <span className="text-[10px] font-black text-emerald-600">80%</span>
                    <span className="text-[8px] text-slate-400 font-bold">CLASE A</span>
                  </div>
                  <div className="flex flex-col items-center px-3 border-r border-slate-200">
                    <span className="text-[10px] font-black text-blue-600">15%</span>
                    <span className="text-[8px] text-slate-400 font-bold">CLASE B</span>
                  </div>
                  <div className="flex flex-col items-center px-3">
                    <span className="text-[10px] font-black text-slate-400">5%</span>
                    <span className="text-[8px] text-slate-400 font-bold">CLASE C</span>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-white shadow-sm z-20">
                    <tr className="text-slate-400 uppercase text-[10px] font-black border-b border-slate-100">
                      <th className="p-4 bg-white">Estado / SKU</th>
                      <th className="p-4 bg-white">Descripción</th>
                      <th className="p-4 bg-white text-center">Familia</th>
                      <th className="p-4 bg-white text-center">Venta Prom.</th>
                      <th className="p-4 bg-white text-center">Stock</th>
                      <th className="p-4 bg-white text-center">Peso (%)</th>
                      <th className="p-4 bg-white text-center">Clase</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {analytics?.sortedABC.map((p, i) => {
                      const isComprarYa = p.estado === "COMPRAR YA";
                      return (
                        <tr key={i} className={`hover:bg-blue-50/30 transition-colors group ${isComprarYa ? 'bg-red-50/20' : ''}`}>
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              {isComprarYa ? (
                                <div className="bg-red-100 text-red-600 p-1.5 rounded-sm animate-pulse">
                                  <ShoppingCart size={14} />
                                </div>
                              ) : (
                                <div className="bg-slate-100 text-slate-400 p-1.5 rounded-sm">
                                  <Package size={14} />
                                </div>
                              )}
                              <span className="font-black text-slate-800 text-[11px]">{p.codigo}</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <p className="text-[10px] font-bold text-slate-700 uppercase line-clamp-1">{p.descripcion}</p>
                            {isComprarYa && <span className="text-[8px] font-black text-red-500 uppercase tracking-widest">CRÍTICO: COMPRAR YA</span>}
                          </td>
                          <td className="p-4 text-center">
                            <span className="text-[10px] text-slate-500 font-medium uppercase bg-slate-100 px-2 py-1 rounded-sm">{p.familia || 'S/F'}</span>
                          </td>
                          <td className="p-4 text-center font-black text-slate-700 text-[11px]">
                            {Math.round(p.promedio_mensual).toLocaleString()}
                          </td>
                          <td className="p-4 text-center">
                             <div className={`text-[11px] font-bold ${Number(p.stock) <= 0 ? 'text-red-500' : 'text-slate-700'}`}>
                               {Number(p.stock).toLocaleString()}
                             </div>
                          </td>
                          <td className="p-4 text-center text-[10px] text-slate-400 font-mono">
                            {p.peso.toFixed(2)}%
                          </td>
                          <td className="p-4 text-center">
                            <span className={`px-3 py-1 rounded-sm font-black text-[10px] shadow-sm ${
                              p.clase === 'A' ? 'bg-emerald-500 text-white' : 
                              p.clase === 'B' ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {p.clase}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-400 flex justify-between items-center">
                <span>MOSTRANDO {analytics?.sortedABC.length} REGISTROS</span>
                <div className="flex gap-4">
                  <span className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500 rounded-full" /> ALTO MOVIMIENTO</span>
                  <span className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded-full" /> MOVIMIENTO MEDIO</span>
                  <span className="flex items-center gap-1"><div className="w-2 h-2 bg-slate-300 rounded-full" /> BAJO MOVIMIENTO</span>
                </div>
              </div>
            </section>

            {/* SECCIÓN DE ARRIBOS E IMPACTO */}
            <section className="bg-[#1e293b] text-white rounded-sm p-6 shadow-xl border border-slate-700">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-500/20 p-2 rounded-lg border border-blue-500/30">
                    <Ship className="text-blue-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-blue-100">Seguimiento de Importaciones</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-bold">Carga en Tránsito Internacional</p>
                  </div>
                </div>
                <div className="flex gap-4">
                   <div className="text-right">
                     <p className="text-2xl font-light text-blue-400 leading-none">{arribos.length}</p>
                     <p className="text-[8px] font-black text-slate-500 uppercase">Contenedores</p>
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {arribos.map((arr, i) => {
                  const master = data.find(p => p.codigo === arr.codigo);
                  const stockFinal = (Number(master?.stock) || 0) + (Number(arr.cantidad) || 0);
                  
                  return (
                    <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-md p-5 hover:border-blue-500/50 transition-all group">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest bg-blue-400/10 px-2 py-0.5 rounded-sm border border-blue-400/20">
                            TRÁNSITO ACTIVO
                          </span>
                          <h4 className="text-lg font-light mt-2 group-hover:text-blue-300 transition-colors">{arr.codigo}</h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase truncate w-56">
                            {master?.descripcion || "Descripción no disponible"}
                          </p>
                        </div>
                        <div className="bg-slate-700 p-2 rounded text-blue-400">
                          <Package size={18} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mt-6 border-t border-slate-700 pt-4">
                        <div>
                          <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Cantidad Arribo</p>
                          <p className="text-lg font-bold text-white">{Number(arr.cantidad).toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Fecha ETA (Arribo)</p>
                          <div className="flex items-center justify-end gap-2 text-emerald-400 font-bold">
                            <Calendar size={12} />
                            <span className="text-sm">{arr.fecha_arribo}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 bg-blue-500/10 border border-blue-500/20 rounded p-3 flex justify-between items-center">
                        <span className="text-[9px] font-black text-blue-300 uppercase">Impacto en Disponibilidad</span>
                        <div className="flex items-center gap-2">
                           <ArrowUpRight size={14} className="text-emerald-400" />
                           <span className="text-sm font-black text-white">{stockFinal.toLocaleString()} <span className="text-[9px] text-slate-400">UN</span></span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* ESTILOS GLOBALES */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;900&display=swap');
        
        body {
          font-family: 'Inter', sans-serif;
          letter-spacing: -0.01em;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .line-clamp-1 {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}