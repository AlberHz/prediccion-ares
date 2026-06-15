"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Search, Layers, Package, ArrowUpRight, ArrowDownRight, Archive, Ship, AlertTriangle, CheckCircle2, TrendingDown, ShieldAlert } from "lucide-react";
import { 
  ResponsiveContainer, ComposedChart, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from "recharts";

// 🗓️ CONFIGURACIÓN DE TIEMPO CORE (AÑO 2026)
const AÑO_ACTUAL = 2026;
const MES_ACTUAL_NUM = 5; // Junio (0 = Ene, 5 = Jun)
const NOMBRES_MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

export default function BalanceInventarioAnual() {
  const [productos, setProductos] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [familiaSeleccionada, setFamiliaSeleccionada] = useState<string>("");
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const [skuSeleccionadoId, setSkuSeleccionadoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Lista de familias únicas extraídas de los productos
  const listaFamilias = useMemo(() => {
    const fams = new Set<string>();
    productos.forEach(p => { if (p.family) fams.add(p.family); });
    return Array.from(fams);
  }, [productos]);

  useEffect(() => {
    fetchDataReal();
  }, []);

  useEffect(() => {
    if (skuSeleccionadoId && productos.length > 0) {
      const item = productos.find(p => p.id === skuSeleccionadoId);
      if (item && item.family) {
        setFamiliaSeleccionada(item.family);
      }
    }
  }, [skuSeleccionadoId, productos]);

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
          lead_time_days: parseFloat(p.lead_time) || 0, // Días brutos en la BD
          stockFisicoActual: Number(p.stock || 0),
          movimientos: movsByProduct[productUUID] || [],
          arribos: arrivalsByProduct[productUUID] || []
        };
      });

      setProductos(datosConsolidados);
      if (datosConsolidados.length > 0) {
        setSkuSeleccionadoId(datosConsolidados[0].id);
        setBusqueda(`[${datosConsolidados[0].code}] ${datosConsolidados[0].description}`);
        setFamiliaSeleccionada(datosConsolidados[0].family);
      }
    } catch (err) {
      console.error("Error Core Balance Engine:", err);
    } finally {
      setLoading(false);
    }
  }

  // 📊 CALCULADORA MAESTRA: COBERTURA VS LEAD TIME (MESES) Y BUFFER +25%
  const reporteBalance = useMemo(() => {
    if (!skuSeleccionadoId || productos.length === 0) return null;

    const skuActivo = productos.find(p => p.id === skuSeleccionadoId);
    if (!skuActivo) return null;

    const productosDeLaFamilia = productos.filter(p => p.family === familiaSeleccionada);

    const ingresosKardexSku = new Array(12).fill(0);
    const salidasKardexSku = new Array(12).fill(0);
    const arribosTablaSku = new Array(12).fill(0);

    const ingresosKardexFamilia = new Array(12).fill(0);
    const salidasKardexFamilia = new Array(12).fill(0);
    const arribosTablaFamilia = new Array(12).fill(0);

    let stockFisicoFamiliaActualTotal = 0;

    // 1. Mapear datos del SKU seleccionado
    skuActivo.movimientos.forEach((m: any) => {
      const f = m.date ? new Date(m.date) : new Date(m.created_at);
      if (f.getFullYear() === AÑO_ACTUAL) {
        const mes = f.getMonth();
        const cant = Math.abs(Number(m.quantity || 0));
        const type = String(m.type || "").trim().toUpperCase();

        if (type === "IN") ingresosKardexSku[mes] += cant;
        if (type === "OUT") salidasKardexSku[mes] += cant;
      }
    });

    skuActivo.arribos.forEach((a: any) => {
      const f = a.eta_date ? new Date(a.eta_date) : null;
      if (f && f.getFullYear() === AÑO_ACTUAL) {
        arribosTablaSku[f.getMonth()] += Number(a.quantity || 0);
      }
    });

    // 2. Mapear datos agrupados de la Familia
    productosDeLaFamilia.forEach(p => {
      stockFisicoFamiliaActualTotal += p.stockFisicoActual;

      p.movimientos.forEach((m: any) => {
        const f = m.date ? new Date(m.date) : new Date(m.created_at);
        if (f.getFullYear() === AÑO_ACTUAL) {
          const mes = f.getMonth();
          const cant = Math.abs(Number(m.quantity || 0));
          const type = String(m.type || "").trim().toUpperCase();

          if (type === "IN") ingresosKardexFamilia[mes] += cant;
          if (type === "OUT") salidasKardexFamilia[mes] += cant;
        }
      });

      p.arribos.forEach((a: any) => {
        const f = a.eta_date ? new Date(a.eta_date) : null;
        if (f && f.getFullYear() === AÑO_ACTUAL) {
          arribosTablaFamilia[f.getMonth()] += Number(a.quantity || 0);
        }
      });
    });

    // 3. Reconstrucción lógica YTD para Stock de Apertura en Enero
    let acumIngresosSkuYTD = 0; let acumSalidasSkuYTD = 0;
    for (let m = 0; m <= MES_ACTUAL_NUM; m++) {
      acumIngresosSkuYTD += ingresosKardexSku[m];
      acumSalidasSkuYTD += salidasKardexSku[m];
    }
    const stockInicialSkuAño = skuActivo.stockFisicoActual - acumIngresosSkuYTD + acumSalidasSkuYTD;

    let acumIngresosFamYTD = 0; let acumSalidasFamYTD = 0;
    for (let m = 0; m <= MES_ACTUAL_NUM; m++) {
      acumIngresosFamYTD += ingresosKardexFamilia[m];
      acumSalidasFamYTD += salidasKardexFamilia[m];
    }
    const stockInicialFamiliaAño = stockFisicoFamiliaActualTotal - acumIngresosFamYTD + acumSalidasFamYTD;

    // 🎯 KPIS DE CONTROL DE REPOSICIÓN Y CONSUMO ACELERADO
    const mesesTranscurridos = MES_ACTUAL_NUM + 1;
    const consumoPromedioRealSku = mesesTranscurridos > 0 ? (acumSalidasSkuYTD / mesesTranscurridos) : 0;
    const consumoPromedioRealFamilia = mesesTranscurridos > 0 ? (acumSalidasFamYTD / mesesTranscurridos) : 0;
    
    // El consumo futuro se estresa un 25% más por seguridad para la simulación de quiebres
    const consumoPredictivoBufferSku = consumoPromedioRealSku * 1.25;
    const consumoPredictivoBufferFamilia = consumoPromedioRealFamilia * 1.25;

    // 🔄 CORRECCIÓN LOGÍSTICA CRÍTICA: Convertir Lead Time (Días) a Meses
    const leadTimeEnMeses = skuActivo.lead_time_days / 30;
    const mesesCoberturaSku = consumoPromedioRealSku > 0 ? (skuActivo.stockFisicoActual / consumoPromedioRealSku) : (skuActivo.stockFisicoActual > 0 ? 99 : 0);

    // Semáforo inteligente comparando Cobertura en Meses vs Lead Time en Meses
    let estadoCobertura = "HEALTHY";
    if (mesesCoberturaSku < leadTimeEnMeses) {
      estadoCobertura = "DANGER_SHORTAGE"; // Si la cobertura actual es menor de lo que tarda el proveedor: quiebre seguro.
    } else if (mesesCoberturaSku > leadTimeEnMeses * 2.5) {
      estadoCobertura = "OVERSTOCK"; // Demasiado capital retenido superando por exceso el tiempo de reposición.
    }

    const dataGraficoSku: any[] = [];
    const dataGraficoFamilia: any[] = [];

    let trackerStockSku = stockInicialSkuAño;
    let trackerStockFamilia = stockInicialFamiliaAño;

    for (let m = 0; m < 12; m++) {
      const esFuturo = m > MES_ACTUAL_NUM;

      // Dataset SKU
      if (m > 0) {
        const entradasMesAnterior = ingresosKardexSku[m-1];
        const salidasMesAnterior = salidasKardexSku[m-1];
        
        // Si el mes anterior evaluado es futuro, se descuenta usando la predicción + 25%
        trackerStockSku = trackerStockSku + 
          (m - 1 >= MES_ACTUAL_NUM ? arribosTablaSku[m-1] : entradasMesAnterior) - 
          (m - 1 >= MES_ACTUAL_NUM ? consumoPredictivoBufferSku : salidasMesAnterior);
      }

      dataGraficoSku.push({
        mes: `${NOMBRES_MESES[m]} '26`,
        "Ingresos Kardex (IN)": esFuturo ? undefined : ingresosKardexSku[m],
        "Salidas Kardex (OUT)": esFuturo ? undefined : salidasKardexSku[m],
        "Arribos Planificados (Tabla)": arribosTablaSku[m] > 0 ? arribosTablaSku[m] : undefined,
        "Curva Proyección Stock": Math.round(Math.max(0, trackerStockSku))
      });

      // Dataset Familia
      if (m > 0) {
        const entradasFamAnterior = ingresosKardexFamilia[m-1];
        const salidasFamAnterior = salidasKardexFamilia[m-1];

        trackerStockFamilia = trackerStockFamilia +
          (m - 1 >= MES_ACTUAL_NUM ? arribosTablaFamilia[m-1] : entradasFamAnterior) - 
          (m - 1 >= MES_ACTUAL_NUM ? consumoPredictivoBufferFamilia : salidasFamAnterior);
      }

      dataGraficoFamilia.push({
        mes: `${NOMBRES_MESES[m]} '26`,
        "Ingresos Familia": esFuturo ? undefined : ingresosKardexFamilia[m],
        "Salidas Familia": esFuturo ? undefined : salidasKardexFamilia[m],
        "Arribos Familia": arribosTablaFamilia[m] > 0 ? arribosTablaFamilia[m] : undefined,
        "Inventario Consolidado": Math.round(Math.max(0, trackerStockFamilia))
      });
    }

    const totalArribosFuturosSku = arribosTablaSku.slice(MES_ACTUAL_NUM + 1).reduce((a, b) => a + b, 0);

    return {
      sku: skuActivo,
      stockInicialSkuAño,
      stockFisicoFamiliaActualTotal,
      acumuladoIngresosPasadosSku: acumIngresosSkuYTD,
      acumuladoSalidasPasadasSku: acumSalidasSkuYTD,
      totalArribosFuturosSku,
      consumoPromedioRealSku,
      consumoPredictivoBufferSku,
      mesesCoberturaSku,
      leadTimeEnMeses,
      estadoCobertura,
      dataGraficoSku,
      dataGraficoFamilia
    };
  }, [productos, skuSeleccionadoId, familiaSeleccionada]);

  const productosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return [];
    return productos.filter(p => 
      p.code.toLowerCase().includes(busqueda.toLowerCase()) || 
      p.description.toLowerCase().includes(busqueda.toLowerCase())
    );
  }, [productos, busqueda]);

  if (loading) return (
    <div className="min-h-[50vh] flex items-center justify-center bg-[#f8fafc]">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Normalizando matrices y Lead Times a meses...</p>
      </div>
    </div>
  );

  return (
    <div className="bg-[#f8fafc] p-4 sm:p-6 rounded-2xl border border-slate-200 space-y-5 w-full text-slate-800 antialiased">
      
      {/* SECTOR BUSCADOR CORE */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 relative shadow-xs">
        <div className="relative">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Seleccionar Material de Estudio</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Buscar SKU por código o descripción..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:bg-white focus:border-indigo-600 transition-all text-slate-900"
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setMostrarDropdown(true); }}
              onFocus={() => setMostrarDropdown(true)}
            />
          </div>

          {mostrarDropdown && busqueda.trim().length > 0 && (
            <div className="absolute z-50 w-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-[180px] overflow-y-auto divide-y divide-slate-100">
              {productosFiltrados.map((p) => (
                <div
                  key={p.id}
                  className="p-2.5 hover:bg-indigo-50/60 cursor-pointer text-xs flex justify-between items-center"
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
      </div>

      {reporteBalance && (
        <>
          {/* 📊 GRID CONTROLADOR: 6 TARJETAS LOGÍSTICAS CON CONTROL DE REPOSICIÓN */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="bg-slate-950 text-white p-3 rounded-xl border border-slate-950 shadow-xs">
              <span className="text-[9px] font-bold text-slate-400 uppercase block flex items-center gap-1">
                <Archive size={11}/> Stock Apertura
              </span>
              <p className="text-lg font-black mt-0.5">{reporteBalance.stockInicialSkuAño.toLocaleString()} u.</p>
              <span className="text-[8px] text-slate-400 block font-medium">Línea base Ene 2026</span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[9px] font-bold text-emerald-600 uppercase block flex items-center gap-1">
                <ArrowUpRight size={12}/> Ingresos (IN)
              </span>
              <p className="text-lg font-black text-slate-900 mt-0.5">{reporteBalance.acumuladoIngresosPasadosSku.toLocaleString()} u.</p>
              <span className="text-[8px] text-slate-400 block font-medium">Kardex Real YTD</span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[9px] font-bold text-rose-600 uppercase block flex items-center gap-1">
                <ArrowDownRight size={12}/> Salidas (OUT)
              </span>
              <p className="text-lg font-black text-slate-900 mt-0.5">{reporteBalance.acumuladoSalidasPasadasSku.toLocaleString()} u.</p>
              <span className="text-[8px] text-slate-400 block font-medium">Consumo Real YTD</span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[9px] font-bold text-cyan-600 uppercase block flex items-center gap-1">
                <Ship size={11} className="text-cyan-500" /> Arribos Prog.
              </span>
              <p className="text-lg font-black text-slate-900 mt-0.5">{reporteBalance.totalArribosFuturosSku.toLocaleString()} u.</p>
              <span className="text-[8px] text-slate-400 block font-medium">Pendientes en Tabla</span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[9px] font-bold text-indigo-700 uppercase block flex items-center gap-1">
                <Package size={11}/> Stock Actual
              </span>
              <p className="text-lg font-black text-slate-900 mt-0.5">{reporteBalance.sku.stockFisicoActual.toLocaleString()} u.</p>
              <span className="text-[8px] text-slate-400 block font-medium">LT: {reporteBalance.sku.lead_time_days}d (~{reporteBalance.leadTimeEnMeses.toFixed(1)}m)</span>
            </div>

            {/* 🚦 SEXTA TARJETA ULTRA-CALIBRADA: COBERTURA VS LEAD TIME NORMALIZADO */}
            <div className={`p-3 rounded-xl border shadow-xs transition-all flex flex-col justify-between ${
              reporteBalance.estadoCobertura === "DANGER_SHORTAGE" || reporteBalance.estadoCobertura === "DANGER_SHORTAGE"
                ? "bg-rose-600 border-rose-700 text-white" 
                : reporteBalance.estadoCobertura === "OVERSTOCK"
                ? "bg-amber-50 border-amber-200 text-amber-900"
                : "bg-emerald-50 border-emerald-200 text-emerald-900"
            }`}>
              <span className="text-[9px] font-bold uppercase block flex items-center gap-1">
                {reporteBalance.estadoCobertura === "DANGER_SHORTAGE" && <ShieldAlert size={12} className="text-white animate-bounce"/>}
                {reporteBalance.estadoCobertura === "OVERSTOCK" && <AlertTriangle size={12} className="text-amber-600"/>}
                {reporteBalance.estadoCobertura === "HEALTHY" && <CheckCircle2 size={12} className="text-emerald-600"/>}
                Meses Cobertura
              </span>
              <div>
                <p className="text-lg font-black leading-none mt-0.5">
                  {reporteBalance.mesesCoberturaSku > 24 ? "+24" : reporteBalance.mesesCoberturaSku.toFixed(1)} m.
                </p>
                <span className="text-[8px] opacity-90 block font-medium mt-1">
                  {reporteBalance.estadoCobertura === "DANGER_SHORTAGE" && `⚠️ RIESGO QUIEBRE: Menor al LT (${reporteBalance.leadTimeEnMeses.toFixed(1)} m.)`}
                  {reporteBalance.estadoCobertura === "OVERSTOCK" && `Exceso (>2.5 veces el LT)`}
                  {reporteBalance.estadoCobertura === "HEALTHY" && "Cobertura segura vs LT"}
                </span>
              </div>
            </div>
          </div>

          {/* 📈 GRÁFICO 1: BALANCE DE MASAS DEL SKU SELECCIONADO (CON FILTRO DEL +25%) */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <Package size={14} className="text-indigo-600" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                  Curva Anual Histórica y Predictiva: SKU {reporteBalance.sku.code}
                </h3>
              </div>
              {reporteBalance.consumoPromedioRealSku > 0 && (
                <div className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded flex flex-wrap items-center gap-2 self-start sm:self-center">
                  <div className="flex items-center gap-1">
                    <TrendingDown size={12} className="text-slate-400" /> Consumo Prom. Real: <span className="font-bold text-slate-800">{Math.round(reporteBalance.consumoPromedioRealSku).toLocaleString()} u./mes</span>
                  </div>
                  <div className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 rounded font-bold">
                    Proyección Futura Ácida (+25%): {Math.round(reporteBalance.consumoPredictivoBufferSku).toLocaleString()} u./mes
                  </div>
                </div>
              )}
            </div>
            
            <div className="w-full h-[320px] text-[9px] font-bold">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={reporteBalance.dataGraficoSku} margin={{ top: 15, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tickLine={false} stroke="#94a3b8" />
                  <YAxis yAxisId="left" tickLine={false} stroke="#94a3b8" />
                  <YAxis yAxisId="right" orientation="right" tickLine={false} stroke="#cbd5e1" />
                  
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '6px', color: '#f8fafc' }} />
                  <Legend verticalAlign="top" height={36} iconType="circle" iconSize={6} wrapperStyle={{ fontSize: '10px' }} />
                  
                  <Bar yAxisId="right" dataKey="Ingresos Kardex (IN)" fill="#10b981" maxBarSize={12} radius={[2, 2, 0, 0]} name="Ingresos (IN - Reales)" />
                  <Bar yAxisId="right" dataKey="Salidas Kardex (OUT)" fill="#ef4444" maxBarSize={12} radius={[2, 2, 0, 0]} name="Salidas (OUT - Reales)" />
                  <Bar yAxisId="right" dataKey="Arribos Planificados (Tabla)" fill="#06b6d4" maxBarSize={12} radius={[2, 2, 0, 0]} name="Arribos Planificados (OC)" />
                  
                  {/* Curva dinámica calculada bajo estrés de consumo +25% en meses futuros */}
                  <Line yAxisId="left" type="monotone" dataKey="Curva Proyección Stock" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 2 }} name="Línea de Proyección de Stock" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 📊 GRÁFICO 2: BALANCE CONSOLIDADO DE LA FAMILIA */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <Layers size={14} className="text-violet-600" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Capacidad Agrupada Consolidada: Familia {familiaSeleccionada}
              </h3>
            </div>

            <div className="w-full h-[320px] text-[9px] font-bold">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={reporteBalance.dataGraficoFamilia} margin={{ top: 15, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tickLine={false} stroke="#94a3b8" />
                  <YAxis yAxisId="left" tickLine={false} stroke="#94a3b8" />
                  <YAxis yAxisId="right" orientation="right" tickLine={false} stroke="#cbd5e1" />
                  
                  <Tooltip contentStyle={{ backgroundColor: '#1e1b4b', borderColor: '#312e81', borderRadius: '6px', color: '#f8fafc' }} />
                  <Legend verticalAlign="top" height={36} iconType="circle" iconSize={6} wrapperStyle={{ fontSize: '10px' }} />
                  
                  <Bar yAxisId="right" dataKey="Ingresos Familia" fill="#34d399" maxBarSize={14} radius={[2, 2, 0, 0]} name="Ingresos Reales Línea" />
                  <Bar yAxisId="right" dataKey="Salidas Familia" fill="#fb7185" maxBarSize={14} radius={[2, 2, 0, 0]} name="Salidas Reales Línea" />
                  <Bar yAxisId="right" dataKey="Arribos Familia" fill="#22d3ee" maxBarSize={14} radius={[2, 2, 0, 0]} name="Arribos de Compra Línea" />
                  
                  <Line yAxisId="left" type="monotone" dataKey="Inventario Consolidado" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 2 }} name="Stock Consolidado Predictivo" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            
            <div className="text-right text-[10px] font-black text-slate-400 uppercase tracking-wide pt-1">
              * Datos consolidados calculados en base a {productos.filter(p => p.family === familiaSeleccionada).length} SKUs en esta línea.
            </div>
          </div>
        </>
      )}
    </div>
  );
}