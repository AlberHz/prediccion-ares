"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Search, ShoppingCart, ArrowRight, FileSpreadsheet, LineChart as ChartIcon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Label } from "recharts";

// Variables de entorno de simulación dinámicas (Año actual 2026)
const AÑO_ACTUAL = 2026;
const MES_ACTUAL_NUM = 5; // Junio 2026 (0-indexed = 5)
const DOCUMENTOS_SALIDA = new Set(["NS", "22", "23", "93", "TD"]);
const NOMBRES_MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

const esMovimientoSalida = (m: any) => {
  const t = String(m.type || "").trim().toUpperCase();
  const c = String(m.transaction_code || "").trim().toUpperCase();
  return DOCUMENTOS_SALIDA.has(t) || DOCUMENTOS_SALIDA.has(c);
};

export default function PlanificadorAbastecimientoAres() {
  const [productos, setProductos] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const [skuSeleccionadoId, setSkuSeleccionadoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mesFiltroPlan, setMesFiltroPlan] = useState<string>("TODOS");

  useEffect(() => {
    fetchDataReal();
  }, []);

  async function fetchDataReal() {
    setLoading(true);
    try {
      const { data: dbProducts } = await supabase
        .from("products")
        .select("*")
        .eq("active", true);

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

      const movsByProduct: Record<string, any[]> = {};
      todosLosMovimientos.forEach(m => {
        if (!movsByProduct[m.product_id]) movsByProduct[m.product_id] = [];
        movsByProduct[m.product_id].push(m);
      });

      const arrivalsByProduct: Record<string, any[]> = {};
      (dbArrivals || []).forEach(a => {
        if (!arrivalsByProduct[a.product_id]) arrivalsByProduct[a.product_id] = [];
        arrivalsByProduct[a.product_id].push(a);
      });

      const datosConsolidados = (dbProducts || []).map((p: any) => {
        const productUUID = p.id;
        return {
          id: productUUID,
          code: p.code ? String(p.code).trim() : "SIN CÓDIGO",
          description: p.description ? String(p.description).trim() : "SIN DESCRIPCIÓN",
          family: p.family ? String(p.family).trim() : "GENERAL",
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
      console.error("Error base de datos:", err);
    } finally {
      setLoading(false);
    }
  }

  // --- MOTOR MRP INFINITO EXTENDIDO (PROYECTA 24 MESES EN ADELANTE) ---
  const analisisAbastecimiento = useMemo(() => {
    const planMaestroRecomendaciones: any[] = [];
    const curvasPorProducto: Record<string, any[]> = {};
    const alertasGrafico: Record<string, any[]> = {};

    productos.forEach((item) => {
      const stockFisicoActual = Number(item.stockFisicoActual || 0);
      const leadTimeDias = parseInt(item.lead_time) || 0;
      const mesesLeadTime = Math.max(1, Math.ceil(leadTimeDias / 30));

      const todasLasSalidas = item.movimientos.filter(esMovimientoSalida);
      const unidadesTotalesSalida = todasLasSalidas.reduce((sum: number, curr: any) => sum + Math.abs(Number(curr.quantity || 0)), 0);
      const mesesConActividad = new Set(todasLasSalidas.map((m: any) => {
        const f = m.date ? new Date(m.date) : new Date(m.created_at);
        return `${f.getFullYear()}-${f.getMonth()}`;
      })).size || 1;
      
      let promedioConsumo = unidadesTotalesSalida / mesesConActividad;
      if (promedioConsumo === 0 && stockFisicoActual === 0) promedioConsumo = 1;

      // Agrupar salidas del año corriente
      const salidasPorMesAñoActual: Record<number, number> = {};
      item.movimientos.forEach((mvs: any) => {
        const fecha = new Date(mvs.date || mvs.created_at);
        if (fecha.getFullYear() === AÑO_ACTUAL && esMovimientoSalida(mvs)) {
          const mes = fecha.getMonth();
          salidasPorMesAñoActual[mes] = (salidasPorMesAñoActual[mes] || 0) + Math.abs(Number(mvs.quantity || 0));
        }
      });

      // Histórico para la gráfica
      const datosCronologicosGrafico: any[] = [];
      let stockIterativoPasado = stockFisicoActual;
      for (let m = MES_ACTUAL_NUM - 1; m >= 0; m--) {
        const salidasReales = salidasPorMesAñoActual[m] || 0;
        stockIterativoPasado += salidasReales;
        datosCronologicosGrafico.unshift({ 
          mes: `${NOMBRES_MESES[m]} 26`, 
          stockProyectado: Math.max(0, stockIterativoPasado), 
          velocidadConsumo: salidasReales, 
          cantidadArribo: 0,
          tipo: "REAL" 
        });
      }

      // Arribos de OC vigentes documentados en BD
      const arribosRealesPorMes: Record<number, number> = {};
      item.arribos.forEach((a: any) => {
        const f = a.eta_date ? new Date(a.eta_date) : null;
        if (f && f.getFullYear() === AÑO_ACTUAL) {
          const mes = f.getMonth();
          arribosRealesPorMes[mes] = (arribosRealesPorMes[mes] || 0) + Number(a.quantity || 0);
        }
      });

      // Simulación de línea de tiempo extendida (24 meses: Año 2026 y Año 2027 completo)
      let inventarioCorriente = stockFisicoActual;
      const listaOrdenesGatilladas: any[] = [];
      let contadorOC = 0;
      const loteSugeridoEstandar = Math.round((promedioConsumo * mesesLeadTime) + (promedioConsumo * 1.0)) || 100;

      for (let t = 0; t < 24; t++) {
        // Mapeo absoluto de la línea temporal
        const indiceMesAbsoluto = (MES_ACTUAL_NUM + t) % 12;
        const añoSimulado = AÑO_ACTUAL + Math.floor((MES_ACTUAL_NUM + t) / 12);
        const sufijoAño = añoSimulado === 2026 ? "26" : "27";
        const etiquetaMesAnual = `${NOMBRES_MESES[indiceMesAbsoluto]} ${sufijoAño}`;

        // 1. Inyectar arribos de la base de datos (solo aplican a meses del 2026)
        if (añoSimulado === 2026) {
          inventarioCorriente += (arribosRealesPorMes[indiceMesAbsoluto] || 0);
        }

        // 2. Inyectar arribos de OCs sugeridas en iteraciones previas
        const ingresosDeOcSimuladas = listaOrdenesGatilladas
          .filter(o => o.mesAbsolutoArribo === t)
          .reduce((sum, curr) => sum + curr.cantidadAComprar, 0);
        
        inventarioCorriente += ingresosDeOcSimuladas;

        // 3. Descontar demanda del periodo
        const consumoEsteMes = (añoSimulado === 2026 && indiceMesAbsoluto === MES_ACTUAL_NUM && salidasPorMesAñoActual[MES_ACTUAL_NUM] > 0)
          ? salidasPorMesAñoActual[MES_ACTUAL_NUM]
          : promedioConsumo;

        inventarioCorriente -= consumoEsteMes;

        // 4. VERIFICACIÓN DE QUIEBRE CONTINUO
        if (inventarioCorriente <= 0) {
          contadorOC++;
          
          // Lógica inversa: Quiebre [t] - Lead Time meses - 1 mes de colchón prudencial
          const mesAbsolutoLanzamiento = t - mesesLeadTime - 1;

          let etiquetaLanzamiento = "";
          let estadoAccion = "PLANIFICADO";
          let mesLanzamientoFiltro = "VER TODO";

          if (mesAbsolutoLanzamiento <= 0) {
            // Si el cálculo da negativo o cero, significa que la OC se debió poner HOY o en el pasado inmediato
            etiquetaLanzamiento = `${NOMBRES_MESES[MES_ACTUAL_NUM]} 26`;
            estadoAccion = "URGENTE";
            mesLanzamientoFiltro = NOMBRES_MESES[MES_ACTUAL_NUM];
          } else {
            const idxLanzamiento = (MES_ACTUAL_NUM + mesAbsolutoLanzamiento) % 12;
            const añoLanzamiento = AÑO_ACTUAL + Math.floor((MES_ACTUAL_NUM + mesAbsolutoLanzamiento) / 12);
            etiquetaLanzamiento = `${NOMBRES_MESES[idxLanzamiento]} ${añoLanzamiento === 2026 ? '26' : '27'}`;
            estadoAccion = añoLanzamiento === 2026 ? "PLANIFICADO" : "FUTURO";
            mesLanzamientoFiltro = añoLanzamiento === 2026 ? NOMBRES_MESES[idxLanzamiento] : "FUTURO";
          }

          const nuevaRecomendacion = {
            id: `${item.id}-oc-${contadorOC}`,
            product_uuid: item.id,
            code: item.code,
            description: item.description,
            numeroOrden: contadorOC,
            mesQuiebreTexto: etiquetaMesAnual,
            mesLanzamientoTexto: etiquetaLanzamiento,
            mesLanzamientoFiltro,
            mesAbsolutoArribo: t, // Se estabiliza el stock en este mes exacto
            cantidadAComprar: loteSugeridoEstandar,
            leadTimeDias,
            estadoAccion,
            consumoMensual: Math.round(promedioConsumo)
          };

          listaOrdenesGatilladas.push(nuevaRecomendacion);
          
          // Solo registramos alertas en el panel si la decisión de compra se debe tomar dentro del año 2026
          if (etiquetaLanzamiento.includes("26")) {
            planMaestroRecomendaciones.push(nuevaRecomendacion);
          }

          // Reposición inmediata del stock simulado para continuar el análisis de la cadena
          inventarioCorriente += loteSugeridoEstandar;
        }

        // Almacenar solo la porción visible de la gráfica (para no saturar visualmente)
        if (t < 14) {
          datosCronologicosGrafico.push({
            mes: etiquetaMesAnual,
            stockProyectado: Math.round(inventarioCorriente),
            velocidadConsumo: Math.round(consumoEsteMes),
            cantidadArribo: añoSimulado === 2026 ? (arribosRealesPorMes[indiceMesAbsoluto] || 0) : 0,
            cantidadIngresoSimulado: listaOrdenesGatilladas.filter(o => o.mesAbsolutoArribo === t).reduce((sum, c) => sum + c.cantidadAComprar, 0),
            tipo: "PROYECCION"
          });
        }
      }

      if (listaOrdenesGatilladas.filter(o => o.mesLanzamientoTexto.includes("26")).length === 0) {
        planMaestroRecomendaciones.push({
          id: `${item.id}-ok`,
          product_uuid: item.id,
          code: item.code,
          description: item.description,
          numeroOrden: 0,
          mesQuiebreTexto: "SIN QUIEBRE 2026",
          mesLanzamientoTexto: "AL DÍA",
          mesLanzamientoFiltro: "AL DÍA",
          cantidadAComprar: 0,
          leadTimeDias,
          estadoAccion: "OPTIMO",
          consumoMensual: Math.round(promedioConsumo)
        });
      }

      curvasPorProducto[item.id] = datosCronologicosGrafico;
      alertasGrafico[item.id] = listaOrdenesGatilladas;
    });

    return { planMaestroRecomendaciones, curvasPorProducto, alertasGrafico };
  }, [productos]);

  const ordenesFiltradas = useMemo(() => {
    const recomendaciones = analisisAbastecimiento.planMaestroRecomendaciones;
    if (mesFiltroPlan === "TODOS") {
      return [...recomendaciones].sort((a, b) => (a.estadoAccion === "URGENTE" ? -1 : 1));
    }
    return recomendaciones.filter(p => p.mesLanzamientoFiltro === mesFiltroPlan);
  }, [analisisAbastecimiento, mesFiltroPlan]);

  const contadoresPorMes = useMemo(() => {
    const conteos: Record<string, number> = {};
    NOMBRES_MESES.forEach(m => { conteos[m] = 0; });
    analisisAbastecimiento.planMaestroRecomendaciones.forEach(p => {
      if (p.cantidadAComprar > 0 && conteos[p.mesLanzamientoFiltro] !== undefined) {
        conteos[p.mesLanzamientoFiltro]++;
      }
    });
    return conteos;
  }, [analisisAbastecimiento]);

  const analisisSku = useMemo(() => {
    if (!skuSeleccionadoId) return null;
    const item = productos.find(p => p.id === skuSeleccionadoId);
    if (!item) return null;

    return {
      ...item,
      alertasMaturacion: analisisAbastecimiento.alertasGrafico[skuSeleccionadoId] || [],
      proyeccionesPorMes: analisisAbastecimiento.curvasPorProducto[skuSeleccionadoId] || []
    };
  }, [productos, skuSeleccionadoId, analisisAbastecimiento]);

  if (loading) return (
    <div className="min-h-[50vh] flex items-center justify-center bg-[#f8fafc]">
      <div className="text-center space-y-2">
        <div className="w-9 h-9 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Desplegando Cadena de Suministros Recursiva...</p>
      </div>
    </div>
  );

  return (
    <div className="bg-[#f8fafc] p-3 space-y-4 w-full text-slate-800 font-sans antialiased">
      
      {/* SECCIÓN PLAN MAESTRO REDISEÑADA Y COMPACTA */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-black text-slate-900 uppercase tracking-wider">
              <ShoppingCart className="text-purple-600" size={14} />
              <span>Sugerencias de Compra de Ventana Continua (2026 - 2027)</span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium uppercase">Detecta quiebres tempranos del próximo año y calcula la OC con antelación en los meses de este año.</p>
          </div>
        </div>

        {/* selectores mensuales compactos */}
        <div className="flex flex-wrap gap-1 bg-slate-50 p-1 rounded-lg text-[9px] font-bold w-fit border border-slate-200">
          <button 
            onClick={() => setMesFiltroPlan("TODOS")}
            className={`px-2 py-1 rounded transition-all ${mesFiltroPlan === "TODOS" ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
          >
            TODO ({analisisAbastecimiento.planMaestroRecomendaciones.filter(o => o.cantidadAComprar > 0).length})
          </button>
          {NOMBRES_MESES.slice(5).map((m) => {
            const totalAlertasEnMes = contadoresPorMes[m] || 0;
            return (
              <button
                key={m}
                onClick={() => setMesFiltroPlan(m)}
                className={`px-2 py-1 rounded transition-all flex items-center gap-1 ${mesFiltroPlan === m ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
              >
                <span>{m}</span>
                {totalAlertasEnMes > 0 && (
                  <span className="px-1 bg-rose-500 text-white rounded-full text-[8px] font-black">{totalAlertasEnMes}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* TABLA CON SCROLL INTERNO (EVITA BAJAR INFINITAMENTE) */}
        <div className="max-h-[280px] overflow-y-auto border border-slate-200 rounded-lg shadow-inner bg-slate-50">
          <table className="w-full text-left border-collapse text-[10px] bg-white">
            <thead className="sticky top-0 bg-slate-100 z-10 shadow-sm">
              <tr className="text-slate-400 uppercase tracking-wider font-black text-[9px] border-b border-slate-200">
                <th className="p-2.5">Estatus / Emitir OC</th>
                <th className="p-2.5">Índice</th>
                <th className="p-2.5">SKU</th>
                <th className="p-2.5">Descripción del Material</th>
                <th className="p-2.5 text-center">Lead Time</th>
                <th className="p-2.5 text-center">Consumo Promedio</th>
                <th className="p-2.5 text-center">Mes de Quiebre</th>
                <th className="p-2.5 text-right text-purple-700 font-black">Lote Sugerido</th>
                <th className="p-2.5 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
              {ordenesFiltradas.map((item, idx: number) => (
                <tr key={`${item.id}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-2.5">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${
                      item.estadoAccion === 'URGENTE' ? 'bg-rose-50 text-rose-700 border-rose-200' : 
                      item.estadoAccion === 'PLANIFICADO' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                      'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {item.mesLanzamientoTexto}
                    </span>
                  </td>
                  <td className="p-2.5 text-slate-400 font-bold">{item.numeroOrden > 0 ? `OC #${item.numeroOrden}` : "—"}</td>
                  <td className="p-2.5 font-bold text-slate-900">{item.code}</td>
                  <td className="p-2.5 uppercase max-w-[220px] truncate text-slate-500 font-medium">{item.description}</td>
                  <td className="p-2.5 text-center text-slate-600">{item.leadTimeDias} d</td>
                  <td className="p-2.5 text-center text-slate-600">{item.consumoMensual.toLocaleString()} un</td>
                  <td className="p-2.5 text-center">
                    <span className={`font-bold ${item.cantidadAComprar === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {item.mesQuiebreTexto}
                    </span>
                  </td>
                  <td className="p-2.5 text-right font-black text-slate-900">{item.cantidadAComprar > 0 ? `${item.cantidadAComprar.toLocaleString()} un.` : "—"}</td>
                  <td className="p-2.5 text-center">
                    <button 
                      onClick={() => {
                        setSkuSeleccionadoId(item.product_uuid);
                        setBusqueda(`[${item.code}] ${item.description}`);
                        setMostrarDropdown(false);
                      }}
                      className="text-purple-600 hover:text-purple-900 font-bold underline flex items-center justify-center gap-0.5 mx-auto"
                    >
                      Ver Curva <ArrowRight size={10} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECCIÓN DEL GRÁFICO COMPACTO */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 relative">
          <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider block mb-1">Buscador Predictivo de SKU</label>
          <input
            type="text"
            className="w-full px-3 py-1 bg-white border border-slate-200 rounded-md text-[10px] font-semibold text-slate-900 outline-none focus:border-purple-600"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setMostrarDropdown(true); }}
            onFocus={() => setMostrarDropdown(true)}
            placeholder="Escribe el código o nombre del material..."
          />

          {mostrarDropdown && productos.length > 0 && (
            <div className="absolute z-50 w-full left-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-[140px] overflow-y-auto text-[10px]">
              {productos.filter(p => p.code.toLowerCase().includes(busqueda.toLowerCase()) || p.description.toLowerCase().includes(busqueda.toLowerCase())).map((p) => (
                <div
                  key={p.id}
                  className="p-2 hover:bg-slate-50 border-b border-slate-100 cursor-pointer flex justify-between items-center"
                  onClick={() => { setSkuSeleccionadoId(p.id); setBusqueda(`[${p.code}] ${p.description}`); setMostrarDropdown(false); }}
                >
                  <div>
                    <span className="font-bold text-slate-900">SKU: {p.code}</span>
                    <p className="text-[9px] text-slate-400 uppercase truncate max-w-[500px]">{p.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {analisisSku && (
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 text-[10px]">
              <div className="flex items-center gap-1 font-black text-slate-900 uppercase">
                <ChartIcon size={12} className="text-purple-600" />
                <span>Curva de Reabastecimiento Secuencial: {analisisSku.code}</span>
              </div>
              <div className="font-bold text-slate-400 uppercase">
                Stock Inicial: <span className="text-slate-900 font-black">{analisisSku.stockFisicoActual} un.</span>
              </div>
            </div>

            <div className="w-full h-[240px] text-[9px] font-bold">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analisisSku.proyeccionesPorMes} margin={{ top: 20, right: 10, left: -30, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorStockPlan" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tickLine={false} stroke="#94a3b8" />
                  <YAxis tickLine={false} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '4px', color: '#f8fafc', fontSize: '10px' }} />
                  
                  <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
                  <Area type="monotone" dataKey="stockProyectado" name="Stock Simulado" stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#colorStockPlan)" />

                  {/* HITOS DE EMISIÓN DE COMPRA DENTRO DE LA LÍNEA DEL TIEMPO */}
                  {analisisSku.alertasMaturacion.map((o: any, idx: number) => (
                    <ReferenceLine key={`lanzar-oc-${idx}`} x={o.mesLanzamientoTexto} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 3">
                      <Label value={`EMITIR OC #${o.numeroOrden}`} position="top" fill="#d97706" fontSize={8} fontWeight="black" />
                    </ReferenceLine>
                  ))}

                  {/* IMPACTO DE INGRESOS (Confirmados + Simulados de la cadena continua) */}
                  {analisisSku.proyeccionesPorMes.map((p: any, idx: number) => {
                    const totalIngreso = (p.cantidadArribo || 0) + (p.cantidadIngresoSimulado || 0);
                    if (totalIngreso > 0) {
                      return (
                        <ReferenceLine key={`ingreso-cont-${idx}`} x={p.mes} stroke="#10b981" strokeWidth={1.2}>
                          <Label value={`+${totalIngreso.toLocaleString()} UN`} position="insideTopLeft" fill="#047857" fontSize={7} fontWeight="black" />
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