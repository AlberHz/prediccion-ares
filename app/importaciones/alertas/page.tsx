"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Search, ListFilter, ArrowDownToLine, Ship, Octagon, AlertTriangle, CheckCircle } from "lucide-react";

export default function ModuloAlertasCompleto() {
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [filtroFamilia, setFiltroFamilia] = useState("TODOS");

  // 🗓️ Configuración de fecha idéntica y dinámica
  const fechaActualComputada = useMemo(() => new Date(), []);
  const AÑO_ACTUAL = fechaActualComputada.getFullYear();
  const MES_ACTUAL_JS = fechaActualComputada.getMonth();

  const DOCUMENTOS_SALIDA = ["NS", "22", "23", "93", "TD"];

  useEffect(() => {
    let isMounted = true;
    
    async function fetchDataReal() {
      try {
        const { data: dbProducts, error: errProd } = await supabase
          .from("products")
          .select("id, code, description, family, lead_time, stock, active, custom_average_consumption");

        const { data: dbArrivals, error: errArr } = await supabase
          .from("arrivals")
          .select("*");

        if (errProd) throw errProd;
        if (errArr) throw errArr;

        let todosLosMovimientos: any[] = [];
        let desde = 0;
        let hasta = 999;
        let tieneMas = true;

        while (tieneMas) {
          const { data: chunk, error: errMov } = await supabase
            .from("movements")
            .select("*")
            .range(desde, hasta);

          if (errMov) throw errMov;

          if (chunk && chunk.length > 0) {
            todosLosMovimientos = [...todosLosMovimientos, ...chunk];
            if (chunk.length < 1000) {
              tieneMas = false;
            } else {
              desde += 1000;
              hasta += 1000;
            }
          } else {
            tieneMas = false;
          }
        }

        if (!isMounted) return;

        const datosConsolidados = (dbProducts || []).map((p: any) => {
          const productUUID = p.id; 
          const historialDelSku = todosLosMovimientos.filter((m: any) => m.product_id === productUUID);
          const arribosDelSku = dbArrivals
            ? dbArrivals.filter((a: any) => a.product_id === productUUID && a.status === "PENDIENTE")
            : [];

          return {
            id: productUUID,
            code: p.code ? String(p.code).trim() : "SIN CÓDIGO",
            description: p.description ? String(p.description).trim() : "SIN DESCRIPCIÓN",
            family: p.family ? String(p.family).trim() : "GENERAL",
            lead_time: parseInt(p.lead_time, 10) || 0,
            stockFisico: Number(p.stock || 0),
            active: p.active !== false, 
            custom_average_consumption: Number(p.custom_average_consumption || 0),
            movimientos: historialDelSku,
            arribos: arribosDelSku
          };
        });

        setProductos(datosConsolidados);
      } catch (err) {
        console.error("Error sincronizando base de datos Ares:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchDataReal();
    return () => { isMounted = false; };
  }, []);

  const mesesHeaders = useMemo(() => {
    const nombresMeses = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
    const listaHeaders = [];
    
    for (let i = 0; i < 12; i++) {
      const fechaFutura = new Date(AÑO_ACTUAL, MES_ACTUAL_JS + i, 1);
      const mNum = fechaFutura.getMonth();
      const aNum = fechaFutura.getFullYear();
      
      listaHeaders.push({ 
        id: `${aNum}-${mNum}`, 
        nombre: nombresMeses[mNum], 
        mesNum: mNum, 
        año: aNum 
      });
    }
    return listaHeaders;
  }, [AÑO_ACTUAL, MES_ACTUAL_JS]);

  // 🧠 MOTOR NETO DE PLANIFICACIÓN (IGUAL AL DE TU MÓDULO ANTERIOR)
  const productosAnalizados = useMemo(() => {
    return productos
      .filter((p) => p.active)
      .map(item => {
        const stockFisico = item.stockFisico;
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
        
        const promedioHistoricoCrudo = unidadesTotalesSalida / totalMesesPeriodo;

        const promedioMensualReal = item.custom_average_consumption > 0 
          ? item.custom_average_consumption 
          : promedioHistoricoCrudo;

        const varianza = cantidadesMensuales.length > 1
          ? cantidadesMensuales.reduce((sum, val) => sum + Math.pow(val - promedioHistoricoCrudo, 2), 0) / (cantidadesMensuales.length - 1)
          : 0;
        const desviaciónEstandar = Math.sqrt(varianza);

        const demandaConIncremento = promedioHistoricoCrudo * 1.30; 
        let factorTendenciaAlcista5 = 1.28 * desviaciónEstandar;
        const colchonMaximoPermitido = demandaConIncremento * 0.25;
        if (factorTendenciaAlcista5 > colchonMaximoPermitido) {
          factorTendenciaAlcista5 = colchonMaximoPermitido;
        }

        const demandaPredichaFinal = item.custom_average_consumption > 0 
          ? item.custom_average_consumption 
          : (promedioHistoricoCrudo > 0 ? demandaConIncremento + factorTendenciaAlcista5 : 0);

        const totalArribos = item.arribos.reduce((sum: number, a: any) => sum + Number(a.quantity || 0), 0);
        const inventarioVirtual = stockFisico + totalArribos;
        const coberturaMeses = demandaPredichaFinal > 0 ? inventarioVirtual / demandaPredichaFinal : 0;
        const puntoRopCalculado = demandaPredichaFinal > 0 ? (demandaPredichaFinal * leadTimeMeses) * 1.15 : 0;

        let stockSimulado = stockFisico;
        let mesQuiebreCalculado = "ESTABLE";
        let yaQuebro = false;
        let fechaQuiebre = new Date(AÑO_ACTUAL, MES_ACTUAL_JS + 11, 28); 

        mesesHeaders.forEach((m) => {
          const arribosEsteMes = item.arribos.filter((a: any) => {
            const fechaEta = a.eta_date ? new Date(a.eta_date) : null;
            return fechaEta && fechaEta.getMonth() === m.mesNum && fechaEta.getFullYear() === m.año;
          });

          const entradasOC = arribosEsteMes.reduce((sum: number, curr: any) => sum + Number(curr.quantity || 0), 0);
          
          const llaveMesActual = `${m.año}-${m.mesNum}`;
          const consumosEfectivosReales = historialPorMes[llaveMesActual] || 0;
          
          const demandaEfectivaEsteMes = (m.mesNum === MES_ACTUAL_JS && m.año === AÑO_ACTUAL)
            ? Math.max(consumosEfectivosReales, demandaPredichaFinal)
            : demandaPredichaFinal;

          stockSimulado = stockSimulado + entradasOC - demandaEfectivaEsteMes;

          if (stockSimulado <= 0 && !yaQuebro) {
            mesQuiebreCalculado = `${m.nombre} '${String(m.año).slice(-2)}`;
            fechaQuiebre = new Date(m.año, m.mesNum, 1);
            yaQuebro = true;
          } else if (stockSimulado > 0 && yaQuebro) {
            yaQuebro = false;
            mesQuiebreCalculado = "ESTABLE";
          }
        });

        const quiebreRealDetectado = mesQuiebreCalculado !== "ESTABLE";

        const fechaLimiteOC = new Date(fechaQuiebre);
        fechaLimiteOC.setDate(fechaLimiteOC.getDate() - leadTimeDias - 30); 

        let estadoAbastecimiento = "STOCK OK";
        const hoy = new Date();

        if (demandaPredichaFinal === 0 && stockFisico === 0) {
          estadoAbastecimiento = "SIN MOVIMIENTO";
        } else if (demandaPredichaFinal > 0 && quiebreRealDetectado && fechaLimiteOC <= hoy) {
          estadoAbastecimiento = "COMPRAR YA";
        } else if (demandaPredichaFinal > 0 && (coberturaMeses <= (leadTimeMeses + 1.0) || quiebreRealDetectado)) {
          estadoAbastecimiento = "POR REVISAR";
        }

        return {
          ...item,
          enTránsito: totalArribos,
          promedioReal: promedioMensualReal,
          consumoIA: demandaPredichaFinal, 
          coberturaMeses,
          mesQuiebre: quiebreRealDetectado ? mesQuiebreCalculado : "OK",
          fechaLimiteOCStr: quiebreRealDetectado ? fechaLimiteOC.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : "---",
          puntoRop: quiebreRealDetectado ? puntoRopCalculado : 0, 
          estado: estadoAbastecimiento,
          esPromedioModificado: item.custom_average_consumption > 0
        };
      });
  }, [productos, mesesHeaders, AÑO_ACTUAL, MES_ACTUAL_JS]);

  // 🎯 FILTRADO DINÁMICO POR ESTADOS Y FAMILIAS
  const productosFiltrados = useMemo(() => {
    return productosAnalizados.filter(p => {
      const cumpleTexto = !search.trim() || 
                           p.code.toLowerCase().includes(search.toLowerCase()) || 
                           p.description.toLowerCase().includes(search.toLowerCase());
      
      const cumpleEstado = filtroEstado === "TODOS" || p.estado === filtroEstado;
      const cumpleFamilia = filtroFamilia === "TODOS" || p.family === filtroFamilia;

      return cumpleTexto && cumpleEstado && cumpleFamilia;
    });
  }, [productosAnalizados, search, filtroEstado, filtroFamilia]);

  // Contadores dinámicos para las tarjetas informativas superiores
  const conteos = useMemo(() => {
    return {
      comprarYa: productosAnalizados.filter(p => p.estado === "COMPRAR YA").length,
      porRevisar: productosAnalizados.filter(p => p.estado === "POR REVISAR").length,
      stockOk: productosAnalizados.filter(p => p.estado === "STOCK OK").length,
    };
  }, [productosAnalizados]);

  const familiasUnicas = useMemo(() => {
    return Array.from(new Set(productosAnalizados.map(p => p.family).filter(Boolean)));
  }, [productosAnalizados]);

  if (loading) return (
    <div className="min-h-[40vh] flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-2">
        <div className="w-7 h-7 border-2 border-slate-700 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando Resumen Ares Multiestado...</p>
      </div>
    </div>
  );

  return (
    <div className="bg-[#f8fafc] p-4 sm:p-6 rounded-2xl border border-slate-200 space-y-4 w-full text-slate-800 antialiased">
      
      {/* INDICADORES SUPERIORES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div onClick={() => setFiltroEstado("COMPRAR YA")} className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${filtroEstado === "COMPRAR YA" ? "bg-red-600 text-white border-red-700 shadow-md" : "bg-white border-slate-200 hover:bg-red-50/30"}`}>
          <div className="space-y-0.5">
            <span className={`text-[9px] font-black tracking-widest uppercase ${filtroEstado === "COMPRAR YA" ? "text-red-100" : "text-slate-400"}`}>Urgencia Crítica</span>
            <h3 className="text-sm font-black tracking-tight flex items-center gap-1.5">
              <Octagon size={14} className={filtroEstado === "COMPRAR YA" ? "fill-white text-red-600" : "text-red-600"} />
              COMPRAR YA
            </h3>
          </div>
          <span className={`text-xl font-black ${filtroEstado === "COMPRAR YA" ? "text-white" : "text-red-600"}`}>{conteos.comprarYa}</span>
        </div>

        <div onClick={() => setFiltroEstado("POR REVISAR")} className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${filtroEstado === "POR REVISAR" ? "bg-amber-500 text-white border-amber-600 shadow-md" : "bg-white border-slate-200 hover:bg-amber-50/30"}`}>
          <div className="space-y-0.5">
            <span className={`text-[9px] font-black tracking-widest uppercase ${filtroEstado === "POR REVISAR" ? "text-amber-100" : "text-slate-400"}`}>Abastecimiento Próximo</span>
            <h3 className="text-sm font-black tracking-tight flex items-center gap-1.5">
              <AlertTriangle size={14} className={filtroEstado === "POR REVISAR" ? "fill-white text-amber-500" : "text-amber-500"} />
              POR REVISAR
            </h3>
          </div>
          <span className={`text-xl font-black ${filtroEstado === "POR REVISAR" ? "text-white" : "text-amber-600"}`}>{conteos.porRevisar}</span>
        </div>

        <div onClick={() => setFiltroEstado("STOCK OK")} className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${filtroEstado === "STOCK OK" ? "bg-emerald-600 text-white border-emerald-700 shadow-md" : "bg-white border-slate-200 hover:bg-emerald-50/30"}`}>
          <div className="space-y-0.5">
            <span className={`text-[9px] font-black tracking-widest uppercase ${filtroEstado === "STOCK OK" ? "text-emerald-100" : "text-slate-400"}`}>Inventario Seguro</span>
            <h3 className="text-sm font-black tracking-tight flex items-center gap-1.5">
              <CheckCircle size={14} className={filtroEstado === "STOCK OK" ? "fill-white text-emerald-600" : "text-emerald-600"} />
              STOCK OK
            </h3>
          </div>
          <span className={`text-xl font-black ${filtroEstado === "STOCK OK" ? "text-white" : "text-emerald-600"}`}>{conteos.stockOk}</span>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-5 relative">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Buscar SKU o Descripción</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Filtrar códigos de barras, nombres..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:bg-white focus:border-slate-400 text-slate-900"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="md:col-span-4">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Filtrar por Alerta</label>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none text-slate-700 cursor-pointer"
          >
            <option value="TODOS">🚨 TODOS LOS ESTADOS COBRADOS</option>
            <option value="COMPRAR YA">🚨 COMPRAR YA</option>
            <option value="POR REVISAR">⚠️ POR REVISAR</option>
            <option value="STOCK OK">✅ STOCK OK</option>
          </select>
        </div>

        <div className="md:col-span-3">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Filtrar por Familia</label>
          <select
            value={filtroFamilia}
            onChange={(e) => setFiltroFamilia(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none text-slate-700 cursor-pointer"
          >
            <option value="TODOS">TODAS LAS FAMILIAS</option>
            {familiasUnicas.map((f, idx) => (
              <option key={idx} value={f}>{f.toUpperCase()}</option>
            ))}
          </select>
        </div>
      </div>

      {/* TABLA ESFEJO RESUMIDA MULTIESTADO */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs uppercase tracking-wider">
            <ListFilter size={13} className="text-slate-600" />
            Catálogo Resumido Unificado
          </div>
          <span className="text-[8px] font-extrabold bg-slate-200 text-slate-800 px-2 py-0.5 rounded">
            CALCULO NETO CONSOLIDADO
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1150px]">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-[9px] font-black uppercase tracking-wider text-slate-500">
                <th className="p-3">Código SKU</th>
                <th className="p-3">Descripción</th>
                <th className="p-3">Familia</th>
                <th className="p-3 text-center">Estado</th>
                <th className="p-3 text-center">Lead Time</th>
                <th className="p-3 text-right">Stock Físico</th>
                <th className="p-3 text-right">En Tránsito</th>
                <th className="p-3 text-right bg-purple-900/5 text-purple-950 font-bold">Predicción Consumo</th>
                <th className="p-3 text-center">Cobertura</th>
                <th className="p-3 text-center">Mes Quiebre</th>
                <th className="p-3 text-center">Fecha Límite OC</th>
                <th className="p-3 text-right bg-emerald-900/5 text-emerald-950 font-bold">Punto ROP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {productosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-slate-400 font-bold uppercase text-[10px]">
                    ⚠️ No hay registros que coincidan con la búsqueda o filtros aplicados.
                  </td>
                </tr>
              ) : (
                productosFiltrados.map((row) => {
                  let badgeEstado = "bg-emerald-100 text-emerald-800 border-emerald-200";
                  if (row.estado === "COMPRAR YA") badgeEstado = "bg-red-100 text-red-800 border-red-200 font-bold animate-pulse";
                  if (row.estado === "POR REVISAR") badgeEstado = "bg-amber-100 text-amber-800 border-amber-200";
                  if (row.estado === "SIN MOVIMIENTO") badgeEstado = "bg-slate-100 text-slate-400";

                  return (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                      <td className={`p-3 font-mono font-black tracking-tight ${row.estado === "COMPRAR YA" ? "text-red-700" : "text-slate-900"}`}>{row.code}</td>
                      <td className="p-3 text-slate-600 max-w-[220px] truncate font-medium" title={row.description}>
                        {row.description}
                      </td>
                      <td className="p-3 text-[10px] font-bold text-slate-500 uppercase">{row.family}</td>
                      
                      {/* ESTADO DINÁMICO */}
                      <td className="p-3 text-center">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${badgeEstado}`}>
                          {row.estado}
                        </span>
                      </td>

                      <td className="p-3 text-center font-semibold text-slate-500">{row.lead_time}d</td>
                      <td className="p-3 text-right font-black text-slate-900 bg-slate-50/50">
                        {row.stockFisico.toLocaleString()}
                      </td>
                      <td className="p-3 text-right font-semibold text-blue-600">
                        {row.enTránsito > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <Ship size={11} className="text-blue-400" />
                            +{row.enTránsito.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-slate-300">---</span>
                        )}
                      </td>
                      
                      {/* PREDICCIÓN DE CONSUMO EXACTA RESPECTANDO MODIFICACIONES */}
                      <td className="p-3 text-right font-black text-purple-950 bg-purple-50/20">
                        <div className="flex flex-col items-end">
                          <span>{row.consumoIA > 0 ? `${Math.round(row.consumoIA).toLocaleString()} u/m` : "0"}</span>
                          {row.esPromedioModificado && (
                            <span className="text-[8px] text-amber-700 font-extrabold tracking-wide mt-0.5 bg-amber-100 px-1 rounded border border-amber-200 uppercase">
                              📝 MANUAL
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-3 text-center">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full text-white tracking-wide ${row.estado === "COMPRAR YA" ? "bg-red-600" : row.estado === "POR REVISAR" ? "bg-amber-500" : "bg-emerald-600"}`}>
                          {row.coberturaMeses > 99 ? "∞" : `${row.coberturaMeses.toFixed(1)} m`}
                        </span>
                      </td>
                      <td className="p-3 text-center font-bold">
                        {row.mesQuiebre === "OK" ? (
                          <span className="text-emerald-600 font-black text-[10px]">OK</span>
                        ) : (
                          <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded text-[10px] font-black border border-red-100">
                            {row.mesQuiebre}
                          </span>
                        )}
                      </td>
                      <td className={`p-3 text-center font-mono font-black bg-slate-50/30 ${row.estado === "COMPRAR YA" ? "text-red-600" : "text-slate-500"}`}>
                        {row.fechaLimiteOCStr}
                      </td>
                      <td className="p-3 text-right font-black bg-emerald-50/20 text-emerald-950">
                        {row.puntoRop > 0 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-black">
                            <ArrowDownToLine size={12} className="text-emerald-500" />
                            {Math.round(row.puntoRop).toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-slate-300 font-normal">---</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}