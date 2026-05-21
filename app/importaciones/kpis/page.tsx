"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Search, Ship, TrendingUp, Box, AlertTriangle, 
  CheckCircle, LineChart as ChartIcon, Sparkles, 
  Percent, ShieldAlert, ArrowUpRight, BarChart3 
} from "lucide-react";
import { 
  ResponsiveContainer, ComposedChart, Area, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Label 
} from "recharts";

export default function GraficoPredictivoAresIA() {
  const [productos, setProductos] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const [skuSeleccionadoId, setSkuSeleccionadoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const AÑO_ACTUAL = 2026;
  const MES_ACTUAL_NUM = 4; // Mayo es el mes 4 (0-indexed)
  const DOCUMENTOS_SALIDA = ["NS", "22", "23", "93", "TD"];

  useEffect(() => {
    fetchDataReal();
  }, []);

  async function fetchDataReal() {
    setLoading(true);
    try {
      const { data: dbProducts } = await supabase.from("products").select("*");
      const { data: dbArrivals } = await supabase.from("arrivals").select("*");

      let todosLosMovimientos: any[] = [];
      let desde = 0;
      let hasta = 999;
      let tieneMas = true;

      while (tieneMas) {
        const { data: chunk } = await supabase.from("movements").select("*").range(desde, hasta);
        if (chunk && chunk.length > 0) {
          todosLosMovimientos = [...todosLosMovimientos, ...chunk];
          if (chunk.length < 1000) tieneMas = false;
          else { desde += 1000; hasta += 1000; }
        } else { tieneMas = false; }
      }

      const datosConsolidados = (dbProducts || []).map((p: any) => {
        const productUUID = p.id;
        return {
          id: productUUID,
          code: p.code ? String(p.code).trim() : "SIN CÓDIGO",
          description: p.description ? String(p.description).trim() : "SIN DESCRIPCIÓN",
          family: p.family ? String(p.family).trim() : "GENERAL",
          lead_time: parseInt(p.lead_time) || 0,
          stockFisicoActual: Number(p.stock || 0),
          movimientos: todosLosMovimientos.filter((m: any) => m.product_id === productUUID),
          arribos: dbArrivals ? dbArrivals.filter((a: any) => a.product_id === productUUID) : []
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

    const stockFisicoActual = Number(item.stockFisicoActual || 0);
    const leadTimeDias = parseInt(item.lead_time) || 0;
    const leadTimeMeses = leadTimeDias / 30;

    // 1. EXTRAER TODAS LAS SALIDAS HISTÓRICAS (Materia prima consumida por producción)
    const todasLasSalidas = item.movimientos.filter((m: any) => {
      const tipoDoc = String(m.type || "").trim().toUpperCase();
      const codTrans = String(m.transaction_code || "").trim().toUpperCase();
      return DOCUMENTOS_SALIDA.includes(tipoDoc) || DOCUMENTOS_SALIDA.includes(codTrans);
    });

    // Mapeo completo de consumos sin importar el año para calcular la media real de la planta
    const consumosMensualesLista: number[] = [];
    const historialPorMesAnual: { [key: string]: number } = {};

    todasLasSalidas.forEach((m: any) => {
      const fechaObj = m.date ? new Date(m.date) : new Date(m.created_at);
      const año = fechaObj.getFullYear();
      const mes = fechaObj.getMonth();
      const llave = `${año}-${mes}`;
      
      if (!historialPorMesAnual[llave]) historialPorMesAnual[llave] = 0;
      historialPorMesAnual[llave] += Math.abs(Number(m.quantity || 0));
    });

    // Agrupamos los valores de los meses activos para la varianza real
    Object.keys(historialPorMesAnual).forEach(llave => {
      consumosMensualesLista.push(historialPorMesAnual[llave]);
    });

    // 2. CORRECCIÓN MACRO: Promedio basado en el ciclo completo de la base de datos (Ej: 13 meses)
    const totalMesesActivos = consumosMensualesLista.length || 1;
    const sumaTotalUnidades = consumosMensualesLista.reduce((a, b) => a + b, 0);
    const promedioNormal = sumaTotalUnidades > 0 ? (sumaTotalUnidades / totalMesesActivos) : 100;

    // 3. VARIACIÓN REAL DE LA PLANTA (Refleja los picos de fabricación de lotes de puertas)
    const varianza = consumosMensualesLista.reduce((sum, val) => sum + Math.pow(val - promedioNormal, 2), 0) / Math.max(1, totalMesesActivos - 1);
    const desviacionEstandar = Math.sqrt(varianza || 10);

    // 4. UNIFICACIÓN DE ESTRATEGIA CON TABLA PRINCIPAL (Asegurar Línea de Producción)
    let zScore = 1.28; // Cambiado de 0.84 a 1.28 (90% Nivel de protección para no parar la planta)
    let nivelClasificacion = "BLINDAJE DE STOCK (ARES FABRICA)";

    // Incremento comercial del +25% porque consumimos materia prima directo del volumen de puertas estimadas
    const demandaConIncremento = promedioNormal * 1.25; 

    // Amortiguador financiero al 25% máximo para no saturar el almacén de insumos voluminosos
    const factorVarianzaIA = zScore * desviacionEstandar;
    const colchonMaximoPermitido = demandaConIncremento * 0.25;
    const bufferAjustadoIA = factorVarianzaIA > colchonMaximoPermitido ? colchonMaximoPermitido : factorVarianzaIA;
    
    // Consumo Predictivo Final idéntico al motor del backend
    const consumoBaseIA = demandaConIncremento + bufferAjustadoIA;

    // Escenario crítico de estrés de planta (+35% extra de pedidos concurrentes)
    const consumoRiesgoCriticoIA = consumoBaseIA * 1.35;

    const tasaAumentoAbsoluto = consumoBaseIA - promedioNormal;
    const probabilidadCumplimiento = 90.0; // Indexado al nivel de servicio Gaussiano de Z=1.28

    const totalArribosExclusivos = item.arribos.reduce((sum: number, a: any) => sum + Number(a.quantity || 0), 0);
    
    // 5. COMPRA SUGERIDA CON FACTOR DE MERMA (+15% para absorber desperdicios de cortes/mermas de taller)
    const sugeridoCompra = consumoBaseIA > 0 ? (consumoBaseIA * leadTimeMeses) * 1.15 : 0;

    // Preparación de datos para renderizar la gráfica mensualizada del 2026
    const historialPorMes2026: { [key: number]: number } = {};
    for (let i = 0; i < 12; i++) historialPorMes2026[i] = 0;
    
    todasLasSalidas.forEach((m: any) => {
      const fechaObj = m.date ? new Date(m.date) : new Date(m.created_at);
      if (fechaObj.getFullYear() === AÑO_ACTUAL) {
        historialPorMes2026[fechaObj.getMonth()] += Math.abs(Number(m.quantity || 0));
      }
    });

    let invCorrienteNormal = stockFisicoActual;
    let invCorrienteEstadistico = stockFisicoActual;
    let invCorrienteRiesgo = stockFisicoActual;

    const datosHistoricosInversos: any[] = [];
    let stockIterativoPasado = stockFisicoActual;

    for (let m = MES_ACTUAL_NUM - 1; m >= 0; m--) {
      const salidasRealesMes = historialPorMes2026[m];
      stockIterativoPasado = stockIterativoPasado + salidasRealesMes;
      
      datosHistoricosInversos.unshift({
        mesNum: m,
        stockNormal: Math.max(0, stockIterativoPasado),
        stockEstadistico: Math.max(0, stockIterativoPasado),
        stockRiesgo: Math.max(0, stockIterativoPasado),
        consumoGrafico: salidasRealesMes,
        cantidadArribo: 0
      });
    }

    const arribosMayo = item.arribos.filter((a: any) => {
      const f = a.eta_date ? new Date(a.eta_date) : null;
      return f && f.getMonth() === MES_ACTUAL_NUM && f.getFullYear() === AÑO_ACTUAL;
    });
    const totalArribosMayo = arribosMayo.reduce((sum: number, curr: any) => sum + Number(curr.quantity || 0), 0);
    
    const salidasMayoReal = historialPorMes2026[MES_ACTUAL_NUM];
    // Ajustado estacionalidad base sobre el nuevo consumo predictivo unificado
    const consumoMayo = salidasMayoReal > 0 ? salidasMayoReal : consumoBaseIA;

    invCorrienteNormal += totalArribosMayo;
    invCorrienteEstadistico += totalArribosMayo;
    invCorrienteRiesgo += totalArribosMayo;

    const datosMayo = {
      mesNum: MES_ACTUAL_NUM,
      stockNormal: invCorrienteNormal,
      stockEstadistico: invCorrienteEstadistico,
      stockRiesgo: invCorrienteRiesgo,
      consumoGrafico: Math.round(consumoMayo),
      cantidadArribo: totalArribosMayo
    };

    invCorrienteNormal = Math.max(0, invCorrienteNormal - consumoMayo);
    invCorrienteEstadistico = Math.max(0, invCorrienteEstadistico - consumoMayo);
    invCorrienteRiesgo = Math.max(0, invCorrienteRiesgo - (consumoMayo * 1.35));

    const coeficientesEstacionalesPredeterminados = [
      0.95, 0.90, 1.05, 1.00, 1.10, 1.02, 1.15, 1.18, 1.13, 1.12, 1.15, 1.10
    ];

    const datosFuturos: any[] = [];
    let yaQuebro = false;
    let mesQuiebreGrafico = "";
    let mesColocacionOcGrafico = "";

    for (let m = MES_ACTUAL_NUM + 1; m <= 11; m++) {
      const arribosEsteMes = item.arribos.filter((a: any) => {
        const f = a.eta_date ? new Date(a.eta_date) : null;
        return f && f.getMonth() === m && f.getFullYear() === AÑO_ACTUAL;
      });
      const entradasOC = arribosEsteMes.reduce((sum: number, curr: any) => sum + Number(curr.quantity || 0), 0);

      const factorEstacionalidad = coeficientesEstacionalesPredeterminados[m];

      // Las proyecciones futuras ahora se alimentan del consumo unificado ajustado por estacionalidad
      const consumoNormalEstacional = promedioNormal * factorEstacionalidad;
      const consumoEstadisticoEstacional = consumoBaseIA * factorEstacionalidad;
      const consumoRiesgoEstacional = consumoRiesgoCriticoIA * factorEstacionalidad;

      invCorrienteNormal = invCorrienteNormal + entradasOC - consumoNormalEstacional;
      invCorrienteEstadistico = invCorrienteEstadistico + entradasOC - consumoEstadisticoEstacional;
      invCorrienteRiesgo = invCorrienteRiesgo + entradasOC - consumoRiesgoEstacional;

      if (invCorrienteEstadistico <= 0 && !yaQuebro) {
        const nombresMesesArr = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
        mesQuiebreGrafico = `${nombresMesesArr[m]} 26`;
        
        const diasRestantesSeguridad = Math.max(10, leadTimeDias + 5);
        const fechaEstimadaQuiebre = new Date(AÑO_ACTUAL, m, 1);
        fechaEstimadaQuiebre.setDate(fechaEstimadaQuiebre.getDate() - diasRestantesSeguridad);
        mesColocacionOcGrafico = `${nombresMesesArr[fechaEstimadaQuiebre.getMonth()]} 26`;
        yaQuebro = true;
      }

      datosFuturos.push({
        mesNum: m,
        stockNormal: Math.max(0, invCorrienteNormal),
        stockEstadistico: Math.max(0, invCorrienteEstadistico),
        stockRiesgo: Math.max(0, invCorrienteRiesgo),
        consumoGrafico: Math.round(consumoEstadisticoEstacional),
        cantidadArribo: entradasOC
      });
    }

    const nombresMesesArr = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
    const proyeccionesPorMes = [...datosHistoricosInversos, datosMayo, ...datosFuturos].map(d => ({
      mes: `${nombresMesesArr[d.mesNum]} 26`,
      "Stock Normal": Math.round(d.stockNormal),
      "Stock Estadístico": Math.round(d.stockEstadistico),
      "Stock de Riesgo (Máx)": Math.round(d.stockRiesgo),
      "Consumo Mensual": d.consumoGrafico,
      cantidadArribo: d.cantidadArribo,
    }));

    return {
      ...item,
      stockFisicoActual,
      promedioNormal,
      ajusteEstadistico: consumoBaseIA,
      promedioRiesgoMaximo: consumoRiesgoCriticoIA,
      tasaAumentoAbsoluto,
      probabilidadCumplimiento,
      coberturaMeses: consumoBaseIA > 0 ? (stockFisicoActual + totalArribosExclusivos) / consumoBaseIA : 0,
      mesQuiebre: yaQuebro ? mesQuiebreGrafico : "OK / OPERATIVO",
      mesQuiebreGrafico,
      mesColocacionOcGrafico,
      pedidoSugerido: sugeridoCompra,
      enTránsito: totalArribosExclusivos,
      nivelClasificacion,
      confianzaZ: "90%",
      proyeccionesPorMes
    };
  }, [productos, skuSeleccionadoId]);

  const productosFiltrados = productos.filter(p => 
    p.code.toLowerCase().includes(busqueda.toLowerCase()) || 
    p.description.toLowerCase().includes(busqueda.toLowerCase())
  );

  if (loading) return (
    <div className="min-h-[60vh] flex items-center justify-center bg-[#f8fafc]">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-3 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Sincronizando Motores Predictivos de Planta...</p>
      </div>
    </div>
  );

  return (
    <div className="bg-[#f8fafc] p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6 w-full mx-auto text-slate-800 font-sans antialiased select-none">
      
      {/* CUADRO DE BÚSQUEDA */}
      <div className="bg-white p-5 rounded-xl border border-slate-200/60 shadow-xs relative">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse" />
          <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
           Motor Sincronizado Materia Prima Ares 
          </label>
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-3 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="Buscar por código de SKU o descripción de material..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:bg-white focus:ring-4 focus:ring-indigo-600/5 focus:border-indigo-600 transition-all text-slate-900"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setMostrarDropdown(true);
            }}
            onFocus={() => setMostrarDropdown(true)}
          />
        </div>

        {mostrarDropdown && productosFiltrados.length > 0 && (
          <div className="absolute z-50 w-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-[280px] overflow-y-auto text-xs">
            {productosFiltrados.map((p) => (
              <div
                key={p.id}
                className="p-3.5 hover:bg-slate-50 border-b border-slate-100 cursor-pointer flex justify-between items-center transition-colors"
                onClick={() => {
                  setSkuSeleccionadoId(p.id);
                  setBusqueda(`[${p.code}] ${p.description}`);
                  setMostrarDropdown(false);
                }}
              >
                <div>
                  <span className="font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">SKU: {p.code}</span>
                  <p className="text-[11px] text-slate-400 uppercase truncate max-w-[500px] mt-1">{p.description}</p>
                </div>
                <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1 rounded-md font-bold text-[10px]">
                  Stock Inicial: {(p.stockFisicoActual ?? 0).toLocaleString()} un.
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {analisisSku ? (
        <>
          {/* TABLERO DE CAPAS DE CONSUMO COMPARATIVO */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/60 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <BarChart3 className="text-slate-800" size={16} />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Métricas Unificadas</h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-emerald-50/40 border border-emerald-100 p-4 rounded-xl flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide block">Stock Físico Actual</span>
                  <p className="text-xl font-black text-emerald-900 mt-1">{(analisisSku.stockFisicoActual).toLocaleString()} <span className="text-xs font-medium text-emerald-600">un.</span></p>
                </div>
                <p className="text-[10px] text-emerald-600 mt-2 border-t border-emerald-200/30 pt-1.5">Inventario real disponible en almacén hoy.</p>
              </div>

              <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Histórico Real (Total Ciclo)</span>
                  <p className="text-xl font-black text-slate-800 mt-1">{(Math.round(analisisSku.promedioNormal)).toLocaleString()} <span className="text-xs font-medium text-slate-500">un/mes</span></p>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 border-t border-slate-200/50 pt-1.5">Consumo promedio histórico medido en planta.</p>
              </div>

              <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide block">Consumo Estadistico (+25%)</span>
                  <p className="text-xl font-black text-indigo-900 mt-1">{(Math.round(analisisSku.ajusteEstadistico)).toLocaleString()} <span className="text-xs font-medium text-indigo-500">un/mes</span></p>
                </div>
                <p className="text-[10px] text-indigo-600/80 mt-2 border-t border-indigo-200/30 pt-1.5 font-medium">Proyeccion agregando el(+25%) + 25% de stock Maximo .</p>
              </div>

              <div className="bg-rose-50/50 border border-rose-100 p-4 rounded-xl flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wide block">Escenario Crítico (+35%)</span>
                  <p className="text-xl font-black text-rose-900 mt-1">{(Math.round(analisisSku.promedioRiesgoMaximo)).toLocaleString()} <span className="text-xs font-medium text-slate-500">un/mes</span></p>
                </div>
                <p className="text-[10px] text-rose-600/80 mt-2 border-t border-rose-200/30 pt-1.5 font-medium">Límite superior simulado ante picos de órdenes.</p>
              </div>
            </div>
          </div>

          {/* INDICADORES AVANZADOS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-xs flex items-center gap-3.5">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg"><Percent size={15} /></div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Nivel de Cobertura</span>
                <p className="text-xs font-black text-slate-900 truncate max-w-[140px]">{analisisSku.nivelClasificacion}</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-xs flex items-center gap-3.5">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg"><ArrowUpRight size={15} /></div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Colchón Concedido</span>
                <p className="text-xs font-black text-slate-900">+{Math.round(analisisSku.tasaAumentoAbsoluto).toLocaleString()} un.</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-xs flex items-center gap-3.5">
              <div className="p-2.5 bg-rose-50 text-rose-600 rounded-lg"><ShieldAlert size={15} /></div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Predicción de Rotura</span>
                <p className={`text-xs font-black ${analisisSku.mesQuiebre !== "OK / OPERATIVO" ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {analisisSku.mesQuiebre}
                </p>
              </div>
            </div>

            <div className="bg-slate-900 p-4 rounded-xl shadow-xs flex items-center gap-3.5 text-white">
              <div className="p-2.5 bg-slate-800 text-indigo-400 rounded-lg"><Sparkles size={15} /></div>
              <div>
                <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider block">Pedido Sugerido (+Merma)</span>
                <p className="text-xs font-black text-white">{Math.round(analisisSku.pedidoSugerido).toLocaleString()} un.</p>
              </div>
            </div>
          </div>

          {/* GRÁFICO DINÁMICO */}
          <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200/60 shadow-xs space-y-4 w-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-4 gap-2">
              <div className="flex items-center gap-2 text-xs font-black text-slate-900 uppercase tracking-wider">
                <ChartIcon size={14} className="text-indigo-600" />
                <span>Simulador Unificado: Inventarios Reales vs Demanda Industrial Sincronizada</span>
              </div>
            </div>

            <div className="w-full h-[440px] text-[10px] font-bold">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={analisisSku.proyeccionesPorMes} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradientEstadistico" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.12}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tickLine={false} stroke="#94a3b8" />
                  
                  <YAxis yAxisId="left" tickLine={false} stroke="#94a3b8" name="Stock" />
                  <YAxis yAxisId="right" orientation="right" tickLine={false} stroke="#cbd5e1" name="Consumo" />
                  
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#f8fafc' }}
                    itemStyle={{ fontSize: '11px' }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                  
                  <Bar yAxisId="right" dataKey="Consumo Mensual" fill="#cbd5e1" maxBarSize={32} radius={[4, 4, 0, 0]} opacity={0.7} name="Consumo Proyectado Planta (Sincronizado)" />

                  <Line yAxisId="left" type="monotone" dataKey="Stock de Riesgo (Máx)" stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Trayectoria con Estrés Industrial (+35%)" />
                  <Line yAxisId="left" type="monotone" dataKey="Stock Normal" stroke="#64748b" strokeWidth={1.5} strokeDasharray="6 2" dot={false} name="Trayectoria Lineal Base" />
                  <Area yAxisId="left" type="monotone" dataKey="Stock Estadístico" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#gradientEstadistico)" name="Trayectoria Predictiva ARES IA" dot={{ r: 2 }} />

                  {analisisSku.mesColocacionOcGrafico && (
                    <ReferenceLine yAxisId="left" x={analisisSku.mesColocacionOcGrafico} stroke="#d97706" strokeWidth={1.5}>
                      <Label value="SOLICITAR OC" position="top" fill="#b45309" fontSize={9} fontWeight="black" />
                    </ReferenceLine>
                  )}

                  {analisisSku.mesQuiebreGrafico && (
                    <ReferenceLine yAxisId="left" x={analisisSku.mesQuiebreGrafico} stroke="#ef4444" strokeWidth={1.5}>
                      <Label value="QUIEBRE DE STOCK" position="top" fill="#ef4444" fontSize={9} fontWeight="black" />
                    </ReferenceLine>
                  )}

                  {analisisSku.proyeccionesPorMes.map((p: any, idx: number) => {
                    if (p.cantidadArribo > 0) {
                      return (
                        <ReferenceLine key={idx} yAxisId="left" x={p.mes} stroke="#10b981" strokeWidth={2}>
                          <Label 
                            value={`ARRIVO: +${p.cantidadArribo.toLocaleString()} un.`} 
                            position="insideTopLeft" 
                            fill="#047857" 
                            fontSize={9} 
                            fontWeight="bold" 
                            type="shared"
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
        <div className="text-center py-20 text-slate-400 text-xs font-semibold uppercase tracking-wider bg-white rounded-xl border border-slate-200 shadow-xs">
          Selecciona un componente del catálogo para proyectar los escenarios de simulación.
        </div>
      )}
    </div>
  );
}