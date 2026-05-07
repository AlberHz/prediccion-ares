"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Search, Eye, BarChart3, X, Package, AlertTriangle, ArrowDownToLine, Clock, Ship, EyeOff, Power, CheckCircle2
} from "lucide-react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, Area, ComposedChart, Bar, Scatter, Label, ReferenceArea
} from "recharts";

/**
 * MÓDULO DE ABASTECIMIENTO SAP - VERSIÓN CORREGIDA (LLAVE ÚNICA Y SUMA DE ARRIBOS)
 */

const MESES_ABR_GLOBAL = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

export default function ModuloAbastecimientoSAP() {
  // --- ESTADOS ---
  const [maestro, setMaestro] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [filtroFamilia, setFiltroFamilia] = useState("TODOS");
  const [itemSeleccionado, setItemSeleccionado] = useState<any>(null);
  
  const [verCapasTecnicas, setVerCapasTecnicas] = useState(true);
  const [verSoloInactivos, setVerSoloInactivos] = useState(false);

  // Configuración Temporal (Mayo 2026 como punto de partida)
  const MES_ACTUAL_INDEX = 4; 
  const AÑO_ACTUAL = 2026;

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // 1. Traemos los datos de la vista y de la tabla de arribos
      const { data: maestroData, error: e1 } = await supabase.from("v_importaciones_unidas").select("*");
      const { data: arribosData, error: e2 } = await supabase.from("imp_arribos").select("*");
      
      if (e1 || e2) throw e1 || e2;

      // 2. ELIMINAR DUPLICADOS DEL MAESTRO (Garantía total de unicidad para React Keys)
      // Usamos un Map para asegurar que cada 'codigo' exista una sola vez en el estado maestro
      const maestroUnico = new Map();
      
      maestroData?.forEach(item => {
        if (!item.codigo) return;
        const idLimpio = String(item.codigo).trim();
        if (!maestroUnico.has(idLimpio)) {
          maestroUnico.set(idLimpio, item);
        }
      });

      // 3. INYECTAR ARRIBOS FILTRADOS
      const datosConsolidados = Array.from(maestroUnico.values()).map(m => {
        const codM = String(m.codigo).trim();
        return {
          ...m,
          todosLosArribos: arribosData ? arribosData.filter(a => String(a.codigo).trim() === codM) : []
        };
      });
      
      setMaestro(datosConsolidados);
      
    } catch (err) {
      console.error("Error en fetchData:", err);
    } finally {
      setLoading(false);
    }
  }

  // --- LÓGICA DE ACTUALIZACIÓN EN BASE DE DATOS ---
  const toggleVisibilidadDB = async (codigo: string, estadoActual: boolean) => {
    try {
      const nuevoEstado = !estadoActual;
      const { error } = await supabase.from('imp_maestro').update({ activo: nuevoEstado }).eq('codigo', codigo);

      if (error) throw error;

      setMaestro(prev => prev.map(item => item.codigo === codigo ? { ...item, activo: nuevoEstado } : item));
      if (itemSeleccionado?.codigo === codigo) {
        setItemSeleccionado((prev: any) => ({...prev, activo: nuevoEstado}));
      }
    } catch (err) {
      console.error("Error ejecutando toggle:", err);
    }
  };

  // --- LÓGICA DE PROYECCIÓN ---
  const mesesProyeccionHeaders = useMemo(() => {
    const nombres = ["MAY", "JUN", "JUL", "AGO", "SEP", "OCT"];
    return nombres.map((nombre, i) => {
      const d = new Date(AÑO_ACTUAL, MES_ACTUAL_INDEX + i, 1);
      return { nombre, año: d.getFullYear(), id: `${d.getFullYear()}-${d.getMonth()}`, index: i, mesNum: d.getMonth() };
    });
  }, []);

  const dataProcesada = useMemo(() => {
    return maestro.map(item => {
      const promedio = Number(item.promedio_mensual) || 0; 
      const stockFisico = Number(item.stock) || 0;
      const leadTimeDias = parseInt(item.lead_time) || 0;
      const leadTimeMeses = leadTimeDias / 30;

      // SUMA TOTAL DE ARRIBOS
      const listaArribos = item.todosLosArribos || [];
      const arriboCantTotal = listaArribos.reduce((acc: number, curr: any) => acc + (Number(curr.arribo) || 0), 0);

      const stockTotalParaCobertura = stockFisico + arriboCantTotal;
      const coberturaMeses = promedio > 0 ? stockTotalParaCobertura / promedio : 0;
      const pedidoSugerido = promedio > 0 ? (promedio * leadTimeMeses) + (promedio * 0.50) : 0;
      
      const dQuiebre = new Date(AÑO_ACTUAL, MES_ACTUAL_INDEX, 1);
      dQuiebre.setDate(dQuiebre.getDate() + (coberturaMeses * 30));
      
      const dOC = new Date(dQuiebre);
      dOC.setDate(dOC.getDate() - leadTimeDias - 45);

      let estadoCalculado = "STOCK OK";
      const hoy = new Date(AÑO_ACTUAL, MES_ACTUAL_INDEX, 1);
      if (promedio === 0 && stockFisico === 0) estadoCalculado = "SIN MOVIMIENTO";
      else if (promedio > 0 && dOC <= hoy) estadoCalculado = "COMPRAR YA";
      else if (promedio > 0 && coberturaMeses <= (leadTimeMeses + 1.5)) estadoCalculado = "POR REVISAR";

      const puntosGrafico: any[] = [];
      ["ene", "feb", "mar", "abr"].forEach((m, idx) => {
        puntosGrafico.push({ 
          mes: `${MESES_ABR_GLOBAL[idx]} 26`, 
          stock: null, 
          salidaReal: Number(item[`s26_${m}`]) || 0,
          tipo: 'HISTORICO'
        });
      });

      // PROYECCIÓN CON MÚLTIPLES ARRIBOS
      let stockAcumulado = stockFisico;
      mesesProyeccionHeaders.forEach((m) => {
        const arribosEsteMes = listaArribos.filter((a: any) => {
          const f = a.fecha_arribo ? new Date(a.fecha_arribo) : null;
          return f && f.getMonth() === m.mesNum && f.getFullYear() === m.año;
        });

        const sumaArribosMes = arribosEsteMes.reduce((acc: number, curr: any) => acc + (Number(curr.arribo) || 0), 0);
        
        stockAcumulado = stockAcumulado - promedio + sumaArribosMes;
        
        puntosGrafico.push({ 
            mes: `${m.nombre} 26`, 
            salidaIA: promedio, 
            stock: Math.max(0, stockAcumulado), 
            tipo: 'PROYECCION',
            arriboCant: sumaArribosMes,
            llegaStock: sumaArribosMes > 0
        });
      });

      const isActivo = item.activo !== false; 

      return { 
        ...item, 
        activo: isActivo,
        stockFisico, 
        arriboCant: arriboCantTotal, 
        stockTotal: stockFisico + arriboCantTotal, 
        promedio, leadTimeDias, pedidoSugerido, coberturaMeses, 
        estado: estadoCalculado, puntosGrafico,
        fechaQuiebre: dQuiebre.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        fechaLanzarOC: dOC.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        mesQuiebre: `${MESES_ABR_GLOBAL[dQuiebre.getMonth()]} 26`,
        mesOC: `${MESES_ABR_GLOBAL[dOC.getMonth() >= 0 ? dOC.getMonth() : 0]} 26`
      };
    }).filter(i => {
      const cumpleBusqueda = i.codigo.toLowerCase().includes(search.toLowerCase()) || (i.descripcion || "").toLowerCase().includes(search.toLowerCase());
      const cumpleEstado = filtroEstado === "TODOS" || i.estado === filtroEstado;
      const cumpleFamilia = filtroFamilia === "TODOS" || i.familia === filtroFamilia;
      const cumpleVisibilidad = verSoloInactivos ? !i.activo : i.activo;
      return cumpleBusqueda && cumpleEstado && cumpleFamilia && cumpleVisibilidad;
    });
  }, [maestro, search, filtroEstado, filtroFamilia, mesesProyeccionHeaders, verSoloInactivos]);

  const familiasUnicas = useMemo(() => Array.from(new Set(maestro.map(m => m.familia).filter(Boolean))), [maestro]);
  const inactivosCount = maestro.filter(m => m.activo === false).length;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-4 shadow-2xl border border-slate-200 rounded-lg z-50 relative">
          <p className="text-xs font-black text-slate-800 mb-2 border-b pb-1">{data.mes}</p>
          {data.stock !== null && <p className="text-blue-600 font-bold">Stock: {Math.round(data.stock).toLocaleString()}</p>}
          {data.salidaReal > 0 && <p className="text-slate-500 font-bold">Salida Real: {data.salidaReal}</p>}
          {data.salidaIA > 0 && <p className="text-purple-500 font-bold text-xs italic">Predicción: {Math.round(data.salidaIA)}</p>}
          {data.llegaStock && (
            <div className="mt-2 p-2 bg-blue-600 text-white rounded text-[10px] font-black animate-pulse">
              🚢 ARRIBO(S): +{(data.arriboCant || 0).toLocaleString()}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="font-black text-slate-600 animate-pulse">CARGANDO DATOS MAESTROS...</p>
      </div>
    </div>
  );

  return (
    <div className="bg-[#f4f7f9] min-h-screen font-sans text-[#1d2d3d] pb-10">
      <header className="bg-[#1e293b] text-white p-4 shadow-lg flex flex-wrap justify-between items-center sticky top-0 z-50 gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded shadow-lg"><Package size={24} /></div>
          <div>
            <h1 className="text-lg md:text-xl font-black tracking-tighter">SAP SUPPLY CHAIN PLANNING</h1>
            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Panel de Control de Importaciones</p>
          </div>
        </div>
        
        <div className="flex gap-3 w-full md:w-auto">
          <button 
            onClick={() => setVerSoloInactivos(!verSoloInactivos)} 
            className={`flex-1 md:flex-none flex justify-center items-center gap-2 px-4 py-2 rounded-lg text-xs font-black border transition-all ${
              verSoloInactivos ? 'bg-orange-600 border-orange-400 text-white' : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
            }`}
          >
            {verSoloInactivos ? <CheckCircle2 size={16}/> : <EyeOff size={16}/>}
            {verSoloInactivos ? "VOLVER A ACTIVOS" : `INACTIVOS (${inactivosCount})`}
          </button>
        </div>
      </header>

      <main className="w-full max-w-[1850px] mx-auto p-3 md:p-6 space-y-6">
        
        {itemSeleccionado && (
          <div className="bg-white rounded-xl border-t-4 border-t-blue-600 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="bg-slate-50 border-b p-5 flex flex-wrap justify-between items-center gap-4">
              <div className="flex flex-wrap items-center gap-4 md:gap-8 w-full md:w-auto">
                <div>
                  <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">{itemSeleccionado.codigo}</h2>
                  <p className="text-xs md:text-sm font-bold text-slate-500 uppercase tracking-wide break-words max-w-[300px] md:max-w-none">{itemSeleccionado.descripcion}</p>
                </div>
                <div className="hidden md:block h-10 w-px bg-slate-300" />
                <button 
                  onClick={() => setVerCapasTecnicas(!verCapasTecnicas)} 
                  className={`px-4 md:px-5 py-2.5 rounded-full font-black text-xs transition-all flex items-center gap-2 ${
                    verCapasTecnicas ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  <BarChart3 size={16} /> REPORTE TÉCNICO {verCapasTecnicas ? 'ACTIVO' : 'MINIMAL'}
                </button>
              </div>
              <button onClick={() => setItemSeleccionado(null)} className="p-2 hover:bg-red-50 text-red-500 rounded-full transition-colors"><X size={28}/></button>
            </div>
            
            <div className="p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
              <div className="lg:col-span-9 h-[450px] md:h-[550px] bg-slate-50 rounded-xl p-2 md:p-4 border border-slate-100 relative overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={itemSeleccionado.puntosGrafico} margin={{top: 40, right: 10, left: 0, bottom: 20}}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="mes" tick={{fontSize: 10, fontWeight: 800}} />
                    <YAxis tick={{fontSize: 10}} width={45} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend verticalAlign="top" align="right" wrapperStyle={{paddingBottom: '20px', fontSize: '12px'}} />
                    <ReferenceArea x1="MAY 26" x2="OCT 26" fill="#eff6ff" fillOpacity={0.5} />
                    
                    {itemSeleccionado.puntosGrafico.map((entry: any, index: number) => (
                        entry.llegaStock ? (
                          <ReferenceLine key={`ref-${index}`} x={entry.mes} stroke="#2563eb" strokeDasharray="4 4" strokeWidth={2}>
                            <Label value={`🚢 +${entry.arriboCant.toLocaleString()}`} position="top" fill="#2563eb" fontSize={10} fontWeight="900" />
                          </ReferenceLine>
                        ) : null
                    ))}

                    <Bar dataKey="salidaReal" name="Salidas Reales" fill="#94a3b8" barSize={20} radius={[4, 4, 0, 0]} />
                    <Area type="monotone" dataKey="stock" name="Stock Proyectado" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.1} strokeWidth={4} />
                    
                    {verCapasTecnicas && (
                      <>
                        <ReferenceLine x={itemSeleccionado.mesQuiebre} stroke="#ef4444" strokeWidth={3}>
                          <Label value={`QUIEBRE: ${itemSeleccionado.fechaQuiebre}`} position="insideTopLeft" fill="#ef4444" fontSize={11} fontWeight="900" />
                        </ReferenceLine>
                        <ReferenceLine x={itemSeleccionado.mesOC} stroke="#f59e0b" strokeWidth={3} strokeDasharray="5 5">
                          <Label value={`SOLICITAR OC: ${itemSeleccionado.fechaLanzarOC}`} position="insideTopRight" fill="#f59e0b" fontSize={11} fontWeight="900" />
                        </ReferenceLine>
                      </>
                    )}
                    <Scatter dataKey="salidaIA" name="Predicción Demanda" fill="#1e293b" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="lg:col-span-3 space-y-4">
                <div className="p-4 md:p-5 bg-blue-50 border border-blue-200 rounded-xl shadow-sm">
                  <div className="text-blue-800 font-black uppercase text-[10px] mb-1">Inventario Disponible</div>
                  <p className="text-2xl md:text-3xl font-black text-blue-900">{itemSeleccionado.stockTotal.toLocaleString()} <span className="text-xs md:text-sm font-bold opacity-60">uds</span></p>
                  <div className="mt-3 pt-3 border-t border-blue-200 flex justify-between">
                    <span className="text-[10px] font-black text-blue-600 uppercase">Cobertura Actual</span>
                    <span className="text-sm font-black text-blue-800">{itemSeleccionado.coberturaMeses.toFixed(1)} Meses</span>
                  </div>
                </div>
                <div className="p-4 md:p-5 bg-orange-50 border border-orange-200 rounded-xl shadow-sm">
                  <div className="flex items-center gap-3 mb-2 text-xs font-black uppercase text-orange-700"><Clock size={18}/> Colocar OC Máximo</div>
                  <p className="text-xl md:text-2xl font-black text-orange-800">{itemSeleccionado.fechaLanzarOC}</p>
                </div>
                <div className="p-4 md:p-5 bg-red-50 border border-red-200 rounded-xl text-red-900 shadow-sm">
                  <div className="flex items-center gap-3 mb-2 text-xs font-black uppercase"><AlertTriangle size={18}/> Fecha de Quiebre</div>
                  <p className="text-xl md:text-2xl font-black">{itemSeleccionado.fechaQuiebre}</p>
                </div>
                <div className="p-5 md:p-6 bg-[#1e293b] text-white rounded-xl shadow-xl border-b-4 border-b-blue-500 relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2 text-blue-400 text-xs font-black uppercase">
                      <ArrowDownToLine size={20}/> Pedido Sugerido
                    </div>
                    <p className="text-3xl md:text-4xl font-black tracking-tighter">{Math.round(itemSeleccionado.pedidoSugerido).toLocaleString()}</p>
                  </div>
                  <Package className="absolute right-[-10px] bottom-[-10px] text-slate-700 opacity-20" size={70} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FILTROS */}
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 md:gap-6 items-end">
          <div className="flex-1 min-w-[280px]">
            <label className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase mb-2 block">Buscador de Códigos</label>
            <div className="relative">
              <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
              <input type="text" placeholder="Escribe código o nombre del producto..." className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs md:text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all" onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="w-full md:w-56 lg:w-64">
            <label className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase mb-2 block">Categoría / Familia</label>
            <select className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs font-black cursor-pointer focus:ring-2 focus:ring-blue-500 truncate" onChange={(e) => setFiltroFamilia(e.target.value)}>
              <option value="TODOS">TODAS LAS FAMILIAS</option>
              {familiasUnicas.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="w-full md:w-56 lg:w-64">
            <label className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase mb-2 block">Prioridad de Abastecimiento</label>
            <select className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs font-black cursor-pointer focus:ring-2 focus:ring-blue-500" onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="TODOS">TODOS LOS ESTADOS</option>
              <option value="COMPRAR YA">🚨 COMPRAR YA</option>
              <option value="POR REVISAR">⚠️ POR REVISAR</option>
              <option value="STOCK OK">✅ STOCK OK</option>
            </select>
          </div>
        </div>

        {/* TABLA PRINCIPAL */}
        <div className="bg-white rounded-xl shadow-2xl border border-slate-300 overflow-hidden">
          <div className="overflow-x-auto w-full max-h-[600px] md:max-h-[700px] custom-scrollbar">
            <table className="w-full text-left text-[10px] md:text-[11px] border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-[#1e293b] text-white font-bold uppercase sticky top-0 z-20 whitespace-nowrap">
                  <th className="p-3 md:p-4 text-center w-12 md:w-14">Acción</th>
                  <th className="p-3 md:p-4 text-center w-12 md:w-14 border-x border-slate-700">Estado</th>
                  <th className="p-3 md:p-4">Código</th>
                  <th className="p-3 md:p-4 min-w-[200px]">Descripción</th>
                  <th className="p-3 md:p-4 text-center bg-[#2d3748]">Lead Time</th>
                  <th className="p-3 md:p-4 text-center bg-[#2d3748]">Stock Actual</th>
                  <th className="p-3 md:p-4 text-center">Arribos</th>
                  <th className="p-3 md:p-4 text-center">Promedio</th>
                  <th className="p-3 md:p-4 text-center bg-blue-700 text-white font-black">COB (M)</th>
                  <th className="p-3 md:p-4 text-center">F. Quiebre</th>
                  <th className="p-3 md:p-4 text-center bg-blue-900 text-blue-200">Sugerido</th>
                  {mesesProyeccionHeaders.map(m => (
                    <th key={m.id} className="p-3 md:p-4 text-center bg-slate-800 opacity-60 font-medium">{m.nombre}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dataProcesada.map(item => (
                  <tr 
                    key={String(item.codigo)} // Conversión explícita para evitar errores de tipo
                    className={`hover:bg-blue-50/50 transition-colors ${itemSeleccionado?.codigo === item.codigo ? 'bg-blue-50' : ''} ${!item.activo ? 'opacity-50 grayscale' : ''}`}
                  >
                    <td className="p-2 text-center">
                      <button onClick={() => setItemSeleccionado(item)} className="p-2 md:p-2.5 bg-white border border-slate-200 hover:bg-blue-600 hover:text-white rounded-lg transition-all shadow-sm">
                        <Eye size={14} />
                      </button>
                    </td>
                    <td className="p-2 text-center">
                      <button onClick={() => toggleVisibilidadDB(item.codigo, item.activo)} className={`p-2 rounded-lg transition-all shadow-sm border ${!item.activo ? 'text-red-600 bg-red-100 border-red-200' : 'text-green-600 bg-green-50 border-green-200'}`}>
                        {!item.activo ? <Power size={14}/> : <CheckCircle2 size={14}/>}
                      </button>
                    </td>
                    <td className="p-3 md:p-4 font-black text-slate-800 whitespace-nowrap">{item.codigo}</td>
                    <td className="p-3 md:p-4 font-bold text-slate-900 uppercase max-w-[200px] truncate">{item.descripcion}</td>
                    <td className="p-3 md:p-4 text-center font-bold text-slate-900">{item.leadTimeDias}</td>
                    <td className="p-3 md:p-4 text-center font-black">{item.stockFisico.toLocaleString()}</td>
                    {/* COLUMNA ARRIBOS SUMADOS */}
                    <td className="p-3 md:p-4 text-center font-black text-blue-600 bg-blue-50/30">
                      {item.arriboCant > 0 ? (
                        <div className="flex flex-col items-center">
                          <span className="flex items-center gap-1"><Ship size={10}/> {item.arriboCant.toLocaleString()}</span>
                        </div>
                      ) : "-"}
                    </td>
                    <td className="p-3 md:p-4 text-center font-black">{Math.round(item.promedio).toLocaleString()}</td>
                    <td className={`p-3 md:p-4 text-center font-black bg-blue-50 ${item.coberturaMeses < 2 ? 'text-red-600' : 'text-blue-700'}`}>
                      {item.coberturaMeses.toFixed(1)}
                    </td>
                    <td className={`p-3 md:p-4 text-center font-black ${item.estado === 'COMPRAR YA' ? 'text-red-600 animate-pulse' : 'text-slate-500'}`}>
                      {item.fechaQuiebre}
                    </td>
                    <td className="p-3 md:p-4 text-center font-black text-blue-700 bg-blue-50/50">
                      {Math.round(item.pedidoSugerido).toLocaleString()}
                    </td>
                    {/* COLUMNAS DINÁMICAS */}
                    {item.puntosGrafico.filter((p:any) => p.tipo === 'PROYECCION').map((p: any, idx: number) => (
                      <td key={`${item.codigo}-col-${idx}`} className={`p-3 md:p-4 text-center font-bold ${p.stock <= 0 ? 'text-red-300 bg-red-50/30' : (p.llegaStock ? 'text-blue-600 bg-blue-100 font-black' : 'text-slate-800')}`}>
                        {Math.round(p.stock).toLocaleString()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600;700;800;900&display=swap');
        :root { --font-sans: 'Public Sans', sans-serif; }
        body { font-family: var(--font-sans); background-color: #f4f7f9; margin: 0; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .animate-in { animation: fadeIn 0.4s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}