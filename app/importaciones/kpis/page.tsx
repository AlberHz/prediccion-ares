"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Search, Ship, TrendingUp, Calendar, Box, AlertTriangle, CheckCircle, LineChart as ChartIcon, ArrowDownToLine } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Label } from "recharts";

/**
 * ARES SYSTEM - FILTRADO EXCLUSIVO DE ARRIBOS Y MAXIMIZACIÓN DE PANTALLA
 * Lee únicamente los arribos programados de la tabla 'arrivals'.
 */
export default function GraficoPredictivoAres() {
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
          // ÚNICA FUENTE DE ARRIBOS AUTORIZADA
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

    // 1. Ritmo de consumo histórico basado en movimientos de salida
    const todasLasSalidas = item.movimientos.filter((m: any) => {
      const tipoDoc = String(m.type || "").trim().toUpperCase();
      const codTrans = String(m.transaction_code || "").trim().toUpperCase();
      return DOCUMENTOS_SALIDA.includes(tipoDoc) || DOCUMENTOS_SALIDA.includes(codTrans);
    });

    const unidadesTotalesSalida = todasLasSalidas.reduce((sum: number, curr: any) => sum + Math.abs(Number(curr.quantity || 0)), 0);
    const mesesConActividad = new Set(todasLasSalidas.map((m: any) => {
      const fechaObj = m.date ? new Date(m.date) : new Date(m.created_at);
      return `${fechaObj.getFullYear()}-${fechaObj.getMonth()}`;
    }));

    const totalMesesPeriodo = mesesConActividad.size > 0 ? mesesConActividad.size : 1;
    const promedioMensualSalidas = unidadesTotalesSalida / totalMesesPeriodo;

    // Obtener exclusivamente el arribo de la tabla 'arrivals'
    const totalArribosExclusivos = item.arribos.reduce((sum: number, a: any) => sum + Number(a.quantity || 0), 0);
    const sugeridoCompra = promedioMensualSalidas > 0 ? (promedioMensualSalidas * (leadTimeDias / 30)) * 1.15 : 0;

    let inventarioCorriente = stockFisicoActual;

    // RECONSTRUCCIÓN HISTÓRICA LIMPIA (Ene-Abr)
    const datosHistoricosInversos: any[] = [];
    let stockIterativoPasado = stockFisicoActual;

    for (let m = MES_ACTUAL_NUM - 1; m >= 0; m--) {
      const movsMes = item.movimientos.filter((mvs: any) => {
        const f = mvs.date ? new Date(mvs.date) : new Date(mvs.created_at);
        return f.getMonth() === m && f.getFullYear() === AÑO_ACTUAL;
      });

      const salidasReales = movsMes.filter((mvs: any) => {
        const t = String(mvs.type || "").trim().toUpperCase();
        const c = String(mvs.transaction_code || "").trim().toUpperCase();
        return DOCUMENTOS_SALIDA.includes(t) || DOCUMENTOS_SALIDA.includes(c);
      }).reduce((sum: number, curr: any) => sum + Math.abs(Number(curr.quantity || 0)), 0);

      stockIterativoPasado = stockIterativoPasado + salidasReales;
      datosHistoricosInversos.unshift({
        mesNum: m,
        stockProyectado: Math.max(0, stockIterativoPasado),
        velocidadConsumo: salidasReales,
        cantidadArribo: 0, // 0 porque no calculamos arribos desde el historial de movimientos
        tipo: "REAL"
      });
    }

    // INTERCEPCIÓN EN MES ACTUAL (Mayo 2026)
    const arribosMayo = item.arribos.filter((a: any) => {
      const f = a.eta_date ? new Date(a.eta_date) : null;
      return f && f.getMonth() === MES_ACTUAL_NUM && f.getFullYear() === AÑO_ACTUAL;
    });
    const totalArribosMayo = arribosMayo.reduce((sum: number, curr: any) => sum + Number(curr.quantity || 0), 0);

    const movsMayo = item.movimientos.filter((mvs: any) => {
      const f = mvs.date ? new Date(mvs.date) : new Date(mvs.created_at);
      return f.getMonth() === MES_ACTUAL_NUM && f.getFullYear() === AÑO_ACTUAL;
    });
    const salidasMayoReal = movsMayo.reduce((sum: number, curr: any) => sum + Math.abs(Number(curr.quantity || 0)), 0);
    const consumoMayo = salidasMayoReal > 0 ? salidasMayoReal : promedioMensualSalidas;

    // Sumamos el arribo real directo de la tabla de arribos antes de la proyección futura
    inventarioCorriente = inventarioCorriente + totalArribosMayo;

    const datosMayo = {
      mesNum: MES_ACTUAL_NUM,
      stockProyectado: inventarioCorriente,
      velocidadConsumo: Math.round(consumoMayo),
      cantidadArribo: totalArribosMayo,
      tipo: "MES_ACTUAL"
    };

    inventarioCorriente = Math.max(0, inventarioCorriente - consumoMayo);

    // PROYECCIÓN FUTURA (Junio a Diciembre)
    const datosFuturos: any[] = [];
    let yaQuebro = false;
    let fechaQuiebre = new Date(AÑO_ACTUAL, 11, 31);
    let mesQuiebreGrafico = "";
    let mesColocacionOcGrafico = "";

    for (let m = MES_ACTUAL_NUM + 1; m <= 11; m++) {
      const arribosEsteMes = item.arribos.filter((a: any) => {
        const f = a.eta_date ? new Date(a.eta_date) : null;
        return f && f.getMonth() === m && f.getFullYear() === AÑO_ACTUAL;
      });
      const entradasOC = arribosEsteMes.reduce((sum: number, curr: any) => sum + Number(curr.quantity || 0), 0);

      inventarioCorriente = inventarioCorriente + entradasOC - promedioMensualSalidas;

      if (inventarioCorriente <= 0 && !yaQuebro) {
        fechaQuiebre = new Date(AÑO_ACTUAL, m, 1);
        const nombresMesesArr = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
        mesQuiebreGrafico = `${nombresMesesArr[m]} 26`;
        yaQuebro = true;
      }

      datosFuturos.push({
        mesNum: m,
        stockProyectado: Math.max(0, inventarioCorriente),
        velocidadConsumo: Math.round(promedioMensualSalidas),
        cantidadArribo: entradasOC,
        tipo: "PROYECCION"
      });
    }

    if (yaQuebro) {
      const fechaLimiteOC = new Date(fechaQuiebre);
      fechaLimiteOC.setDate(fechaLimiteOC.getDate() - leadTimeDias - 30); // 30 días antes del quiebre para margen de seguridad
      const nombresMesesArr = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
      mesColocacionOcGrafico = `${nombresMesesArr[fechaLimiteOC.getMonth()]} 26`;
    }

    const nombresMesesArr = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
    const proyeccionesPorMes = [...datosHistoricosInversos, datosMayo, ...datosFuturos].map(d => ({
      mes: `${nombresMesesArr[d.mesNum]} 26`,
      stockProyectado: d.stockProyectado,
      velocidadConsumo: d.velocidadConsumo,
      cantidadArribo: d.cantidadArribo,
      info: d.tipo
    }));

    let fechaLimiteOCStr = "No requiere";
    if (yaQuebro) {
      const fechaLimiteOC = new Date(fechaQuiebre);
      fechaLimiteOC.setDate(fechaLimiteOC.getDate() - leadTimeDias - 30); // 30 días antes del quiebre para margen de seguridad
      fechaLimiteOCStr = fechaLimiteOC.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
    }

    return {
      ...item,
      stockFisicoActual,
      consumoIA: promedioMensualSalidas,
      coberturaMeses: promedioMensualSalidas > 0 ? (stockFisicoActual + totalArribosExclusivos) / promedioMensualSalidas : 0,
      mesQuiebre: yaQuebro ? mesQuiebreGrafico : "OK / ESTABLE",
      mesQuiebreGrafico,
      mesColocacionOcGrafico,
      fechaLimiteOCStr,
      pedidoSugerido: sugeridoCompra,
      enTránsito: totalArribosExclusivos,
      proyeccionesPorMes
    };
  }, [productos, skuSeleccionadoId]);

  const productosFiltrados = productos.filter(p => 
    p.code.toLowerCase().includes(busqueda.toLowerCase()) || 
    p.description.toLowerCase().includes(busqueda.toLowerCase())
  );

  if (loading) return (
    <div className="min-h-[50vh] flex items-center justify-center bg-[#f8fafc]">
      <div className="text-center space-y-2">
        <div className="w-9 h-9 border-2 border-slate-800 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Filtrando y acoplando tabla arrivals de Supabase...</p>
      </div>
    </div>
  );

  return (
    // CAMBIO DE DISEÑO: w-full total sin restricciones laterales rígidas para ocupar toda la pantalla
    <div className="bg-[#f8fafc] p-2 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-6 w-full mx-auto text-slate-800 font-sans">
      
      {/* CONTROLADOR DE BÚSQUEDA */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm relative">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">
          Eje de Control Predictivo de Suministros (Filtro estricto de Tabla Arrivals)
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Escribe código de material..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold outline-none focus:bg-white focus:border-purple-600 transition-all text-slate-900"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setMostrarDropdown(true);
            }}
            onFocus={() => setMostrarDropdown(true)}
          />
        </div>

        {mostrarDropdown && productosFiltrados.length > 0 && (
          <div className="absolute z-50 w-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-[250px] overflow-y-auto text-[11px]">
            {productosFiltrados.map((p) => (
              <div
                key={p.id}
                className="p-3 hover:bg-slate-50 border-b border-slate-100 cursor-pointer flex justify-between items-center"
                onClick={() => {
                  setSkuSeleccionadoId(p.id);
                  setBusqueda(`[${p.code}] ${p.description}`);
                  setMostrarDropdown(false);
                }}
              >
                <div>
                  <span className="font-bold text-slate-900">SKU: {p.code}</span>
                  <p className="text-[10px] text-slate-400 uppercase truncate max-w-[600px]">{p.description}</p>
                </div>
                <span className="bg-purple-50 border border-purple-100 text-purple-700 px-2.5 py-1 rounded font-bold text-[10px]">
                  Stock Base: {(p.stockFisicoActual ?? 0).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {analisisSku ? (
        <>
          {/* GRIDS KPI ADAPTATIVOS */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
              <div className="p-2 bg-slate-100 rounded-lg text-slate-600 hidden sm:block"><Box size={14} /></div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Stock Base (Mayo)</p>
                <p className="text-sm font-black text-slate-900">{Number(analisisSku.stockFisicoActual ?? 0).toLocaleString()} un.</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
              <div className="p-2 bg-purple-50 rounded-lg text-purple-600 hidden sm:block"><TrendingUp size={14} /></div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Ritmo Consumo</p>
                <p className="text-sm font-black text-purple-700">{Math.round(analisisSku.consumoIA ?? 0).toLocaleString()} un/mes</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600 hidden sm:block"><Ship size={14} /></div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Tabla Arrivals Real</p>
                <p className="text-sm font-black text-blue-700">{Number(analisisSku.enTránsito ?? 0).toLocaleString()} un.</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
              <div className="p-2 bg-rose-50 rounded-lg text-rose-600 hidden sm:block"><AlertTriangle size={14} /></div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Quiebre Proyectado</p>
                <p className={`text-sm font-black ${analisisSku.mesQuiebre !== "OK / ESTABLE" ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {analisisSku.mesQuiebre}
                </p>
              </div>
            </div>

            <div className="bg-slate-900 p-4 rounded-xl shadow-md flex items-center gap-3 text-white col-span-2 md:col-span-1">
              <div>
                <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Fecha Límite OC</p>
                <p className="text-xs font-black text-white">{analisisSku.fechaLimiteOCStr}</p>
                <p className="text-[9px] text-slate-400 font-medium">Sugerido: <span className="text-emerald-400 font-bold">{Math.round(analisisSku.pedidoSugerido ?? 0).toLocaleString()}</span></p>
              </div>
            </div>
          </div>

          {/* CONTENEDOR EXPANDIDO AL 100% DE LA PANTALLA */}
          <div className="bg-white p-3 sm:p-6 rounded-xl border border-slate-200 shadow-sm space-y-4 w-full">
            <div className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 uppercase tracking-wider">
                <ChartIcon size={13} className="text-purple-600" />
                <span>Simulación Dinámica de Inventarios (Eje de Carga Única por Arrivals)</span>
              </div>
            </div>

            {/* Ajuste de márgenes de Recharts para que explote a los bordes de la pantalla */}
            <div className="w-full h-[400px] text-[10px] font-bold">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analisisSku.proyeccionesPorMes} margin={{ top: 20, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorStockExpanded" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tickLine={false} stroke="#94a3b8" />
                  <YAxis tickLine={false} stroke="#94a3b8" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '6px', color: '#f8fafc' }}
                    itemStyle={{ color: '#cbd5e1', fontSize: '11px' }}
                  />
                  
                  <Area type="monotone" dataKey="stockProyectado" name="Stock en Planta" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorStockExpanded)" />
                  <Area type="monotone" dataKey="velocidadConsumo" name="Consumo Mensual" stroke="#f43f5e" strokeWidth={1} strokeDasharray="3 3" fillOpacity={0} />

                  {/* HITOS */}
                  {analisisSku.mesColocacionOcGrafico && (
                    <ReferenceLine x={analisisSku.mesColocacionOcGrafico} stroke="#f59e0b" strokeWidth={2}>
                      <Label value="EMITIR OC" position="top" fill="#d97706" fontSize={9} fontWeight="bold" />
                    </ReferenceLine>
                  )}

                  {analisisSku.mesQuiebreGrafico && (
                    <ReferenceLine x={analisisSku.mesQuiebreGrafico} stroke="#ef4444" strokeWidth={2} strokeDasharray="3 3">
                      <Label value="QUIEBRE DE STOCK" position="top" fill="#ef4444" fontSize={9} fontWeight="bold" />
                    </ReferenceLine>
                  )}

                  {/* RENDERIZADO EXCLUSIVO DEL ARRIBO DE LA TABLA ARRIVALS */}
                  {analisisSku.proyeccionesPorMes.map((p: any, idx: number) => {
                    if (p.cantidadArribo > 0) {
                      return (
                        <ReferenceLine key={idx} x={p.mes} stroke="#10b981" strokeWidth={2.5}>
                          <Label 
                            value={`INGRESO ARRIVALS: +${p.cantidadArribo.toLocaleString()} un.`} 
                            position="insideTopLeft" 
                            fill="#047857" 
                            fontSize={10} 
                            fontWeight="black" 
                          />
                        </ReferenceLine>
                      );
                    }
                    return null;
                  })}

                  <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg text-[10px] text-slate-500 font-medium">
              <CheckCircle size={12} className="text-emerald-600" />
              <span>Filtro de contingencia activado: Se eliminaron las trazas de movimientos duplicados. Solo se procesa la orden de la tabla `arrivals`.</span>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-16 text-slate-400 text-xs font-medium uppercase tracking-wider bg-white rounded-xl border border-slate-200">
          Selecciona un material para renderizar la simulación a pantalla completa.
        </div>
      )}
    </div>
  );
}