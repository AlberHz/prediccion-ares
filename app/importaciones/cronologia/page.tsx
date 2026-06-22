"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Search, ShoppingCart, ArrowRight, FileSpreadsheet, LineChart as ChartIcon, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Label } from "recharts";

const DOCUMENTOS_SALIDA = ["NS", "22", "23", "93", "TD"];
const NOMBRES_MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

export default function PlanificadorAbastecimientoAres() {
  const [productos, setProductos] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const [skuSeleccionadoId, setSkuSeleccionadoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtroCriticidad, setFiltroCriticidad] = useState<string>("TODOS");

  // 🗓️ CONFIGURACIÓN DE FECHA DINÁMICA DE REFERENCIA (Alineado con Predicciones)
  const fechaActualComputada = useMemo(() => new Date(), []);
  const AÑO_ACTUAL = fechaActualComputada.getFullYear(); 
  const MES_ACTUAL_JS = fechaActualComputada.getMonth(); 

  useEffect(() => {
    fetchDataReal();
  }, []);

  async function fetchDataReal() {
    setLoading(true);
    try {
      // 🟢 FILTRAR SÓLO SKUS ACTIVOS
      const { data: dbProducts, error: errProd } = await supabase
        .from("products")
        .select("id, code, description, family, lead_time, stock, active, custom_average_consumption")
        .eq("active", true);

      const { data: dbArrivals, error: errArr } = await supabase.from("arrivals").select("*");

      if (errProd) throw errProd;
      if (errArr) throw errArr;

      let todosLosMovimientos: any[] = [];
      let desde = 0;
      let hasta = 999;
      let tieneMas = true;

      while (tieneMas) {
        const { data: chunk, error: errMov } = await supabase.from("movements").select("*").range(desde, hasta);
        if (errMov) throw errMov;
        if (chunk && chunk.length > 0) {
          todosLosMovimientos = [...todosLosMovimientos, ...chunk];
          if (chunk.length < 1000) tieneMas = false;
          else { desde += 1000; hasta += 1000; }
        } else { tieneMas = false; }
      }

      const datosConsolidados = (dbProducts || []).map((p: any) => {
        const productUUID = p.id;
        const historialDelSku = todosLosMovimientos.filter((m: any) => m.product_id === productUUID);
        const arribosDelSku = dbArrivals ? dbArrivals.filter((a: any) => a.product_id === productUUID && a.status === "PENDIENTE") : [];

        return {
          id: productUUID,
          code: p.code ? String(p.code).trim() : "SIN CÓDIGO",
          description: p.description ? String(p.description).trim() : "SIN DESCRIPCIÓN",
          family: p.family ? String(p.family).trim() : "GENERAL",
          lead_time: parseInt(p.lead_time) || 0,
          stockFisicoActual: Number(p.stock || 0),
          custom_average_consumption: parseInt(p.custom_average_consumption) || 0,
          movimientos: historialDelSku,
          arribos: arribosDelSku
        };
      });

      setProductos(datosConsolidados);
      if (datosConsolidados.length > 0) {
        setSkuSeleccionadoId(datosConsolidados[0].id);
        setBusqueda(`[${datosConsolidados[0].code}] ${datosConsolidados[0].description}`);
      }
    } catch (err) {
      console.error("Error sincronizando base de datos Ares:", err);
    } finally {
      setLoading(false);
    }
  }

  // --- EXPLOSIÓN DE REQUERIMIENTOS CON LÓGICA DE PREDICCIONES (PROMEDIO + 25% GLOBAL) ---
  const analisisAbastecimiento = useMemo(() => {
    const listadoMaestroOCs: any[] = [];
    const curvasPorProducto: Record<string, any[]> = {};

    // Cabeceras de simulación de 12 meses idéntico a predicciones
    const mesesHeaders: any[] = [];
    for (let i = 0; i < 12; i++) {
      const fFutura = new Date(AÑO_ACTUAL, MES_ACTUAL_JS + i, 1);
      mesesHeaders.push({ mNum: fFutura.getMonth(), aNum: fFutura.getFullYear() });
    }

    productos.forEach((item) => {
      const stockFisicoActual = item.stockFisicoActual;
      const leadTimeDias = item.lead_time;
      const leadTimeMeses = leadTimeDias / 30;

      const salidasValidas = item.movimientos.filter((m: any) => {
        const tipoDoc = String(m.type || "").trim().toUpperCase();
        const codTrans = String(m.transaction_code || "").trim().toUpperCase();
        return DOCUMENTOS_SALIDA.includes(tipoDoc) || DOCUMENTOS_SALIDA.includes(codTrans);
      });

      const historialPorMes: { [key: string]: number } = {};
      salidasValidas.forEach((m: any) => {
        const fechaObj = m.date ? new Date(m.date) : new Date(m.created_at);
        const llaveMes = `${fechaObj.getFullYear()}-${fechaObj.getMonth()}`;
        historialPorMes[llaveMes] = (historialPorMes[llaveMes] || 0) + Math.abs(Number(m.quantity || 0));
      });

      const cantidadesMensuales = Object.values(historialPorMes);
      const totalMesesPeriodo = cantidadesMensuales.length > 0 ? cantidadesMensuales.length : 1;
      const unidadesTotalesSalida = cantidadesMensuales.reduce((sum, val) => sum + val, 0);

      // 🌟 REGLA DE CONSUMO IA (PROMEDIO + INCREMENTO ~25% MEDIANTE VARIANZA)
      const promedioMensualReal = item.custom_average_consumption > 0 
        ? item.custom_average_consumption 
        : (unidadesTotalesSalida / totalMesesPeriodo);

      const varianza = cantidadesMensuales.length > 1
        ? cantidadesMensuales.reduce((sum, val) => sum + Math.pow(val - promedioMensualReal, 2), 0) / (cantidadesMensuales.length - 1)
        : 0;
      const desviaciónEstandar = Math.sqrt(varianza);

      const demandaConIncremento = promedioMensualReal * 1.20; 
      let factorTendenciaAlcista5 = 1.28 * desviaciónEstandar;
      const colchonMaximoPermitido = demandaConIncremento * 0.25;
      if (factorTendenciaAlcista5 > colchonMaximoPermitido) {
        factorTendenciaAlcista5 = colchonMaximoPermitido;
      }

      const demandaPredichaFinal = promedioMensualReal > 0 ? demandaConIncremento + factorTendenciaAlcista5 : 0;
      const loteSugeridoEstandar = demandaPredichaFinal > 0 ? (demandaPredichaFinal * leadTimeMeses) * 1.15 : 0;

      // Reconstrucción del Pasado para Gráfico
      const datosCronologicosGrafico: any[] = [];
      let stockIterativoPasado = stockFisicoActual;
      for (let m = MES_ACTUAL_JS - 1; m >= Math.max(0, MES_ACTUAL_JS - 4); m--) {
        const salidasReales = historialPorMes[`${AÑO_ACTUAL}-${m}`] || 0;
        stockIterativoPasado += salidasReales;
        datosCronologicosGrafico.unshift({ 
          mes: `${NOMBRES_MESES[m]} '${String(AÑO_ACTUAL).slice(-2)}`, 
          stockProyectado: Math.max(0, stockIterativoPasado), 
          velocidadConsumo: salidasReales, 
          cantidadArribo: 0,
          tipo: "REAL" 
        });
      }

      // Simulación de Línea de Tiempo hacia el Futuro (Ventana de 12 meses de predicciones)
      let stockSimulado = stockFisicoActual;
      let contadorOC = 0;
      const ocsDelProducto: any[] = [];

      if (demandaPredichaFinal > 0) {
        mesesHeaders.forEach((m, idx) => {
          const arribosEsteMes = item.arribos.filter((a: any) => {
            const fechaEta = a.eta_date ? new Date(a.eta_date) : null;
            return fechaEta && fechaEta.getMonth() === m.mNum && fechaEta.getFullYear() === m.aNum;
          });
          const entradasOCReales = arribosEsteMes.reduce((sum: number, curr: any) => sum + Number(curr.quantity || 0), 0);

          // Sumar arribos reales del mes en curso simulado
          stockSimulado += entradasOCReales;

          // Sumar ingresos simulación de OCs calculadas en iteraciones previas que llegan ESTE mes
          const ingresosDeOcSimuladas = ocsDelProducto
            .filter(o => o.mesAbsolutoArribo === idx)
            .reduce((sum, curr) => sum + curr.cantidadAComprar, 0);
          stockSimulado += ingresosDeOcSimuladas;

          // Restar Consumo Esperado
          const llaveMesActual = `${m.aNum}-${m.mNum}`;
          const consumosEfectivosReales = historialPorMes[llaveMesActual] || 0;
          const demandaEfectivaEsteMes = (m.mNum === MES_ACTUAL_JS && m.aNum === AÑO_ACTUAL)
            ? Math.max(consumosEfectivosReales, demandaPredichaFinal)
            : demandaPredichaFinal;

          stockSimulado -= demandaEfectivaEsteMes;

          // 🚨 GATILLO DE QUIEBRE: SI CAE A 0 O MENOS, EMITIMOS OC PARA SALVAR EL MES
          if (stockSimulado <= 0) {
            contadorOC++;
            
            // LÓGICA DE EMISIÓN: 1 mes antes del Quiebre menos el Lead Time
            const fechaQuiebreEstimada = new Date(m.aNum, m.mNum, 1);
            const fechaLimiteOC = new Date(fechaQuiebreEstimada);
            fechaLimiteOC.setDate(fechaLimiteOC.getDate() - leadTimeDias - 30); // Resta los días de leadtime + 30 días (1 mes antes)

            let etiquetaLanzamiento = fechaLimiteOC.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }).toUpperCase();
            let criticidad = "PLANIFICADO";

            if (fechaLimiteOC <= fechaActualComputada) {
              etiquetaLanzamiento = `IMMEDIATO (Debió ser ${NOMBRES_MESES[fechaLimiteOC.getMonth()]} '${String(fechaLimiteOC.getFullYear()).slice(-2)})`;
              criticidad = "CRITICO";
            } else if (fechaLimiteOC.getFullYear() > AÑO_ACTUAL) {
              criticidad = "FUTURO";
            }

            const nuevaOC = {
              id: `${item.id}-oc-${contadorOC}`,
              product_uuid: item.id,
              code: item.code,
              description: item.description,
              family: item.family,
              stockInicialFisico: stockFisicoActual,
              promedioConsumo: Math.round(demandaPredichaFinal),
              numeroOrdenTexto: `OC #${contadorOC}`,
              mesQuiebreTexto: `${NOMBRES_MESES[m.mNum]} '${String(m.aNum).slice(-2)}`,
              mesLanzamientoTexto: etiquetaLanzamiento,
              mesAbsolutoArribo: idx, // Llega exactamente en el mes de quiebre para salvarlo
              cantidadAComprar: Math.round(loteSugeridoEstandar),
              leadTimeDias,
              criticidad
            };

            ocsDelProducto.push(nuevaOC);
            listadoMaestroOCs.push(nuevaOC);

            // Inyectamos de inmediato el lote sugerido para levantar la simulación del stock
            stockSimulado += loteSugeridoEstandar;
          }

          // Guardar curvas para el gráfico Recharts
          datosCronologicosGrafico.push({
            mes: `${NOMBRES_MESES[m.mNum]} '${String(m.aNum).slice(-2)}`,
            stockProyectado: Math.max(0, Math.round(stockSimulado)),
            velocidadConsumo: Math.round(demandaEfectivaEsteMes),
            cantidadArribo: entradasOCReales,
            cantidadIngresoSimulado: ocsDelProducto.filter(o => o.mesAbsolutoArribo === idx).reduce((sum, c) => sum + c.cantidadAComprar, 0),
            tipo: "PROYECCION"
          });
        });
      }

      if (ocsDelProducto.length === 0) {
        listadoMaestroOCs.push({
          id: `${item.id}-ok`,
          product_uuid: item.id,
          code: item.code,
          description: item.description,
          family: item.family,
          stockInicialFisico: stockFisicoActual,
          promedioConsumo: Math.round(demandaPredichaFinal),
          numeroOrdenTexto: "SIN REQUERIMIENTO",
          mesQuiebreTexto: "ESTABLE",
          mesLanzamientoTexto: "AL DÍA",
          cantidadAComprar: 0,
          leadTimeDias,
          criticidad: "OPTIMO"
        });
      }

      curvasPorProducto[item.id] = datosCronologicosGrafico;
    });

    return { listadoMaestroOCs, curvasPorProducto };
  }, [productos, AÑO_ACTUAL, MES_ACTUAL_JS, fechaActualComputada]);

  // Filtrado de la tabla según buscador y estatus
  const ocsFiltradas = useMemo(() => {
    let lista = analisisAbastecimiento.listadoMaestroOCs;
    if (busqueda && !mostrarDropdown) {
      lista = lista.filter(o => o.code.toLowerCase().includes(busqueda.toLowerCase()) || o.description.toLowerCase().includes(busqueda.toLowerCase()));
    }
    if (filtroCriticidad === "TODOS") return lista;
    if (filtroCriticidad === "CRITICO") return lista.filter(o => o.criticidad === "CRITICO");
    if (filtroCriticidad === "PLANIFICADO") return lista.filter(o => o.criticidad === "PLANIFICADO");
    return lista.filter(o => o.criticidad === "OPTIMO");
  }, [analisisAbastecimiento, filtroCriticidad, busqueda, mostrarDropdown]);

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
    csv += "CRITICIDAD;CÓDIGO SKU;DESCRIPCIÓN;SUGERENCIA CORRIENTE;STOCK FISICO INICIAL;CONSUMO IA SUGERIDO;FECHA SUGERIDA EMISIÓN;MES ESTIMADO QUIEBRE;CANTIDAD A COMPRAR\n";

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
    link.setAttribute("download", `Plan_Cronologia_CierreAño_${AÑO_ACTUAL}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return (
    <div className="min-h-[50vh] flex items-center justify-center bg-[#f8fafc]">
      <div className="text-center space-y-2">
        <div className="w-9 h-9 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Sincronizando Cronogramas Activos con Algoritmo IA...</p>
      </div>
    </div>
  );

  return (
    <div className="bg-[#f8fafc] p-3 space-y-4 w-full text-slate-800 font-sans antialiased">
      
      {/* CUADRO PRINCIPAL */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-black text-slate-900 uppercase tracking-wider">
              <ShoppingCart className="text-purple-600" size={14} />
              <span>Cronograma Maestro de Órdenes de Compra (Cierre de Año)</span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium uppercase">Emisión de OCs calculadas siempre un mes antes de cumplir el Lead Time crítico del quiebre.</p>
          </div>
          
          <button
            onClick={exportarPlanAExcel}
            className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg shadow-sm transition-all uppercase tracking-wider self-start sm:self-auto"
          >
            <FileSpreadsheet size={13} />
            Exportar Líneas a Excel
          </button>
        </div>

        {/* SELECTORES DE FILTRO */}
        <div className="flex flex-wrap gap-2 text-[10px] font-bold">
          <button 
            onClick={() => setFiltroCriticidad("TODOS")}
            className={`px-3 py-1.5 rounded-lg border transition-all ${filtroCriticidad === "TODOS" ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            Todos los Activos ({analisisAbastecimiento.listadoMaestroOCs.length})
          </button>
          
          <button 
            onClick={() => setFiltroCriticidad("CRITICO")}
            className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${filtroCriticidad === "CRITICO" ? 'bg-rose-600 text-white border-rose-600 shadow-sm' : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'}`}
          >
            <AlertTriangle size={12} />
            🚨 EMITIR INMEDIATO ({conteoEstatus.criticos})
          </button>

          <button 
            onClick={() => setFiltroCriticidad("PLANIFICADO")}
            className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${filtroCriticidad === "PLANIFICADO" ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}
          >
            🗓️ EMISIONES CRONOGRAMADAS ({conteoEstatus.planificados})
          </button>

          <button 
            onClick={() => setFiltroCriticidad("OPTIMO")}
            className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${filtroCriticidad === "OPTIMO" ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}
          >
            <CheckCircle2 size={12} />
            CON STOCK SEGURO ({conteoEstatus.optimos})
          </button>
        </div>

        {/* REPORTE TABULAR DETALLADO */}
        <div className="max-h-[350px] overflow-y-auto border border-slate-200 rounded-lg shadow-inner bg-slate-50">
          <table className="w-full text-left border-collapse text-[10px] bg-white">
            <thead className="sticky top-0 bg-slate-100 z-10 shadow-sm">
              <tr className="text-slate-400 uppercase tracking-wider font-black text-[9px] border-b border-slate-200">
                <th className="p-2.5">Mes Emisión OC</th>
                <th className="p-2.5">SKU Código</th>
                <th className="p-2.5">Descripción del Material</th>
                <th className="p-2.5 text-center">N° Sugerencia</th>
                <th className="p-2.5 text-center bg-slate-50/50">Stock Físico</th>
                <th className="p-2.5 text-center bg-slate-50/50">Consumo AI (+25%)</th>
                <th className="p-2.5 text-center">Mes Est. Quiebre</th>
                <th className="p-2.5 text-right text-purple-700 font-black">Cantidad a Emitir</th>
                <th className="p-2.5 text-center">Línea Temporal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
              {ocsFiltradas.map((oc, idx: number) => (
                <tr key={`${oc.id}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-2.5">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black border uppercase ${
                      oc.criticidad === 'CRITICO' ? 'bg-rose-100 text-rose-700 border-rose-300' : 
                      oc.criticidad === 'PLANIFICADO' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                      oc.criticidad === 'FUTURO' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                      'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {oc.criticidad === 'CRITICO' ? "🚨 EMITIR YA" : oc.mesLanzamientoTexto}
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
                  <td className="p-2.5 text-center text-purple-900 font-bold bg-purple-50/20">{oc.promedioConsumo.toLocaleString()} u/mes</td>
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
                      Ver Curva <ArrowRight size={10} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECCIÓN MONITOR GRAFICO COMPACTO */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 relative">
          <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider block mb-1">Buscador Activo por SKU para Simulación Escalada</label>
          <input
            type="text"
            className="w-full px-3 py-1 bg-white border border-slate-200 rounded-md text-[10px] font-semibold text-slate-900 outline-none focus:border-purple-600"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setMostrarDropdown(true); }}
            onFocus={() => setMostrarDropdown(true)}
            placeholder="Escribe el código del producto..."
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
                <span>Escalera de Abastecimiento Proyectada (Consumo IA con +25%): {analisisSku.code}</span>
              </div>
              <div className="font-bold text-slate-400 uppercase">
                Lead Time: <span className="text-slate-900 font-black">{analisisSku.lead_time} días</span>
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

                  {/* Renderizar ingresos simulados */}
                  {analisisSku.proyeccionesPorMes.map((p: any, idx: number) => {
                    const totalIngreso = (p.cantidadArribo || 0) + (p.cantidadIngresoSimulado || 0);
                    if (totalIngreso > 0) {
                      return (
                        <ReferenceLine key={`ingreso-cont-${idx}`} x={p.mes} stroke="#10b981" strokeWidth={1.2}>
                          <Label value={`+${totalIngreso.toLocaleString()} UN`} position="insideTopLeft" fill="#047857" fontSize={7} fontStyle="bold" />
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