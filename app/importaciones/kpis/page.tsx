"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Search, LineChart as ChartIcon, ShieldAlert, BarChart3, Eye, Ship } from "lucide-react";
import { 
  ResponsiveContainer, ComposedChart, Area, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Label 
} from "recharts";

// 🗓️ CONFIGURACIÓN DE FECHA - JUNIO 2026 COMO MES EN CURSO
const AÑO_ACTUAL = 2026;
const MES_ACTUAL_NUM = 7; // Junio (0 = Ene, 5 = Jun)

const DOCUMENTOS_SALIDA = new Set(["NS", "22", "23", "93", "TD"]);
const NOMBRES_MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

const esMovimientoSalida = (m: any) => {
  const t = String(m.type || "").trim().toUpperCase();
  const c = String(m.transaction_code || "").trim().toUpperCase();
  return DOCUMENTOS_SALIDA.has(t) || DOCUMENTOS_SALIDA.has(c);
};

export default function GraficoPredictivoAresIA() {
  const [productos, setProductos] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [familiaSeleccionada, setFamiliaSeleccionada] = useState<string>("TODAS");
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const [skuSeleccionadoId, setSkuSeleccionadoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [escenarioVisual, setEscenarioVisual] = useState<"NORMAL" | "ESTADISTICO" | "CRITICO">("ESTADISTICO");

  const listaFamilias = useMemo(() => {
    const fams = new Set<string>();
    productos.forEach(p => { if (p.family) fams.add(p.family); });
    return ["TODAS", ...Array.from(fams)];
  }, [productos]);

  useEffect(() => {
    fetchDataReal();
  }, []);

  async function fetchDataReal() {
    setLoading(true);
    try {
      const { data: dbProducts } = await supabase.from("products").select("*");
      const { data: dbArrivals } = await supabase.from("arrivals").select("*");

      let todosLosMovimientos: any[] = [];
      let desde = 0; let hasta = 999; let tieneMas = true;
      while (tieneMas) {
        const { data: chunk } = await supabase.from("movements").select("*").range(desde, hasta);
        if (chunk && chunk.length > 0) {
          todosLosMovimientos = [...todosLosMovimientos, ...chunk];
          if (chunk.length < 1000) tieneMas = false;
          else { desde += 1000; hasta += 1000; }
        } else { tieneMas = false; }
      }

      const movsByProduct: Record<string, any[]> = {};
      todosLosMovimientos.forEach(m => {
        if (!m.product_id) return;
        if (!movsByProduct[m.product_id]) movsByProduct[m.product_id] = [];
        movsByProduct[m.product_id].push(m);
      });

      const arrivalsByProduct: Record<string, any[]> = {};
      (dbArrivals || []).forEach(a => {
        if (!a.product_id) return;
        if (!arrivalsByProduct[a.product_id]) arrivalsByProduct[a.product_id] = [];
        arrivalsByProduct[a.product_id].push(a);
      });

      const datosConsolidados = (dbProducts || []).map((p: any) => {
        const productUUID = p.id;
        return {
          id: productUUID,
          code: p.code ? String(p.code).trim() : "SIN CÓDIGO",
          description: p.description ? String(p.description).trim() : "SIN DESCRIPCIÓN",
          family: p.family ? String(p.family).trim().toUpperCase() : "GENERAL",
          lead_time: parseInt(p.lead_time) || 0,
          stockFisicoActual: Number(p.stock || 0),
          movimientos: movsByProduct[productUUID] || [],
          arribos: arrivalsByProduct[productUUID] || []
        };
      });

      setProductos(datosConsolidados);
      if (datosConsolidados.length > 0) {
        setSkuSeleccionadoId(datosConsolidados[0].id);
        setBusqueda(`[${datosConsolidados[0].code}] ${datosConsolidados[0].description}`);
      }
    } catch (err) {
      console.error("Error Ares Engine Base:", err);
    } finally {
      setLoading(false);
    }
  }

  const analisisSku = useMemo(() => {
    if (!skuSeleccionadoId) return null;
    const item = productos.find(p => p.id === skuSeleccionadoId);
    if (!item) return null;

    const stockFisicoActual = item.stockFisicoActual;
    const leadTimeDias = item.lead_time;
    const mesesLeadTime = Math.max(1, Math.ceil(leadTimeDias / 30));

    // 1. EXTRACTOR DE SALIDAS REALES HISTÓRICAS
    const todasLasSalidas = item.movimientos.filter(esMovimientoSalida);
    const salidasPorMesAñoActual: Record<number, number> = {};
    
    todasLasSalidas.forEach((m: any) => {
      const f = m.date ? new Date(m.date) : new Date(m.created_at);
      if (f.getFullYear() === AÑO_ACTUAL) {
        salidasPorMesAñoActual[f.getMonth()] = (salidasPorMesAñoActual[f.getMonth()] || 0) + Math.abs(Number(m.quantity || 0));
      }
    });

    // Calcular consumo promedio lineal
    let sumaPasada = 0;
    for (let m = 0; m < MES_ACTUAL_NUM; m++) {
      sumaPasada += (salidasPorMesAñoActual[m] || 0);
    }
    const consumoNormal = MES_ACTUAL_NUM > 0 ? (sumaPasada / MES_ACTUAL_NUM) : 100;
    
    // ESCENARIOS DE DEMANDA
    const consumoAresIA = consumoNormal * 1.25;  
    const consumoEstres = consumoNormal * 1.86;  

    // Mapeo exhaustivo de arribos (futuros y presentes del año actual)
    const arribosRealesPorMes: Record<number, number> = {};
    let totalArribosTransito = 0;

    item.arribos.forEach((a: any) => {
      const f = a.eta_date ? new Date(a.eta_date) : null;
      if (f && f.getFullYear() === AÑO_ACTUAL) {
        const mesArribo = f.getMonth();
        const cant = Number(a.quantity || 0);
        arribosRealesPorMes[mesArribo] = (arribosRealesPorMes[mesArribo] || 0) + cant;
        
        // Sumamos al KPI si es un arribo programado desde el mes actual en adelante
        if (mesArribo >= MES_ACTUAL_NUM) {
          totalArribosTransito += cant;
        }
      }
    });

    // 2. CÁLCULO INVERSO DE HITOS LOGÍSTICOS POR ESCENARIO
    const calcularHitosEscenario = (tasaConsumoBase: number) => {
      let inventarioSimulado = stockFisicoActual;
      let yaQuebro = false;
      let mesQuiebre = "OPERATIVO";
      let mesOC = "AL DÍA";

      for (let m = MES_ACTUAL_NUM; m < 12; m++) {
        const ingresos = arribosRealesPorMes[m] || 0;
        inventarioSimulado = inventarioSimulado + ingresos - tasaConsumoBase;

        if (inventarioSimulado <= 0 && !yaQuebro) {
          mesQuiebre = `${NOMBRES_MESES[m]} '26`;
          const tiempoCompra = (m - MES_ACTUAL_NUM) - mesesLeadTime;
          const idxOC = MES_ACTUAL_NUM + tiempoCompra;
          
          if (idxOC >= MES_ACTUAL_NUM) {
            mesOC = `${NOMBRES_MESES[idxOC]} '26`;
          } else {
            mesOC = "🔴 CRÍTICO";
          }
          yaQuebro = true;
        }
      }
      const pedidoSugerido = Math.round(tasaConsumoBase * mesesLeadTime * 1.2);
      return { mesQuiebre, mesOC, pedidoSugerido };
    };

    const hitoNormal = calcularHitosEscenario(consumoNormal);
    const hitoAresIA = calcularHitosEscenario(consumoAresIA);
    const hitoEstres = calcularHitosEscenario(consumoEstres);

    // 3. RECONSTRUCCIÓN CRONOLÓGICA SIMULTÁNEA DE LA CURVA DEL GRÁFICO
    const datosCronologicosGrafico: any[] = [];
    
    // PASADO HISTÓRICO
    let stockIterativoPasado = stockFisicoActual;
    const datosPasadosInvertidos: any[] = [];

    for (let m = MES_ACTUAL_NUM - 1; m >= 0; m--) {
      const consumoRealMes = salidasPorMesAñoActual[m] || 0;
      stockIterativoPasado += consumoRealMes;

      datosPasadosInvertidos.unshift({
        mes: `${NOMBRES_MESES[m]} '26`,
        "Stock Normal": Math.round(stockIterativoPasado),
        "Stock Estadístico (Ares IA)": Math.round(stockIterativoPasado),
        "Stock de Riesgo (Máx)": Math.round(stockIterativoPasado),
        "Salidas Reales": consumoRealMes,
        "Línea Promedio": Math.round(consumoNormal),
        cantidadArribo: arribosRealesPorMes[m] || 0,
        tipo: "HISTORICO"
      });
    }
    datosCronologicosGrafico.push(...datosPasadosInvertidos);

    // FUTURO PREDICTIVO
    let invCorrienteNormal = stockFisicoActual;
    let invCorrienteEstadistico = stockFisicoActual;
    let invCorrienteRiesgo = stockFisicoActual;

    for (let m = MES_ACTUAL_NUM; m < 12; m++) {
      const ingresosOC = arribosRealesPorMes[m] || 0;

      invCorrienteNormal = invCorrienteNormal + ingresosOC - consumoNormal;
      invCorrienteEstadistico = invCorrienteEstadistico + ingresosOC - consumoAresIA;
      invCorrienteRiesgo = invCorrienteRiesgo + ingresosOC - consumoEstres;

      datosCronologicosGrafico.push({
        mes: `${NOMBRES_MESES[m]} '26`,
        "Stock Normal": Math.round(Math.max(0, invCorrienteNormal)),
        "Stock Estadístico (Ares IA)": Math.round(Math.max(0, invCorrienteEstadistico)),
        "Stock de Riesgo (Máx)": Math.round(Math.max(0, invCorrienteRiesgo)),
        "Salidas Reales": undefined,
        "Línea Promedio": Math.round(
          escenarioVisual === "NORMAL" ? consumoNormal :
          escenarioVisual === "ESTADISTICO" ? consumoAresIA : consumoEstres
        ),
        cantidadArribo: ingresosOC, // Inyección clave para el mapeo visual
        tipo: "PREDICTIVO"
      });
    }

    const hitoGraficoActivo = escenarioVisual === "ESTADISTICO" ? hitoAresIA : 
                             escenarioVisual === "NORMAL" ? hitoNormal : hitoEstres;

    return {
      ...item,
      stockFisicoActual,
      totalArribosTransito,
      consumoNormal,
      consumoAresIA,
      consumoEstres,
      hitoNormal,
      hitoAresIA,
      hitoEstres,
      hitoGraficoActivo,
      proyeccionesPorMes: datosCronologicosGrafico
    };
  }, [productos, skuSeleccionadoId, escenarioVisual]);

  const productosFiltrados = useMemo(() => {
    if (!busqueda.trim() && familiaSeleccionada === "TODAS") return [];
    return productos.filter(p => {
      const matchTexto = p.code.toLowerCase().includes(busqueda.toLowerCase()) || 
                         p.description.toLowerCase().includes(busqueda.toLowerCase());
      const matchFamilia = familiaSeleccionada === "TODAS" || p.family === familiaSeleccionada;
      return matchTexto && matchFamilia;
    });
  }, [productos, busqueda, familiaSeleccionada]);

  if (loading) return (
    <div className="min-h-[50vh] flex items-center justify-center bg-[#f8fafc]">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando Cadena de Suministro...</p>
      </div>
    </div>
  );

  return (
    <div className="bg-[#f8fafc] p-4 sm:p-6 rounded-2xl border border-slate-200 space-y-4 w-full text-slate-800 antialiased">
      
      {/* SECTOR BUSCADOR */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 relative shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-8 relative">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Buscador Core del Material</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Escribe el código SKU o descripción..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:bg-white focus:border-purple-600 transition-all text-slate-900"
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setMostrarDropdown(true); }}
                onFocus={() => setMostrarDropdown(true)}
              />
            </div>

            {mostrarDropdown && busqueda.trim().length > 0 && (
              <div className="absolute z-50 w-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-[200px] overflow-y-auto divide-y divide-slate-100">
                {productosFiltrados.map((p) => (
                  <div
                    key={p.id}
                    className="p-2.5 hover:bg-purple-50/60 cursor-pointer text-xs flex justify-between items-center"
                    onClick={() => {
                      setSkuSeleccionadoId(p.id);
                      setBusqueda(`[${p.code}] ${p.description}`);
                      setMostrarDropdown(false);
                    }}
                  >
                    <div className="truncate"><span className="font-bold text-slate-900 mr-2">[{p.code}]</span>{p.description}</div>
                    <span className="text-[9px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded uppercase">{p.family}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="md:col-span-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Filtrar Familia</label>
            <select
              value={familiaSeleccionada}
              onChange={(e) => setFamiliaSeleccionada(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none text-slate-700 cursor-pointer appearance-none"
            >
              {listaFamilias.map((f, idx) => (
                <option key={idx} value={f}>{f === "TODAS" ? "TODAS LAS FAMILIAS" : f}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {analisisSku ? (
        <>
          {/* TARJETAS EJECUTIVAS RESUMEN */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <BarChart3 size={14} className="text-slate-900" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Métricas Críticas de Disponibilidad e Importaciones</h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-900 border border-slate-950 p-3 rounded-xl text-white">
                <span className="text-[9px] font-bold text-slate-400 uppercase block">Inventario Físico Actual</span>
                <p className="text-lg font-black mt-0.5">{analisisSku.stockFisicoActual.toLocaleString()} un.</p>
                <span className="text-[8px] text-slate-400 block font-medium mt-0.5">Stock disponible hoy en bodega</span>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                <span className="text-[9px] font-bold text-emerald-700 uppercase block flex items-center gap-1">
                  <Ship size={11} className="text-emerald-600" /> Arribos Programados (Tránsito)
                </span>
                <p className="text-lg font-black text-emerald-950 mt-0.5">{analisisSku.totalArribosTransito.toLocaleString()} un.</p>
                <span className="text-[8px] text-emerald-600 block font-medium mt-0.5">Total ingresos esperados H2 2026</span>
              </div>

              <div className="bg-purple-50/50 border border-purple-100 p-3 rounded-xl">
                <span className="text-[9px] font-bold text-purple-600 uppercase block">Demanda IA Sugerida (+25%)</span>
                <p className="text-lg font-black text-purple-900 mt-0.5">{Math.round(analisisSku.consumoAresIA).toLocaleString()} un/mes</p>
                <span className="text-[8px] text-purple-500 block font-medium mt-0.5">Ritmo mensual estimado de salida</span>
              </div>

              <div className="bg-rose-50/50 border border-rose-100 p-3 rounded-xl">
                <span className="text-[9px] font-bold text-rose-600 uppercase block">Consumo Máximo Estrés (+35%)</span>
                <p className="text-lg font-black text-rose-900 mt-0.5">{Math.round(analisisSku.consumoEstres).toLocaleString()} un/mes</p>
                <span className="text-[8px] text-slate-500 block font-medium mt-0.5">Escenario crítico por sobredemanda</span>
              </div>
            </div>
          </div>

          {/* MATRIZ PREDICTIVA DE HITOS POR ESCENARIO */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <ShieldAlert size={14} className="text-purple-600" />
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">Análisis Predictivo de Hitos de Abastecimiento por Modelo de Consumo</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
              {/* Bloque Lineal */}
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/40 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center border-b border-slate-200/60 pb-1.5">
                    <span className="font-black text-slate-600 uppercase text-[9px]">Modelo 1: Lineal Base</span>
                    <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">Consumo Lineal</span>
                  </div>
                  <div className="space-y-1.5 mt-2">
                    <div className="flex justify-between"><span className="text-slate-400 font-bold">Quiebre Estimado:</span><span className="font-black text-slate-700">{analisisSku.hitoNormal.mesQuiebre}</span></div>
                    <div className="flex justify-between items-center"><span className="text-slate-400 font-bold">Lanzamiento OC:</span><span className="font-black text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded text-[10px]">{analisisSku.hitoNormal.mesOC}</span></div>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200/60 flex justify-between items-center font-black text-slate-900">
                  <span className="text-slate-400 text-[10px]">Sugerido Compra:</span><span>{analisisSku.hitoNormal.pedidoSugerido.toLocaleString()} un.</span>
                </div>
              </div>

              {/* Bloque Ares IA */}
              <div className="border border-purple-200 rounded-lg p-3 bg-purple-50/20 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center border-b border-purple-200/50 pb-1.5">
                    <span className="font-black text-purple-700 uppercase text-[9px]">Modelo 2: Ares IA (+25%)</span>
                    <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-700">Recomendado</span>
                  </div>
                  <div className="space-y-1.5 mt-2">
                    <div className="flex justify-between"><span className="text-purple-400 font-bold">Quiebre Estimado:</span><span className="font-black text-purple-900">{analisisSku.hitoAresIA.mesQuiebre}</span></div>
                    <div className="flex justify-between items-center"><span className="text-purple-400 font-bold">Lanzamiento OC:</span><span className="font-black text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded text-[10px] font-extrabold">{analisisSku.hitoAresIA.mesOC}</span></div>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-purple-200/50 flex justify-between items-center font-black text-purple-900">
                  <span className="text-purple-500 text-[10px]">Sugerido Compra:</span><span>{analisisSku.hitoAresIA.pedidoSugerido.toLocaleString()} un.</span>
                </div>
              </div>

              {/* Bloque Demanda Máxima */}
              <div className="border border-rose-200 rounded-lg p-3 bg-rose-50/20 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center border-b border-rose-200/50 pb-1.5">
                    <span className="font-black text-rose-700 uppercase text-[9px]">Modelo 3: Estrés Máx (+35%)</span>
                    <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-700">Riesgo Alto</span>
                  </div>
                  <div className="space-y-1.5 mt-2">
                    <div className="flex justify-between"><span className="text-rose-400 font-bold">Quiebre Estimado:</span><span className="font-black text-rose-700">{analisisSku.hitoEstres.mesQuiebre}</span></div>
                    <div className="flex justify-between items-center"><span className="text-rose-400 font-bold">Lanzamiento OC:</span><span className="font-black text-white bg-rose-600 px-1.5 py-0.5 rounded text-[10px]">{analisisSku.hitoEstres.mesOC}</span></div>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-rose-200/50 flex justify-between items-center font-black text-rose-900">
                  <span className="text-rose-500 text-[10px]">Sugerido Compra:</span><span>{analisisSku.hitoEstres.pedidoSugerido.toLocaleString()} un.</span>
                </div>
              </div>
            </div>
          </div>

          {/* CUADRO DEL GRÁFICO PREDICTIVO MULTI-ESCENARIO */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3 w-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-3 gap-2 text-[11px]">
              <div className="flex items-center gap-2 font-black text-slate-900 uppercase">
                <ChartIcon size={14} className="text-purple-600" />
                <span>Simulador de Inventario Estructurado con Hitos de Abastecimiento</span>
              </div>
              
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-200 font-black text-[10px]">
                <span className="text-slate-400 px-1.5 uppercase flex items-center gap-0.5"><Eye size={11}/> Ajustar Promedio:</span>
                <button 
                  onClick={() => setEscenarioVisual("NORMAL")}
                  className={`px-2.5 py-0.5 rounded text-[9px] transition-all ${escenarioVisual === "NORMAL" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500"}`}
                >
                  LINEAL
                </button>
                <button 
                  onClick={() => setEscenarioVisual("ESTADISTICO")}
                  className={`px-2.5 py-0.5 rounded text-[9px] transition-all ${escenarioVisual === "ESTADISTICO" ? "bg-purple-600 text-white shadow-xs" : "text-slate-500"}`}
                >
                  ARES IA (+25%)
                </button>
                <button 
                  onClick={() => setEscenarioVisual("CRITICO")}
                  className={`px-2.5 py-0.5 rounded text-[9px] transition-all ${escenarioVisual === "CRITICO" ? "bg-rose-600 text-white shadow-xs" : "text-slate-500"}`}
                >
                  MAX (+35%)
                </button>
              </div>
            </div>

            <div className="w-full h-[390px] text-[9px] font-bold">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={analisisSku.proyeccionesPorMes} margin={{ top: 30, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradIA" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tickLine={false} stroke="#94a3b8" />
                  
                  <YAxis yAxisId="left" tickLine={false} stroke="#94a3b8" />
                  <YAxis yAxisId="right" orientation="right" tickLine={false} stroke="#cbd5e1" />
                  
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#f8fafc' }}
                    itemStyle={{ fontSize: '11px' }}
                  />
                  <Legend verticalAlign="top" height={32} iconType="circle" iconSize={6} wrapperStyle={{ fontSize: '10px', fontWeight: 'black' }} />
                  
                  {/* Histórico de consumo real */}
                  <Bar yAxisId="right" dataKey="Salidas Reales" fill="#64748b" opacity={0.4} maxBarSize={20} radius={[3, 3, 0, 0]} name="Salidas Reales Históricas" />

                  {/* Curva de consumo mensual modelado */}
                  <Line yAxisId="right" type="monotone" dataKey="Línea Promedio" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="3 3" dot={false} name="Tasa Consumo Teórico" />

                  {/* Curvas de proyección multi-escenario del inventario */}
                  <Line yAxisId="left" type="monotone" dataKey="Stock Normal" stroke="#cbd5e1" strokeWidth={1.3} strokeDasharray="4 4" dot={false} name="Trayectoria Lineal" />
                  <Line yAxisId="left" type="monotone" dataKey="Stock de Riesgo (Máx)" stroke="#f43f5e" strokeWidth={1.3} strokeDasharray="4 2" dot={false} name="Trayectoria Máx Riesgo" />
                  <Area yAxisId="left" type="monotone" dataKey="Stock Estadístico (Ares IA)" stroke="#4f46e5" strokeWidth={2.5} fillOpacity={1} fill="url(#gradIA)" name="Trayectoria Predictiva Ares IA" dot={{ r: 2 }} />

                  {/* 🚚 HITOS VISUALES DINÁMICOS EN EL GRÁFICO */}

                  {/* 1. Lanzamiento de Orden de Compra */}
                  {analisisSku.hitoGraficoActivo.mesOC !== "AL DÍA" && analisisSku.hitoGraficoActivo.mesOC !== "🔴 CRÍTICO" && (
                    <ReferenceLine yAxisId="left" x={analisisSku.hitoGraficoActivo.mesOC} stroke="#d97706" strokeWidth={2} strokeDasharray="4 3">
                      <Label value={`⚠️ EMITIR OC`} position="top" fill="#b45309" fontSize={9} fontWeight="black" />
                    </ReferenceLine>
                  )}

                  {/* 2. Quiebre de Inventario */}
                  {analisisSku.hitoGraficoActivo.mesQuiebre !== "OPERATIVO" && (
                    <ReferenceLine yAxisId="left" x={analisisSku.hitoGraficoActivo.mesQuiebre} stroke="#ef4444" strokeWidth={2.5}>
                      <Label value={`🚨 QUIEBRE ESTIMADO`} position="top" fill="#ef4444" fontSize={9} fontWeight="black" />
                    </ReferenceLine>
                  )}

                  {/* 3. Arribos e Inyecciones de Stock Mapeadas en su respectivo Mes */}
                  {analisisSku.proyeccionesPorMes.map((p: any, idx: number) => {
                    if (p.cantidadArribo > 0) {
                      return (
                        <ReferenceLine key={`arribo-grafico-${idx}`} yAxisId="left" x={p.mes} stroke="#10b981" strokeWidth={2} strokeDasharray="3 2">
                          <Label 
                            value={`🚢 ARRIBO: +${p.cantidadArribo.toLocaleString()}`} 
                            position="insideTop" 
                            offset={15}
                            fill="#047857" 
                            fontSize={8} 
                            fontWeight="black" 
                          />
                        </ReferenceLine>
                      );
                    }
                    return null;
                  })}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-20 text-slate-400 text-xs font-semibold uppercase tracking-wider bg-white rounded-xl border border-slate-200">
          Selecciona un SKU en los filtros superiores para iniciar el análisis predictivo.
        </div>
      )}
    </div>
  );
}