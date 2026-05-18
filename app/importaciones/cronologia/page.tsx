"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Search, ShoppingCart, ArrowRight, FileSpreadsheet, LineChart as ChartIcon } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Label } from "recharts";

export default function PlanificadorAbastecimientoAres() {
  const [productos, setProductos] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const [skuSeleccionadoId, setSkuSeleccionadoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mesFiltroPlan, setMesFiltroPlan] = useState<string>("TODOS");

  const AÑO_ACTUAL = 2026;
  const MES_ACTUAL_NUM = 4; // Mayo (0-indexed)
  const DOCUMENTOS_SALIDA = ["NS", "22", "23", "93", "TD"];
  const NOMBRES_MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

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
      console.error("Error Ares Engine:", err);
    } finally {
      setLoading(false);
    }
  }

  // --- SIMULADOR MAESTRO MRP RECURRENTE PURIFICADO ---
  const mapeoCompletoProductos = useMemo(() => {
    const ordenesGlobales: any[] = [];
    const curvasPorProducto: Record<string, any[]> = {};
    const detalleOrdenesGrafico: Record<string, any[]> = {};

    productos.forEach((item) => {
      const stockFisicoActual = Number(item.stockFisicoActual || 0);
      const leadTimeDias = parseInt(item.lead_time) || 0;
      const mesesLeadTime = Math.max(1, Math.ceil(leadTimeDias / 30));

      const todasLasSalidas = item.movimientos.filter((m: any) => {
        const t = String(m.type || "").trim().toUpperCase();
        const c = String(m.transaction_code || "").trim().toUpperCase();
        return DOCUMENTOS_SALIDA.includes(t) || DOCUMENTOS_SALIDA.includes(c);
      });
      
      const unidadesTotalesSalida = todasLasSalidas.reduce((sum: number, curr: any) => sum + Math.abs(Number(curr.quantity || 0)), 0);
      const mesesConActividad = new Set(todasLasSalidas.map((m: any) => {
        const f = m.date ? new Date(m.date) : new Date(m.created_at);
        return `${f.getFullYear()}-${f.getMonth()}`;
      })).size || 1;
      
      let promedioConsumo = unidadesTotalesSalida / mesesConActividad;
      if (promedioConsumo === 0 && stockFisicoActual === 0) {
        promedioConsumo = 1; // Mínimo preventivo para activar simulación de catálogos sin stock
      }

      // Reconstrucción del Histórico Real Pasado
      const datosHistoricos: any[] = [];
      let stockIterativoPasado = stockFisicoActual;
      for (let m = MES_ACTUAL_NUM - 1; m >= 0; m--) {
        const movsMes = item.movimientos.filter((mvs: any) => new Date(mvs.date || mvs.created_at).getMonth() === m && new Date(mvs.date || mvs.created_at).getFullYear() === AÑO_ACTUAL);
        const salidasReales = movsMes.filter((mvs: any) => DOCUMENTOS_SALIDA.includes(String(mvs.type || "").trim().toUpperCase()) || DOCUMENTOS_SALIDA.includes(String(mvs.transaction_code || "").trim().toUpperCase())).reduce((sum: number, curr: any) => sum + Math.abs(Number(curr.quantity || 0)), 0);
        stockIterativoPasado += salidasReales;
        datosHistoricos.unshift({ 
          mes: `${NOMBRES_MESES[m]} 26`, 
          stockProyectado: Math.max(0, stockIterativoPasado), 
          velocidadConsumo: salidasReales, 
          cantidadArribo: 0,
          tipo: "REAL" 
        });
      }

      // Proyección Futura Secuencial Pura (Bucle de Simulación sin acumulación restrictiva)
      let inventarioCorriente = stockFisicoActual;
      const proyeccionesFuturas: any[] = [];
      const listaOrdenesGatilladas: any[] = [];
      
      let contadorOrdenesSecuencial = 0;

      for (let m = MES_ACTUAL_NUM; m <= 11; m++) {
        // Filtrar arribos físicos de Supabase para este mes
        const arribosTabla = item.arribos.filter((a: any) => {
          const f = a.eta_date ? new Date(a.eta_date) : null;
          return f && f.getMonth() === m && f.getFullYear() === AÑO_ACTUAL;
        });
        const totalArribosReales = arribosTabla.reduce((sum: number, curr: any) => sum + Number(curr.quantity || 0), 0);
        
        // Sumar ingresos simulados que vencen y llegan JUSTO EN ESTE MES 'm'
        const transitosQueLleganEsteMes = listaOrdenesGatilladas
          .filter(o => o.mesArriboSimuladoNum === m)
          .reduce((sum, curr) => sum + curr.cantidad, 0);

        inventarioCorriente = inventarioCorriente + totalArribosReales + transitosQueLleganEsteMes;

        const consumoEsteMes = m === MES_ACTUAL_NUM && item.movimientos.filter((mvs: any) => new Date(mvs.date || mvs.created_at).getMonth() === MES_ACTUAL_NUM).length > 0 
          ? item.movimientos.filter((mvs: any) => new Date(mvs.date || mvs.created_at).getMonth() === MES_ACTUAL_NUM).reduce((sum: number, curr: any) => sum + Math.abs(Number(curr.quantity || 0)), 0)
          : promedioConsumo;

        inventarioCorriente = inventarioCorriente - consumoEsteMes;

        // EVALUACIÓN CRÍTICA DE QUIEBRE DEL MES CORRIENTE
        if (inventarioCorriente <= 0) {
          contadorOrdenesSecuencial++;
          
          // Lote sugerido estándar: Cubre el horizonte de reposición del Lead Time + Margen de seguridad
          const loteSugerido = Math.round((promedioConsumo * mesesLeadTime) + (promedioConsumo * 0.5)) || 50;
          
          // Fecha de compra teórica calculada con Ingeniería Inversa
          let mesLanzamientoNum = m - mesesLeadTime;
          if (mesLanzamientoNum < MES_ACTUAL_NUM) mesLanzamientoNum = MES_ACTUAL_NUM; // Alerta hoy por quiebre inmediato o LT largo

          const mesLanzamientoTexto = `${NOMBRES_MESES[mesLanzamientoNum]} 26`;
          const mesQuiebreTexto = `${NOMBRES_MESES[m]} 26`;

          const nuevaOrden = {
            id: `${item.id}-oc-${contadorOrdenesSecuencial}`,
            product_uuid: item.id,
            code: item.code,
            description: item.description,
            numeroOrden: contadorOrdenesSecuencial,
            mesLanzamientoNum,
            mesLanzamientoTexto,
            mesQuiebreTexto,
            mesArriboSimuladoNum: m, // Guardamos cuándo impactará físicamente este stock en el bucle
            cantidadAComprar: loteSugerido,
            leadTimeDias,
            stockActual: stockFisicoActual,
            consumoMensual: Math.round(promedioConsumo)
          };

          listaOrdenesGatilladas.push(nuevaOrden);
          ordenesGlobales.push(nuevaOrden);

          // Inyectamos el lote simulado inmediatamente para que reestablezca la curva a partir de este punto
          inventarioCorriente = inventarioCorriente + loteSugerido;
        }

        proyeccionesFuturas.push({
          mes: `${NOMBRES_MESES[m]} 26`,
          stockProyectado: Math.round(Math.max(0, inventarioCorriente)),
          velocidadConsumo: Math.round(consumoEsteMes),
          cantidadArribo: totalArribosReales + (listaOrdenesGatilladas.filter(o => o.mesArriboSimuladoNum === m).reduce((sum, c) => sum + c.cantidad, 0)),
          tipo: m === MES_ACTUAL_NUM ? "MES_ACTUAL" : "PROYECCION"
        });
      }

      // Si el producto no rompió stock, se genera un registro base para mantener la integridad en búsquedas
      if (listaOrdenesGatilladas.length === 0) {
        ordenesGlobales.push({
          id: `${item.id}-ok`,
          product_uuid: item.id,
          code: item.code,
          description: item.description,
          numeroOrden: 0,
          mesLanzamientoNum: 12,
          mesLanzamientoTexto: "OK",
          mesQuiebreTexto: "SIN QUIEBRE",
          cantidadAComprar: 0,
          leadTimeDias,
          stockActual: stockFisicoActual,
          consumoMensual: Math.round(promedioConsumo)
        });
      }

      curvasPorProducto[item.id] = [...datosHistoricos, ...proyeccionesFuturas];
      detalleOrdenesGrafico[item.id] = listaOrdenesGatilladas;
    });

    return { ordenesGlobales, curvasPorProducto, detalleOrdenesGrafico };
  }, [productos]);

  const ordenesFiltradas = useMemo(() => {
    const ordenes = mapeoCompletoProductos.ordenesGlobales;
    if (mesFiltroPlan === "TODOS") {
      return ordenes.sort((a, b) => a.mesLanzamientoNum - b.mesLanzamientoNum);
    }
    return ordenes.filter(p => p.mesLanzamientoTexto === `${mesFiltroPlan} 26`);
  }, [mapeoCompletoProductos, mesFiltroPlan]);

  const contadoresPorMes = useMemo(() => {
    const conteos: Record<string, number> = {};
    NOMBRES_MESES.forEach(m => { conteos[`${m} 26`] = 0; });
    mapeoCompletoProductos.ordenesGlobales.forEach(p => {
      if (p.cantidadAComprar > 0 && conteos[p.mesLanzamientoTexto] !== undefined) {
        conteos[p.mesLanzamientoTexto]++;
      }
    });
    return conteos;
  }, [mapeoCompletoProductos]);

  const analisisSku = useMemo(() => {
    if (!skuSeleccionadoId) return null;
    const item = productos.find(p => p.id === skuSeleccionadoId);
    if (!item) return null;

    return {
      ...item,
      ordenesSecuenciales: mapeoCompletoProductos.detalleOrdenesGrafico[skuSeleccionadoId] || [],
      proyeccionesPorMes: mapeoCompletoProductos.curvasPorProducto[skuSeleccionadoId] || []
    };
  }, [productos, skuSeleccionadoId, mapeoCompletoProductos]);

  const exportarPlanAbastecimiento = () => {
    const headers = ["Orden Correlativa", "Mes Lanzamiento OC", "SKU", "Descripcion", "Lead Time", "Consumo Promedio", "Mes Quiebre", "Cantidad a Pedir"];
    const rows = mapeoCompletoProductos.ordenesGlobales.filter(o => o.cantidadAComprar > 0).map(o => [
      `OC #${o.numeroOrden}`,
      o.mesLanzamientoTexto,
      o.code,
      o.description.replace(/,/g, " "), 
      o.leadTimeDias,
      o.consumoMensual,
      o.mesQuiebreTexto,
      o.cantidadAComprar
    ]);

    const contenidoCsv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([contenidoCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Plan_Maestro_Secuencial_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return (
    <div className="min-h-[50vh] flex items-center justify-center bg-[#f8fafc]">
      <div className="text-center space-y-2">
        <div className="w-9 h-9 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Simulando cadena de suministros continua...</p>
      </div>
    </div>
  );

  return (
    <div className="bg-[#f8fafc] p-2 sm:p-5 space-y-8 w-full text-slate-800 font-sans">
      
      {/* SECCIÓN PRINCIPAL PLAN MAESTRO */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-slate-100 pb-4 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-black text-slate-900 uppercase tracking-wider">
              <ShoppingCart className="text-purple-600" size={16} />
              <span>Plan Maestro de Compras: Flujo de Simulación Continua</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium uppercase">Cada quiebre genera una orden independiente alineada con el impacto real en el stock.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportarPlanAbastecimiento}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase px-4 py-2 rounded-xl shadow-sm transition-all tracking-wider"
            >
              <FileSpreadsheet size={14} />
              <span>Exportar Todo a CSV</span>
            </button>
          </div>
        </div>

        {/* selectores mensuales */}
        <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl text-[10px] font-bold w-fit">
          <button 
            onClick={() => setMesFiltroPlan("TODOS")}
            className={`px-3 py-1.5 rounded-lg transition-all ${mesFiltroPlan === "TODOS" ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
          >
            VER TODO EL PLAN ({ordenesFiltradas.filter(o => o.cantidadAComprar > 0).length})
          </button>
          {NOMBRES_MESES.slice(4).map((m) => {
            const labelMes = `${m} 26`;
            const totalOrdenesEnMes = contadoresPorMes[labelMes] || 0;
            return (
              <button
                key={m}
                onClick={() => setMesFiltroPlan(m)}
                className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 ${mesFiltroPlan === m ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
              >
                <span>{m}</span>
                {totalOrdenesEnMes > 0 && (
                  <span className="px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[9px] font-black">
                    {totalOrdenesEnMes}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* TABLA MRP */}
        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-50 text-slate-400 uppercase tracking-wider font-black text-[9px] border-b border-slate-200">
                <th className="p-3">Estatus / Lanzar OC</th>
                <th className="p-3">Índice</th>
                <th className="p-3">SKU</th>
                <th className="p-3">Descripción de Material</th>
                <th className="p-3 text-center">Lead Time</th>
                <th className="p-3 text-center">Consumo Mensual</th>
                <th className="p-3 text-center">Mes del Quiebre</th>
                <th className="p-3 text-right text-purple-700 font-black">Lote Sugerido</th>
                <th className="p-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold">
              {ordenesFiltradas.map((item, idx: number) => (
                <tr key={`${item.id}-${idx}`} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded font-black text-[10px] ${item.cantidadAComprar === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 border border-amber-300 text-amber-800'}`}>
                      {item.mesLanzamientoTexto}
                    </span>
                  </td>
                  <td className="p-3 text-slate-400 font-bold">
                    {item.cantidadAComprar > 0 ? `OC #${item.numeroOrden}` : "—"}
                  </td>
                  <td className="p-3 font-bold text-slate-900">{item.code}</td>
                  <td className="p-3 uppercase max-w-[260px] truncate text-slate-500 font-medium">{item.description}</td>
                  <td className="p-3 text-center text-slate-600">{item.leadTimeDias} d</td>
                  <td className="p-3 text-center text-slate-600">{item.consumoMensual.toLocaleString()} un</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${item.cantidadAComprar === 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      {item.mesQuiebreTexto}
                    </span>
                  </td>
                  <td className="p-3 text-right font-black text-slate-900 text-xs">
                    {item.cantidadAComprar > 0 ? `${item.cantidadAComprar.toLocaleString()} un.` : "0 un."}
                  </td>
                  <td className="p-3 text-center">
                    <button 
                      onClick={() => {
                        setSkuSeleccionadoId(item.product_uuid);
                        setBusqueda(`[${item.code}] ${item.description}`);
                      }}
                      className="text-purple-600 hover:text-purple-900 font-bold underline flex items-center justify-center gap-1 mx-auto"
                    >
                      Ver Curva <ArrowRight size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECCIÓN DEL GRÁFICO RECHARTS MEJORADO */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 relative">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">
            Buscador Predictivo de Curva
          </label>
          <div className="relative">
            <input
              type="text"
              className="w-full pl-3 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-900 outline-none focus:border-purple-600 transition-all"
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setMostrarDropdown(true); }}
              onFocus={() => setMostrarDropdown(true)}
              placeholder="Buscar SKU..."
            />
          </div>

          {mostrarDropdown && productos.length > 0 && (
            <div className="absolute z-50 w-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-[180px] overflow-y-auto text-[11px]">
              {productos.filter(p => p.code.toLowerCase().includes(busqueda.toLowerCase()) || p.description.toLowerCase().includes(busqueda.toLowerCase())).map((p) => (
                <div
                  key={p.id}
                  className="p-2.5 hover:bg-slate-50 border-b border-slate-100 cursor-pointer flex justify-between items-center"
                  onClick={() => { setSkuSeleccionadoId(p.id); setBusqueda(`[${p.code}] ${p.description}`); setMostrarDropdown(false); }}
                >
                  <div>
                    <span className="font-bold text-slate-900">SKU: {p.code}</span>
                    <p className="text-[10px] text-slate-400 uppercase truncate max-w-[600px]">{p.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {analisisSku && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 uppercase tracking-wider">
                <ChartIcon size={14} className="text-purple-600" />
                <span>Simulación de Inventario Dinámico: {analisisSku.code}</span>
              </div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">
                Stock Físico Inicial: <span className="text-slate-900 font-black">{analisisSku.stockFisicoActual} un.</span>
              </div>
            </div>

            <div className="w-full h-[360px] text-[10px] font-bold">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analisisSku.proyeccionesPorMes} margin={{ top: 25, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorStockPlan" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tickLine={false} stroke="#94a3b8" />
                  <YAxis tickLine={false} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '6px', color: '#f8fafc' }} />
                  
                  <Area type="monotone" dataKey="stockProyectado" name="Stock Proyectado" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorStockPlan)" />
                  <Area type="monotone" dataKey="velocidadConsumo" name="Consumo Estimado" stroke="#f43f5e" strokeWidth={1} strokeDasharray="3 3" fillOpacity={0} />

                  {/* LÍNEAS VERTICALES DINÁMICAS PARA TODAS LAS ORDENES DETECTADAS */}
                  {analisisSku.ordenesSecuenciales.map((o: any, idx: number) => (
                    <ReferenceLine key={`oc-ref-${idx}`} x={o.mesLanzamientoTexto} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 4">
                      <Label 
                        value={`EMITIR OC #${o.numeroOrden} (Quiebra en ${o.mesQuiebreTexto})`} 
                        position="top" 
                        fill="#d97706" 
                        fontSize={8} 
                        fontWeight="black" 
                      />
                    </ReferenceLine>
                  ))}

                  {/* MENCIÓN DE ARRIBOS REALES Y VIRTUALES CUANDO INGRESAN AL STOCK */}
                  {analisisSku.proyeccionesPorMes.map((p: any, idx: number) => {
                    if (p.cantidadArribo > 0) {
                      return (
                        <ReferenceLine key={`arr-ref-${idx}`} x={p.mes} stroke="#10b981" strokeWidth={1.5}>
                          <Label value={`+${p.cantidadArribo.toLocaleString()} UN (INGRESO)`} position="insideTopLeft" fill="#047857" fontSize={8} fontWeight="bold" />
                        </ReferenceLine>
                      );
                    }
                    return null;
                  })}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}