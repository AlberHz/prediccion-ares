"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Search, ShoppingCart, ArrowRight, FileSpreadsheet, LineChart as ChartIcon, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Label } from "recharts";

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
  const [filtroCriticidad, setFiltroCriticidad] = useState<string>("TODOS");

  useEffect(() => {
    fetchDataReal();
  }, []);

  async function fetchDataReal() {
    setLoading(true);
    try {
      const { data: dbProducts } = await supabase
        .from("products")
        .select("id, code, description, family, lead_time, stock, custom_average_consumption, active")
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
          custom_average_consumption: parseInt(p.custom_average_consumption) || 0,
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

  // --- EXPLOSIÓN DE REQUERIMIENTOS (MRP LÍNEA POR OC) ---
  const analisisAbastecimiento = useMemo(() => {
    const listadoMaestroOCs: any[] = [];
    const curvasPorProducto: Record<string, any[]> = {};

    productos.forEach((item) => {
      const stockFisicoActual = Number(item.stockFisicoActual || 0);
      const leadTimeDias = parseInt(item.lead_time) || 0;
      const mesesLeadTime = Math.max(1, Math.ceil(leadTimeDias / 30));

      let promedioConsumo = 0;
      if (item.custom_average_consumption > 0) {
        promedioConsumo = item.custom_average_consumption;
      } else {
        const todasLasSalidas = item.movimientos.filter(esMovimientoSalida);
        const unidadesTotalesSalida = todasLasSalidas.reduce((sum: number, curr: any) => sum + Math.abs(Number(curr.quantity || 0)), 0);
        const mesesConActividad = new Set(todasLasSalidas.map((m: any) => {
          const f = m.date ? new Date(m.date) : new Date(m.created_at);
          return `${f.getFullYear()}-${f.getMonth()}`;
        })).size || 1;
        promedioConsumo = unidadesTotalesSalida / mesesConActividad;
      }

      // Reconstrucción del pasado para gráficos
      const salidasPorMesAñoActual: Record<number, number> = {};
      item.movimientos.forEach((mvs: any) => {
        const fecha = new Date(mvs.date || mvs.created_at);
        if (fecha.getFullYear() === AÑO_ACTUAL && esMovimientoSalida(mvs)) {
          const mes = fecha.getMonth();
          salidasPorMesAñoActual[mes] = (salidasPorMesAñoActual[mes] || 0) + Math.abs(Number(mvs.quantity || 0));
        }
      });

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

      const arribosRealesPorMes: Record<number, number> = {};
      item.arribos.forEach((a: any) => {
        const f = a.eta_date ? new Date(a.eta_date) : null;
        if (f && f.getFullYear() === AÑO_ACTUAL) {
          const mes = f.getMonth();
          arribosRealesPorMes[mes] = (arribosRealesPorMes[mes] || 0) + Number(a.quantity || 0);
        }
      });

      // Simulación de línea de tiempo hacia el futuro (24 meses de ventana rodante)
      let inventarioCorriente = stockFisicoActual;
      let contadorOC = 0;
      const loteSugeridoEstandar = Math.round((promedioConsumo * mesesLeadTime) + (promedioConsumo * 3)) || 100;
      const ocsDelProducto: any[] = [];

      if (promedioConsumo > 0) {
        for (let t = 0; t < 24; t++) {
          const indiceMesAbsoluto = (MES_ACTUAL_NUM + t) % 12;
          const añoSimulado = AÑO_ACTUAL + Math.floor((MES_ACTUAL_NUM + t) / 12);
          const etiquetaMesAnual = `${NOMBRES_MESES[indiceMesAbsoluto]} ${añoSimulado === 2026 ? "26" : "27"}`;

          // Sumar arribos programados reales en base de datos
          if (añoSimulado === 2026) {
            inventarioCorriente += (arribosRealesPorMes[indiceMesAbsoluto] || 0);
          }

          // Sumar ingresos de OCs sugeridas previas que ya debieron llegar en este mes de la simulación
          const ingresosDeOcSimuladas = ocsDelProducto
            .filter(o => o.mesAbsolutoArribo === t)
            .reduce((sum, curr) => sum + curr.cantidadAComprar, 0);
          
          inventarioCorriente += ingresosDeOcSimuladas;

          // Restar el consumo esperado del mes
          inventarioCorriente -= promedioConsumo;

          // GATILLO DE QUIEBRE DE STOCK
          if (inventarioCorriente <= 0) {
            contadorOC++;
            const mesAbsolutoLanzamiento = t - mesesLeadTime;
            
            let etiquetaLanzamiento = "";
            let criticidad = "PLANIFICADO";

            if (mesAbsolutoLanzamiento <= 0) {
              // Significa que debió lanzarse antes de Junio 2026 para llegar a tiempo
              etiquetaLanzamiento = `INMEDIATO (Debió ser en ${NOMBRES_MESES[(MES_ACTUAL_NUM + mesAbsolutoLanzamiento + 12) % 12]} 26)`;
              criticidad = "CRITICO";
            } else {
              const idxLanzamiento = (MES_ACTUAL_NUM + mesAbsolutoLanzamiento) % 12;
              const añoLanzamiento = AÑO_ACTUAL + Math.floor((MES_ACTUAL_NUM + mesAbsolutoLanzamiento) / 12);
              etiquetaLanzamiento = `${NOMBRES_MESES[idxLanzamiento]} ${añoLanzamiento === 2026 ? '26' : '27'}`;
              criticidad = añoLanzamiento === 2026 ? "PLANIFICADO" : "FUTURO";
            }

            const nuevaOC = {
              id: `${item.id}-oc-${contadorOC}`,
              product_uuid: item.id,
              code: item.code,
              description: item.description,
              family: item.family,
              stockInicialFisico: stockFisicoActual,
              promedioConsumo: Math.round(promedioConsumo),
              numeroOrdenTexto: `OC #${contadorOC}`,
              mesQuiebreTexto: etiquetaMesAnual,
              mesLanzamientoTexto: etiquetaLanzamiento,
              mesAbsolutoArribo: t,
              cantidadAComprar: loteSugeridoEstandar,
              leadTimeDias,
              criticidad
            };

            ocsDelProducto.push(nuevaOC);
            listadoMaestroOCs.push(nuevaOC);

            // Ajustar inventario tras la compra simulada
            inventarioCorriente += loteSugeridoEstandar;
          }

          // Guardar curvas del gráfico para los primeros 14 meses
          if (t < 14) {
            datosCronologicosGrafico.push({
              mes: etiquetaMesAnual,
              stockProyectado: Math.round(inventarioCorriente),
              velocidadConsumo: Math.round(promedioConsumo),
              cantidadArribo: añoSimulado === 2026 ? (arribosRealesPorMes[indiceMesAbsoluto] || 0) : 0,
              cantidadIngresoSimulado: ocsDelProducto.filter(o => o.mesAbsolutoArribo === t).reduce((sum, c) => sum + c.cantidadAComprar, 0),
              tipo: "PROYECCION"
            });
          }
        }
      }

      // Si el código no quiebra en toda la ventana, añadir registro de inventario saludable
      if (ocsDelProducto.length === 0) {
        listadoMaestroOCs.push({
          id: `${item.id}-ok`,
          product_uuid: item.id,
          code: item.code,
          description: item.description,
          family: item.family,
          stockInicialFisico: stockFisicoActual,
          promedioConsumo: Math.round(promedioConsumo),
          numeroOrdenTexto: "SIN REQUERIMIENTO",
          mesQuiebreTexto: "SALDADO 2026",
          mesLanzamientoTexto: "AL DÍA",
          cantidadAComprar: 0,
          leadTimeDias,
          criticidad: "OPTIMO"
        });
      }

      curvasPorProducto[item.id] = datosCronologicosGrafico;
    });

    return { listadoMaestroOCs, curvasPorProducto };
  }, [productos]);

  // Filtrado ejecutivo de las OCs en base a la urgencia
  const ocsFiltradas = useMemo(() => {
    const lista = analisisAbastecimiento.listadoMaestroOCs;
    if (filtroCriticidad === "TODOS") return lista;
    if (filtroCriticidad === "CRITICO") return lista.filter(o => o.criticidad === "CRITICO");
    if (filtroCriticidad === "PLANIFICADO") return lista.filter(o => o.criticidad === "PLANIFICADO");
    return lista.filter(o => o.criticidad === "OPTIMO");
  }, [analisisAbastecimiento, filtroCriticidad]);

  const conteoEstatus = useMemo(() => {
    const lista = analisisAbastecimiento.listadoMaestroOCs;
    return {
      criticos: lista.filter(o => o.criticidad === "CRITICO").length,
      planificados: lista.filter(o => o.criticidad === "PLANIFICADO").length,
      optimos: lista.filter(o => o.criticidad === "OPTIMO").length,
    };
  }, [analisisAbastecimiento]);

  const analisisSku = useMemo(() => {
    if (!skuSeleccionadoId) return null;
    const item = productos.find(p => p.id === skuSeleccionadoId);
    if (!item) return null;

    return {
      ...item,
      alertasMaturacion: (analisisAbastecimiento.listadoMaestroOCs || []).filter(o => o.product_uuid === skuSeleccionadoId && o.cantidadAComprar > 0),
      proyeccionesPorMes: analisisAbastecimiento.curvasPorProducto[skuSeleccionadoId] || []
    };
  }, [productos, skuSeleccionadoId, analisisAbastecimiento]);

  const exportarPlanAExcel = () => {
    const datosPlan = analisisAbastecimiento.listadoMaestroOCs;
    let csv = "\uFEFF"; 
    csv += "CRITICIDAD;CÓDIGO SKU;DESCRIPCIÓN;SUGERENCIA CORRIENTE;STOCK FISICO INICIAL;PROMEDIO CONSUMO MENSUAL;FECHA SUGERIDA EMISIÓN;MES ESTIMADO QUIEBRE;CANTIDAD A COMPRAR\n";

    datosPlan.forEach(item => {
      const fila = [
        `"${item.criticidad}"`,
        `"${item.code}"`,
        `"${item.description.replace(/"/g, '""')}"`,
        `"${item.numeroOrdenTexto}"`,
        item.stockInicialFisico,
        item.promedioConsumo,
        `"${item.mesLanzamientoTexto}"`,
        `"${item.mesQuiebreTexto}"`,
        item.cantidadAComprar
      ];
      csv += fila.join(";") + "\n";
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Explosion_OC_Sugeridas_Ares_2026.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return (
    <div className="min-h-[50vh] flex items-center justify-center bg-[#f8fafc]">
      <div className="text-center space-y-2">
        <div className="w-9 h-9 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Generando Libro de Órdenes...</p>
      </div>
    </div>
  );

  return (
    <div className="bg-[#f8fafc] p-3 space-y-4 w-full text-slate-800 font-sans antialiased">
      
      {/* CUADRO PRINCIPAL: LIBRO CENTRAL DE REQUERIMIENTOS Y EMISIÓN DE OC */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-black text-slate-900 uppercase tracking-wider">
              <ShoppingCart className="text-purple-600" size={14} />
              <span>Explosión Maestra de Órdenes de Compra (Línea por Requerimiento)</span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium uppercase">Muestra de forma segregada cada OC sucesiva necesaria para mantener la continuidad operacional.</p>
          </div>
          
          <button
            onClick={exportarPlanAExcel}
            className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg shadow-sm transition-all uppercase tracking-wider self-start sm:self-auto"
          >
            <FileSpreadsheet size={13} />
            Exportar OCs a Excel
          </button>
        </div>

        {/* SELECTORES DE FILTRO EJECUTIVO */}
        <div className="flex flex-wrap gap-2 text-[10px] font-bold">
          <button 
            onClick={() => setFiltroCriticidad("TODOS")}
            className={`px-3 py-1.5 rounded-lg border transition-all ${filtroCriticidad === "TODOS" ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            Todas las Líneas ({analisisAbastecimiento.listadoMaestroOCs.length})
          </button>
          
          <button 
            onClick={() => setFiltroCriticidad("CRITICO")}
            className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${filtroCriticidad === "CRITICO" ? 'bg-rose-600 text-white border-rose-600 shadow-sm' : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'}`}
          >
            <AlertTriangle size={12} />
            🚨 CRÍTICOS / POR QUEBRAR ({conteoEstatus.criticos})
          </button>

          <button 
            onClick={() => setFiltroCriticidad("PLANIFICADO")}
            className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${filtroCriticidad === "PLANIFICADO" ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}
          >
            <Clock size={12} />
            🗓️ PLANIFICADOS posterior a Junio ({conteoEstatus.planificados})
          </button>

          <button 
            onClick={() => setFiltroCriticidad("OPTIMO")}
            className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${filtroCriticidad === "OPTIMO" ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}
          >
            <CheckCircle2 size={12} />
            Stock Óptimo ({conteoEstatus.optimos})
          </button>
        </div>

        {/* REPORTE TABULAR DETALLADO */}
        <div className="max-h-[350px] overflow-y-auto border border-slate-200 rounded-lg shadow-inner bg-slate-50">
          <table className="w-full text-left border-collapse text-[10px] bg-white">
            <thead className="sticky top-0 bg-slate-100 z-10 shadow-sm">
              <tr className="text-slate-400 uppercase tracking-wider font-black text-[9px] border-b border-slate-200">
                <th className="p-2.5">Estatus Emisión</th>
                <th className="p-2.5">SKU Código</th>
                <th className="p-2.5">Descripción del Material</th>
                <th className="p-2.5 text-center">N° Sugerencia</th>
                <th className="p-2.5 text-center bg-slate-50/50">Stock Actual</th>
                <th className="p-2.5 text-center bg-slate-50/50">Consumo Promedio</th>
                <th className="p-2.5 text-center">Mes de Quiebre</th>
                <th className="p-2.5 text-right text-purple-700 font-black">Cantidad sugerida comprar</th>
                <th className="p-2.5 text-center">Línea Temporal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
              {ocsFiltradas.map((oc, idx: number) => (
                <tr key={`${oc.id}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-2.5">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black border uppercase ${
                      oc.criticidad === 'CRITICO' ? 'bg-rose-100 text-rose-700 border-rose-300 animate-pulse' : 
                      oc.criticidad === 'PLANIFICADO' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                      oc.criticidad === 'FUTURO' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                      'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {oc.criticidad === 'CRITICO' ? "🔴 EMITIR YA" : oc.mesLanzamientoTexto}
                    </span>
                  </td>
                  <td className="p-2.5 font-bold text-slate-900">{oc.code}</td>
                  <td className="p-2.5 uppercase max-w-[200px] truncate text-slate-500 font-medium">{oc.description}</td>
                  <td className="p-2.5 text-center">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-bold text-[9px]">
                      {oc.numeroOrdenTexto}
                    </span>
                  </td>
                  <td className="p-2.5 text-center font-bold text-slate-900 bg-slate-50/30">{oc.stockInicialFisico.toLocaleString()} un.</td>
                  <td className="p-2.5 text-center text-slate-500 bg-slate-50/30">{oc.promedioConsumo.toLocaleString()} un/mes</td>
                  <td className="p-2.5 text-center">
                    <span className={`font-bold ${oc.cantidadAComprar === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {oc.mesQuiebreTexto}
                    </span>
                  </td>
                  <td className="p-2.5 text-right font-black text-slate-950 text-xs">
                    {oc.cantidadAComprar > 0 ? `${oc.cantidadAComprar.toLocaleString()} un.` : "—"}
                  </td>
                  <td className="p-2.5 text-center">
                    <button 
                      onClick={() => {
                        setSkuSeleccionadoId(oc.product_uuid);
                        setBusqueda(`[${oc.code}] ${oc.description}`);
                        setMostrarDropdown(false);
                      }}
                      className="text-purple-600 hover:text-purple-900 font-bold underline flex items-center justify-center gap-0.5 mx-auto text-[9px]"
                    >
                      Analizar <ArrowRight size={10} />
                    </button>
                  </td>
                </tr>
              ))}
              {ocsFiltradas.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 font-bold uppercase tracking-wider">
                    Ninguna orden de compra coincide con la criticidad seleccionada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECCIÓN EXPLORADORA DE CURVA COMPACTA GRÁFICA */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 relative">
          <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider block mb-1">Buscador y Monitor Individual por SKU</label>
          <input
            type="text"
            className="w-full px-3 py-1 bg-white border border-slate-200 rounded-md text-[10px] font-semibold text-slate-900 outline-none focus:border-purple-600"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setMostrarDropdown(true); }}
            onFocus={() => setMostrarDropdown(true)}
            placeholder="Selecciona o busca un SKU para visualizar la escalera de quiebres futuros..."
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
                <span>Simulación de Cobertura y Escalera de Reposiciones: {analisisSku.code}</span>
              </div>
              <div className="font-bold text-slate-400 uppercase">
                Inventario Base: <span className="text-slate-900 font-black">{analisisSku.stockFisicoActual} un.</span>
              </div>
            </div>

            <div className="w-full h-[220px] text-[9px] font-bold">
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
                  <Area type="monotone" dataKey="stockProyectado" name="Inventario Proyectado" stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#colorStockPlan)" />

                  {/* Líneas de alertas de emisión de OCs en la gráfica */}
                  {analisisSku.alertasMaturacion.map((o: any, idx: number) => {
                    if (o.criticidad === "CRITICO") {
                      return (
                        <ReferenceLine key={`line-crit-${idx}`} x="JUN 26" stroke="#f43f5e" strokeWidth={2} strokeDasharray="2 2">
                          <Label value="❗ DEBIÓ EMITIRSE" position="top" fill="#be123c" fontSize={8} fontWeight="black" />
                        </ReferenceLine>
                      );
                    }
                    return (
                      <ReferenceLine key={`line-plan-${idx}`} x={o.mesLanzamientoTexto} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3 3">
                        <Label value={`${o.numeroOrdenTexto}`} position="top" fill="#d97706" fontSize={8} fontWeight="black" />
                      </ReferenceLine>
                    );
                  })}

                  {/* Renderizar los ingresos repetitivos de mercadería simulada */}
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