"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Search, LineChart as ChartIcon, ShieldAlert, BarChart3, Eye, Filter, ListFilter, Calendar } from "lucide-react";
import { 
  ResponsiveContainer, ComposedChart, Area, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Label 
} from "recharts";

const AÑO_ACTUAL = 2026;
const MES_ACTUAL_NUM = 5; // Junio 2026 (0-indexed = 5)
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
  const [escenarioVisual, setEscenarioVisual] = useState<"ESTADISTICO" | "NORMAL" | "CRITICO">("ESTADISTICO");

  // Extraer catálogo único de familias para el filtro dinámico
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

    // 1. CONSUMOS HISTÓRICOS REALES
    const todasLasSalidas = item.movimientos.filter(esMovimientoSalida);
    const historialPorMesAnual: Record<string, number> = {};
    
    todasLasSalidas.forEach((m: any) => {
      const f = m.date ? new Date(m.date) : new Date(m.created_at);
      const llave = `${f.getFullYear()}-${f.getMonth()}`;
      historialPorMesAnual[llave] = (historialPorMesAnual[llave] || 0) + Math.abs(Number(m.quantity || 0));
    });

    const valoresConsumo = Object.values(historialPorMesAnual);
    const totalMesesActivos = valoresConsumo.length || 1;
    const sumaTotalUnidades = valoresConsumo.reduce((a, b) => a + b, 0);
    
    // 2. CONFIGURACIÓN DE LOS 3 TIPOS DE CONSUMO MENSUALES BASE
    const consumoNormal = sumaTotalUnidades > 0 ? (sumaTotalUnidades / totalMesesActivos) : 100;
    
    const varianza = valoresConsumo.reduce((sum, val) => sum + Math.pow(val - consumoNormal, 2), 0) / Math.max(1, totalMesesActivos - 1);
    const desviacionEstandar = Math.sqrt(varianza || 10);
    const demandaConIncremento = consumoNormal * 1.25; 
    const bufferAjustadoIA = (1.28 * desviacionEstandar) > (demandaConIncremento * 0.25) ? (demandaConIncremento * 0.25) : (1.28 * desviacionEstandar);
    
    const consumoAresIA = demandaConIncremento + bufferAjustadoIA; 
    const consumoEstres = consumoAresIA * 1.35;

    const arribosRealesPorMes: Record<number, number> = {};
    item.arribos.forEach((a: any) => {
      const f = a.eta_date ? new Date(a.eta_date) : null;
      if (f && f.getFullYear() === AÑO_ACTUAL) {
        arribosRealesPorMes[f.getMonth()] = (arribosRealesPorMes[f.getMonth()] || 0) + Number(a.quantity || 0);
      }
    });

    // 3. SIMULACIÓN DE HITOS E INVERSA DE COMPRAS POR ESCENARIOS
    const calcularHitosEscenario = (tasaConsumoBase: number) => {
      let inventarioSimulado = stockFisicoActual;
      let yaQuebro = false;
      let mesQuiebre = "OPERATIVO";
      let mesOC = "AL DÍA";
      const coeficientesEstacionales = [0.95, 0.90, 1.05, 1.00, 1.10, 1.02, 1.15, 1.18, 1.13, 1.12, 1.15, 1.10];

      for (let t = 0; t < 16; t++) {
        const indiceMes = (MES_ACTUAL_NUM + t) % 12;
        const añoSimulado = AÑO_ACTUAL + Math.floor((MES_ACTUAL_NUM + t) / 12);
        const ingresosOC = añoSimulado === 2026 ? (arribosRealesPorMes[indiceMes] || 0) : 0;
        
        inventarioSimulado = inventarioSimulado + ingresosOC - (tasaConsumoBase * coeficientesEstacionales[indiceMes]);

        if (inventarioSimulado <= 0 && !yaQuebro) {
          mesQuiebre = `${NOMBRES_MESES[indiceMes]} ${añoSimulado === 2026 ? "26" : "27"}`;
          
          const tiempoCompraEstratégica = t - mesesLeadTime;
          const idxOC = (MES_ACTUAL_NUM + tiempoCompraEstratégica) % 12;
          const añoOC = AÑO_ACTUAL + Math.floor((MES_ACTUAL_NUM + tiempoCompraEstratégica) / 12);
          
          const idxOCNormalizado = idxOC >= 0 ? idxOC : 12 + idxOC;
          const añoOCNormalizado = idxOC >= 0 ? añoOC : añoOC - 1;

          mesOC = `${NOMBRES_MESES[idxOCNormalizado]} ${añoOCNormalizado === 2026 ? "26" : "27"}`;
          yaQuebro = true;
        }
      }
      
      const pedidoSugeridoVolumen = (tasaConsumoBase * mesesLeadTime) * 1.15;
      return { mesQuiebre, mesOC, pedidoSugerido: Math.round(pedidoSugeridoVolumen) };
    };

    const hitoNormal = calcularHitosEscenario(consumoNormal);
    const hitoAresIA = calcularHitosEscenario(consumoAresIA);
    const hitoEstres = calcularHitosEscenario(consumoEstres);

    // 4. ESTRUCTURA CRONOLÓGICA CON PASADO HISTÓRICO CONGELADO
    const salidasPorMesAñoActual: Record<number, number> = {};
    todasLasSalidas.forEach((m: any) => {
      const f = m.date ? new Date(m.date) : new Date(m.created_at);
      if (f.getFullYear() === AÑO_ACTUAL) {
        salidasPorMesAñoActual[f.getMonth()] = (salidasPorMesAñoActual[f.getMonth()] || 0) + Math.abs(Number(m.quantity || 0));
      }
    });

    const datosCronologicosGrafico: any[] = [];
    let stockIterativoPasado = stockFisicoActual;

    // PASADO: Consumo Real Fijo (Inalterable)
    for (let m = MES_ACTUAL_NUM - 1; m >= 0; m--) {
      const salidasReales = salidasPorMesAñoActual[m] || 0;
      stockIterativoPasado += salidasReales;
      datosCronologicosGrafico.unshift({
        mes: `${NOMBRES_MESES[m]} 26`,
        "Stock Normal": Math.max(0, stockIterativoPasado),
        "Stock Estadístico (Ares IA)": Math.max(0, stockIterativoPasado),
        "Stock de Riesgo (Máx)": Math.max(0, stockIterativoPasado),
        "Consumo Visual": salidasReales, 
        cantidadArribo: 0
      });
    }

    // FUTURO: Proyecciones de las curvas e impacto estacional en barras
    let invCorrienteNormal = stockFisicoActual;
    let invCorrienteEstadistico = stockFisicoActual;
    let invCorrienteRiesgo = stockFisicoActual;
    const coeficientesEstacionales = [0.95, 0.90, 1.05, 1.00, 1.10, 1.02, 1.15, 1.18, 1.13, 1.12, 1.15, 1.10];

    for (let t = 0; t < 16; t++) {
      const indiceMesAbsoluto = (MES_ACTUAL_NUM + t) % 12;
      const añoSimulado = AÑO_ACTUAL + Math.floor((MES_ACTUAL_NUM + t) / 12);
      const etiquetaMesAnual = `${NOMBRES_MESES[indiceMesAbsoluto]} ${añoSimulado === 2026 ? "26" : "27"}`;
      const ingresosOC = añoSimulado === 2026 ? (arribosRealesPorMes[indiceMesAbsoluto] || 0) : 0;
      const factorEstacional = coeficientesEstacionales[indiceMesAbsoluto];

      invCorrienteNormal = invCorrienteNormal + ingresosOC - (consumoNormal * factorEstacional);
      invCorrienteEstadistico = invCorrienteEstadistico + ingresosOC - (consumoAresIA * factorEstacional);
      invCorrienteRiesgo = invCorrienteRiesgo + ingresosOC - (consumoEstres * factorEstacional);

      const consumoElegidoVisual = escenarioVisual === "ESTADISTICO" ? (consumoAresIA * factorEstacional) :
                                   escenarioVisual === "NORMAL" ? (consumoNormal * factorEstacional) : (consumoEstres * factorEstacional);

      datosCronologicosGrafico.push({
        mes: etiquetaMesAnual,
        "Stock Normal": Math.round(Math.max(0, invCorrienteNormal)),
        "Stock Estadístico (Ares IA)": Math.round(Math.max(0, invCorrienteEstadistico)),
        "Stock de Riesgo (Máx)": Math.round(Math.max(0, invCorrienteRiesgo)),
        "Consumo Visual": Math.round(consumoElegidoVisual), 
        cantidadArribo: ingresosOC
      });
    }

    const hitoGraficoActivo = escenarioVisual === "ESTADISTICO" ? hitoAresIA : 
                              escenarioVisual === "NORMAL" ? hitoNormal : hitoEstres;

    return {
      ...item,
      stockFisicoActual,
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

  // Filtro Inteligente Ajustado (Sin inicialización forzada por defecto)
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
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando Base de Datos e Inventarios...</p>
      </div>
    </div>
  );

  return (
    <div className="bg-[#f8fafc] p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 w-full mx-auto text-slate-800 antialiased">
      
      {/* SECTOR FILTROS FLEXIBLE: BUSQUEDA POR TEXTO + FAMILIA (NADA CARGADO POR DEFECTO) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3 relative">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          
          {/* Caja de Búsqueda de Texto Libre */}
          <div className="md:col-span-8 relative">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Buscador de Códigos</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Escribe el código SKU o descripción para buscar..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:bg-white focus:border-purple-600 transition-all text-slate-900 shadow-xs"
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setMostrarDropdown(true); }}
                onFocus={() => setMostrarDropdown(true)}
              />
            </div>

            {/* Listado de Coincidencias Desplegable */}
            {mostrarDropdown && busqueda.trim().length > 0 && (
              <div className="absolute z-50 w-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-[230px] overflow-y-auto divide-y divide-slate-100">
                {productosFiltrados.length > 0 ? (
                  productosFiltrados.map((p) => (
                    <div
                      key={p.id}
                      className="p-2.5 hover:bg-purple-50/60 cursor-pointer text-xs flex justify-between items-center transition-colors"
                      onClick={() => {
                        setSkuSeleccionadoId(p.id);
                        setBusqueda(`[${p.code}] ${p.description}`);
                        setMostrarDropdown(false);
                      }}
                    >
                      <div className="truncate pr-4">
                        <span className="font-bold text-slate-900 mr-2">[{p.code}]</span>
                        <span className="text-slate-500 uppercase font-medium">{p.description}</span>
                      </div>
                      <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded shrink-0 uppercase">
                        {p.family}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-slate-400 text-[11px] font-semibold uppercase">Ningún ítem coincide con los criterios</div>
                )}
              </div>
            )}
          </div>

          {/* Selector Especial por Familia */}
          <div className="md:col-span-4 relative">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Filtrar por Familia</label>
            <div className="relative flex items-center">
              <ListFilter className="absolute left-3 text-slate-400 pointer-events-none" size={14} />
              <select
                value={familiaSeleccionada}
                onChange={(e) => { setFamiliaSeleccionada(e.target.value); if(busqueda.trim()) setMostrarDropdown(true); }}
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:bg-white focus:border-purple-600 appearance-none text-slate-700 cursor-pointer"
              >
                {listaFamilias.map((f, idx) => (
                  <option key={idx} value={f}>{f === "TODAS" ? "TODAS LAS FAMILIAS" : f}</option>
                ))}
              </select>
              <div className="absolute right-3 pointer-events-none border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-500 w-0 h-0" />
            </div>
          </div>

        </div>
        {mostrarDropdown && <div className="fixed inset-0 z-40" onClick={() => setMostrarDropdown(false)} />}
      </div>

      {analisisSku ? (
        <>
          {/* MEDIDORES DE CAPACIDAD DE TASAS MENSUALES */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <BarChart3 className="text-slate-800" size={14} />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Configuración Base de Tasas de Salida</h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-emerald-50/40 border border-emerald-100 p-3 rounded-xl">
                <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wide block">Stock Físico Real</span>
                <p className="text-lg font-black text-emerald-900 mt-0.5">{analisisSku.stockFisicoActual.toLocaleString()} <span className="text-xs font-medium text-emerald-600">un.</span></p>
                <p className="text-[9px] text-emerald-600 mt-1">Disponible en almacén hoy.</p>
              </div>

              <div className="bg-slate-50 border border-slate-200/60 p-3 rounded-xl">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide block">1. Promedio Comercial</span>
                <p className="text-lg font-black text-slate-800 mt-0.5">{Math.round(analisisSku.consumoNormal).toLocaleString()} <span className="text-xs font-medium text-slate-500">un/mes</span></p>
                <p className="text-[9px] text-slate-400 mt-1">Histórico de Salidas.</p>
              </div>

              <div className="bg-purple-50/50 border border-purple-100 p-3 rounded-xl">
                <span className="text-[9px] font-bold text-purple-600 uppercase tracking-wide block">2. Promedio Estadistico Ajustado (25% demanda con Tope Max de 25%)</span>
                <p className="text-lg font-black text-purple-900 mt-0.5">{Math.round(analisisSku.consumoAresIA).toLocaleString()} <span className="text-xs font-medium text-purple-500">un/mes</span></p>
                <p className="text-[9px] text-purple-600/80 mt-1">Línea base sugerida con colchón.</p>
              </div>

              <div className="bg-rose-50/50 border border-rose-100 p-3 rounded-xl">
                <span className="text-[9px] font-bold text-rose-600 uppercase tracking-wide block">3. Promedio Maximo segun Demanda muy Variable</span>
                <p className="text-lg font-black text-rose-900 mt-0.5">{Math.round(analisisSku.consumoEstres).toLocaleString()} <span className="text-xs font-medium text-slate-500">un/mes</span></p>
                <p className="text-[9px] text-rose-600/80 mt-1">Simulación ante picos (+35%).</p>
              </div>
            </div>
          </div>

          {/* CUADRO MULTI-ESCENARIOS DE ABASTECIMIENTO */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <ShieldAlert size={14} className="text-purple-600" />
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Matriz de Planificación por Escenarios
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Trayectoria Lineal */}
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase">1. Trayectoria Lineal</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">Consumo Base</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2.5 text-[11px]">
                    <div>
                      <span className="text-[9px] text-slate-400 block font-bold">FECHA QUIEBRE:</span>
                      <span className="font-black text-slate-700">{analisisSku.hitoNormal.mesQuiebre}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-amber-600 block font-bold">COLOCAR OC:</span>
                      <span className="font-black text-amber-900 bg-amber-100/70 px-1.5 py-0.5 rounded text-[10px]">{analisisSku.hitoNormal.mesOC}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200 flex justify-between items-center text-[11px]">
                  <span className="text-slate-400 font-bold">SUGERIDO COMPRA:</span>
                  <span className="font-black text-slate-900">{analisisSku.hitoNormal.pedidoSugerido.toLocaleString()} un.</span>
                </div>
              </div>

              {/* Recomendación Ares IA */}
              <div className="border border-purple-200 rounded-lg p-3 bg-purple-50/30 flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-purple-600 text-white font-black text-[7px] px-2 py-0.5 rounded-bl uppercase tracking-widest"></div>
                <div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-purple-700 uppercase">2. Trayectoria Estadística</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Recomendado</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2.5 text-[11px]">
                    <div>
                      <span className="text-[9px] text-purple-400 block font-bold">FECHA QUIEBRE:</span>
                      <span className="font-black text-purple-900">{analisisSku.hitoAresIA.mesQuiebre}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-amber-700 block font-bold">COLOCAR OC:</span>
                      <span className="font-black text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded text-[10px] font-extrabold">{analisisSku.hitoAresIA.mesOC}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-purple-100 flex justify-between items-center text-[11px]">
                  <span className="text-purple-500 font-bold">SUGERIDO COMPRA:</span>
                  <span className="font-black text-purple-900">{analisisSku.hitoAresIA.pedidoSugerido.toLocaleString()} un.</span>
                </div>
              </div>

              {/* Saturación por Estrés */}
              <div className="border border-rose-200 rounded-lg p-3 bg-rose-50/30 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-rose-700 uppercase">3. TRAYECTORIA MAX (+35%)</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">Saturación</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2.5 text-[11px]">
                    <div>
                      <span className="text-[9px] text-rose-400 block font-bold">FECHA QUIEBRE:</span>
                      <span className="font-black text-rose-700">{analisisSku.hitoEstres.mesQuiebre}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-rose-500 block font-bold">OC CRÍTICA:</span>
                      <span className="font-black text-white bg-rose-600 px-1.5 py-0.5 rounded text-[10px]">{analisisSku.hitoEstres.mesOC}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-rose-100 flex justify-between items-center text-[11px]">
                  <span className="text-rose-500 font-bold">SUGERIDO COMPRA:</span>
                  <span className="font-black text-rose-900">{analisisSku.hitoEstres.pedidoSugerido.toLocaleString()} un.</span>
                </div>
              </div>
            </div>
          </div>

          {/* CUADRO DEL GRÁFICO PREDICTIVO */}
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-3 w-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-3 gap-2 text-[11px]">
              <div className="flex items-center gap-2 font-black text-slate-900 uppercase">
                <ChartIcon size={14} className="text-purple-600" />
                <span>Proyección FUTRA vs Historial Real</span>
              </div>
              
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-200 font-black text-[10px]">
                <span className="text-slate-400 px-1.5 uppercase flex items-center gap-0.5"><Eye size={11}/> Simular Futuro:</span>
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
                  ARES IA
                </button>
                <button 
                  onClick={() => setEscenarioVisual("CRITICO")}
                  className={`px-2.5 py-0.5 rounded text-[9px] transition-all ${escenarioVisual === "CRITICO" ? "bg-rose-600 text-white shadow-xs" : "text-slate-500"}`}
                >
                  ESTRÉS
                </button>
              </div>
            </div>

            <div className="w-full h-[380px] text-[9px] font-bold">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={analisisSku.proyeccionesPorMes} margin={{ top: 20, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradientEstadistico" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tickLine={false} stroke="#94a3b8" />
                  
                  <YAxis yAxisId="left" tickLine={false} stroke="#94a3b8" />
                  <YAxis yAxisId="right" orientation="right" tickLine={false} stroke="#cbd5e1" />
                  
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '6px', color: '#f8fafc' }}
                    itemStyle={{ fontSize: '11px' }}
                  />
                  <Legend verticalAlign="top" height={32} iconType="circle" iconSize={6} wrapperStyle={{ fontSize: '10px', fontWeight: 'black' }} />
                  
                  {/* Barras de Consumo: Histórico inalterado en el pasado, variables solo a futuro */}
                  <Bar yAxisId="right" dataKey="Consumo Visual" fill="#94a3b8" maxBarSize={24} radius={[3, 3, 0, 0]} opacity={0.4} name="Tasa de Salidas (Historial Fijo / Simulación Futura)" />

                  <Line yAxisId="left" type="monotone" dataKey="Stock de Riesgo (Máx)" stroke="#f43f5e" strokeWidth={1.2} strokeDasharray="4 4" dot={false} name="Trayectoria con Estrés (+35%)" />
                  <Line yAxisId="left" type="monotone" dataKey="Stock Normal" stroke="#64748b" strokeWidth={1.2} strokeDasharray="5 2" dot={false} name="Trayectoria Lineal Base" />
                  <Area yAxisId="left" type="monotone" dataKey="Stock Estadístico (Ares IA)" stroke="#4f46e5" strokeWidth={2.5} fillOpacity={1} fill="url(#gradientEstadistico)" name="Curva Predictiva ARES IA" dot={{ r: 1.5 }} />

                  {/* LÍNEA GUÍA: CALENDARIO EXACTO DE COLOCACIÓN DE ORDEN DE COMPRA */}
                  {analisisSku.hitoGraficoActivo.mesOC !== "AL DÍA" && (
                    <ReferenceLine yAxisId="left" x={analisisSku.hitoGraficoActivo.mesOC} stroke="#d97706" strokeWidth={2} strokeDasharray="4 3">
                      <Label value={`COLOCAR OC: ${analisisSku.hitoGraficoActivo.mesOC}`} position="top" fill="#b45309" fontSize={8} fontWeight="black" />
                    </ReferenceLine>
                  )}

                  {/* LÍNEA GUÍA: PUNTO ESTIMADO DE QUIEBRE */}
                  {analisisSku.hitoGraficoActivo.mesQuiebre !== "OPERATIVO" && (
                    <ReferenceLine yAxisId="left" x={analisisSku.hitoGraficoActivo.mesQuiebre} stroke="#ef4444" strokeWidth={2}>
                      <Label value={`QUIEBRE STOCK: ${analisisSku.hitoGraficoActivo.mesQuiebre}`} position="top" fill="#ef4444" fontSize={8} fontWeight="black" />
                    </ReferenceLine>
                  )}

                  {/* Marcadores de Arribos de OC confirmados en ERP */}
                  {analisisSku.proyeccionesPorMes.map((p: any, idx: number) => {
                    if (p.cantidadArribo > 0) {
                      return (
                        <ReferenceLine key={`arribo-${idx}`} yAxisId="left" x={p.mes} stroke="#10b981" strokeWidth={1.5}>
                          <Label value={`ARRIVO: +${p.cantidadArribo.toLocaleString()} un.`} position="insideTopLeft" fill="#047857" fontSize={8} fontWeight="black" />
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
          Usa los controles superiores para buscar un SKU e inicializar las simulaciones.
        </div>
      )}
    </div>
  );
}