"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Search, ArrowDownToLine, Ship, TrendingUp, EyeOff, Eye } from "lucide-react";

export default function ModuloPredicciones() {
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [filtroFamilia, setFiltroFamilia] = useState("TODOS");
  const [mostrarOcultos, setMostrarOcultos] = useState(false); 

  // 🗓️ CONFIGURACIÓN DE FECHA 100% DINÁMICA
  const fechaActualComputada = useMemo(() => new Date(), []);
  const AÑO_ACTUAL = fechaActualComputada.getFullYear(); // Detecta automáticamente el año (ej: 2026)
  const MES_ACTUAL_JS = fechaActualComputada.getMonth();   // Detecta el mes actual (0 = Ene, 5 = Jun, etc.)

  const DOCUMENTOS_SALIDA = ["NS", "22", "23", "93", "TD"];

  // Se ejecuta una SOLA VEZ al montar el componente de manera segura
  useEffect(() => {
    let isMounted = true;
    
    async function fetchDataReal() {
      try {
        const { data: dbProducts, error: errProd } = await supabase.from("products").select("*");
        const { data: dbArrivals, error: errArr } = await supabase.from("arrivals").select("*");

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
            lead_time: parseInt(p.lead_time) || 0,
            stockFisico: Number(p.stock || 0),
            active: p.active !== false, 
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

  const deshabilitarYArchivarSku = async (productId: string, skuCode: string) => {
    const confirmar = window.confirm(`¿Confirmas que deseas ocultar el SKU [${skuCode}]?`);
    if (!confirmar) return;
    setProductos((prev) => prev.map((p) => (p.id === productId ? { ...p, active: false } : p)));
    try {
      await supabase.from("products").update({ active: false }).eq("id", productId);
    } catch (err) {
      console.error(err);
    }
  };

  const reestablecerSku = async (productId: string, skuCode: string) => {
    const confirmar = window.confirm(`¿Deseas restaurar el SKU [${skuCode}]?`);
    if (!confirmar) return;
    setProductos((prev) => prev.map((p) => (p.id === productId ? { ...p, active: true } : p)));
    try {
      await supabase.from("products").update({ active: true }).eq("id", productId);
    } catch (err) {
      console.error(err);
    }
  };

  // 🗓️ CABECERAS DINÁMICAS: Empiezan desde el mes actual y avanzan 12 meses hacia el futuro
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

  const dataProcesada = useMemo(() => {
    return productos
      .filter((p) => (mostrarOcultos ? !p.active : p.active))
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
        const promedioMensualReal = unidadesTotalesSalida / totalMesesPeriodo;

        const varianza = cantidadesMensuales.length > 1
          ? cantidadesMensuales.reduce((sum, val) => sum + Math.pow(val - promedioMensualReal, 2), 0) / (cantidadesMensuales.length - 1)
          : 0;
        const desviacionEstandar = Math.sqrt(varianza);

        const demandaConIncremento = promedioMensualReal * 1.20; // Incremento del 15% para cubrir crecimiento y estacionalidad
        let factorTendenciaAlcista5 = 1.28 * desviacionEstandar;
        const colchonMaximoPermitido = demandaConIncremento * 0.25;
        if (factorTendenciaAlcista5 > colchonMaximoPermitido) {
          factorTendenciaAlcista5 = colchonMaximoPermitido;
        }

        const demandaPredichaFinal = promedioMensualReal > 0 ? demandaConIncremento + factorTendenciaAlcista5 : 0;

        const totalArribos = item.arribos.reduce((sum: number, a: any) => sum + Number(a.quantity || 0), 0);
        const inventarioVirtual = stockFisico + totalArribos;
        const coberturaMeses = demandaPredichaFinal > 0 ? inventarioVirtual / demandaPredichaFinal : 0;
        const sugeridoCompra = demandaPredichaFinal > 0 ? (demandaPredichaFinal * leadTimeMeses) * 1.15 : 0;

        // 🛠️ REPARACIÓN DE LOGÍSTICA DE LÍNEA DE TIEMPO DINÁMICA
        let stockSimulado = stockFisico;
        let mesQuiebreCalculado = "ESTABLE";
        let yaQuebro = false;
        let fechaQuiebre = new Date(AÑO_ACTUAL, MES_ACTUAL_JS + 11, 28); // Por defecto, fin de la ventana proyectada

        const proyeccionesPorMes = mesesHeaders.map((m) => {
          const arribosEsteMes = item.arribos.filter((a: any) => {
            const fechaEta = a.eta_date ? new Date(a.eta_date) : null;
            return fechaEta && fechaEta.getMonth() === m.mesNum && fechaEta.getFullYear() === m.año;
          });

          const entradasOC = arribosEsteMes.reduce((sum: number, curr: any) => sum + Number(curr.quantity || 0), 0);
          
          // Lógica adaptativa para el mes en curso (m.mesNum === MES_ACTUAL_JS)
          const llaveMesActual = `${m.año}-${m.mesNum}`;
          const consumosEfectivosReales = historialPorMes[llaveMesActual] || 0;
          
          // Si estamos evaluando el mes actual en curso, restamos lo que ya se consumió o la predicción (el que sea mayor)
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

          return {
            stockFinal: Math.max(0, stockSimulado),
            demandaPredicha: demandaEfectivaEsteMes,
            arriboInyectado: entradasOC
          };
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
          mesesActivos: totalMesesPeriodo,
          coberturaMeses,
          mesQuiebre: quiebreRealDetectado ? mesQuiebreCalculado : "OK",
          fechaLimiteOCStr: quiebreRealDetectado ? fechaLimiteOC.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : "---",
          pedidoSugerido: quiebreRealDetectado ? sugeridoCompra : 0, 
          proyeccionesPorMes,
          estado: estadoAbastecimiento
        };
      }).filter(i => {
        const cumpleBusqueda = i.code.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase());
        const cumpleEstado = filtroEstado === "TODOS" || i.estado === filtroEstado;
        const cumpleFamilia = filtroFamilia === "TODOS" || i.family === filtroFamilia;
        return cumpleBusqueda && cumpleEstado && cumpleFamilia;
      });
  }, [productos, search, filtroEstado, filtroFamilia, mesesHeaders, AÑO_ACTUAL, MES_ACTUAL_JS, mostrarOcultos]);

  const resumenMétricas = useMemo(() => {
    const totalItems = dataProcesada.length;
    if (totalItems === 0) return { stockTotal: 0, arribosTotal: 0, sugeridoTotal: 0, promedioConsumoIA: 0, promedioCobertura: 0 };

    const stockTotal = dataProcesada.reduce((sum, item) => sum + item.stockFisico, 0);
    const arribosTotal = dataProcesada.reduce((sum, item) => sum + item.enTránsito, 0);
    const sugeridoTotal = dataProcesada.reduce((sum, item) => sum + item.pedidoSugerido, 0);
    const promedioConsumoIA = dataProcesada.reduce((sum, item) => sum + item.consumoIA, 0) / totalItems;
    const promedioCobertura = dataProcesada.reduce((sum, item) => sum + item.coberturaMeses, 0) / totalItems;

    return { stockTotal, arribosTotal, sugeridoTotal, promedioConsumoIA, promedioCobertura };
  }, [dataProcesada]);

  const familiasUnicas = useMemo(() => {
    return Array.from(new Set(productos.map(p => p.family).filter(Boolean)));
  }, [productos]);

  if (loading) return (
    <div className="min-h-[80vh] flex items-center justify-center bg-[#f8fafc]">
      <div className="text-center space-y-2">
        <div className="w-8 h-8 border-2 border-slate-800 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ejecutando Modelado Amortiguado Ares...</p>
      </div>
    </div>
  );

  return (
    <div className="bg-[#f8fafc] min-h-screen text-slate-800 antialiased font-sans">
      <header className="bg-white border-b border-slate-200 p-5">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-base tracking-tight">
          <TrendingUp size={18} className="text-purple-600" />
          <span>Módulo de Planeamiento Predictivo de Compra</span>
        </div>
      </header>

      <main className="p-5 space-y-4 max-w-[1920px] mx-auto">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[320px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Buscador por Código</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder="Buscar SKU..." 
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-medium outline-none focus:bg-white"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="w-52">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Vista de Catálogo</label>
            <select 
              className={`w-full border p-2 rounded-lg text-[11px] font-bold cursor-pointer outline-none ${mostrarOcultos ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-slate-50 border-slate-200 text-slate-800"}`}
              value={mostrarOcultos ? "OCULTOS" : "ACTIVOS"}
              onChange={(e) => setMostrarOcultos(e.target.value === "OCULTOS")}
            >
              <option value="ACTIVOS">🟢 SKU ACTIVOS</option>
              <option value="OCULTOS">⚫ SKUS ARCHIVADOS</option>
            </select>
          </div>

          <div className="w-52">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Familia</label>
            <select 
              className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-[11px] font-bold cursor-pointer"
              value={filtroFamilia}
              onChange={(e) => setFiltroFamilia(e.target.value)}
            >
              <option value="TODOS">TODAS</option>
              {familiasUnicas.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
            </select>
          </div>

          <div className="w-52">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Alertas</label>
            <select 
              className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-[11px] font-bold cursor-pointer"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
            >
              <option value="TODOS">TODOS</option>
              <option value="COMPRAR YA">🚨 COMPRAR YA</option>
              <option value="POR REVISAR">⚠️ POR REVISAR</option>
              <option value="STOCK OK">✅ STOCK OK</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-800 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Stock Físico Consolidado</p>
            <p className="text-xl font-black mt-1 text-slate-100">{resumenMétricas.stockTotal.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">unidades</span></p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-blue-600">Arribos en Tránsito Total</p>
            <p className="text-xl font-black mt-1 text-blue-900">{resumenMétricas.arribosTotal.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">unidades</span></p>
          </div>

          <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 shadow-sm">
            <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wider">Promedio Consumo IA</p>
            <p className="text-xl font-black mt-1 text-purple-900">{Math.round(resumenMétricas.promedioConsumoIA).toLocaleString()} <span className="text-[10px] font-normal text-purple-500">u/m</span></p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cobertura Promedio</p>
            <p className="text-xl font-black mt-1 text-slate-900">{resumenMétricas.promedioCobertura.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">Meses</span></p>
          </div>

          <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 shadow-sm">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Total Sugerido Compra</p>
            <p className="text-xl font-black mt-1 text-emerald-900">{Math.round(resumenMétricas.sugeridoTotal).toLocaleString()} <span className="text-[10px] font-normal text-emerald-500">unidades</span></p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto w-full max-h-[700px] custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1850px]">
              <thead>
                <tr className="bg-[#0f172a] text-slate-200 font-semibold text-[11px] tracking-wider uppercase sticky top-0 z-20 whitespace-nowrap">
                  <th className="p-3 w-36 border-b border-slate-700">Código</th>
                  <th className="p-3 min-w-[280px] max-w-[340px] border-b border-slate-700">Descripción</th>
                  <th className="p-3 text-center w-24 border-b border-slate-700">L. Time</th>
                  <th className="p-3 text-right w-28 border-b border-slate-700">Stock</th>
                  <th className="p-3 text-right w-28 border-b border-slate-700">Arribos</th>
                  <th className="p-3 text-right w-48 border-b border-slate-700 bg-purple-950 text-purple-300 font-black">Predicción (+25% + 5% Risk)</th>
                  <th className="p-3 text-center w-28 border-b border-slate-700 bg-slate-900 text-blue-300">Cobertura</th>
                  <th className="p-3 text-center w-24 border-b border-slate-700">Quiebre</th>
                  <th className="p-3 text-center w-28 border-b border-slate-700">Fecha OC</th>
                  <th className="p-3 text-right w-32 border-b border-slate-700 bg-slate-900 text-emerald-300 font-bold">Sugerido OC</th>
                  {mesesHeaders.map(m => (
                    <th key={m.id} className="p-3 text-right w-32 font-medium border-l border-slate-800 bg-slate-900/40 text-slate-300">
                      {m.nombre} '{String(m.año).slice(-2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {dataProcesada.map(item => (
                  <tr key={item.id} className={`transition-colors ${mostrarOcultos ? "hover:bg-amber-50/40 bg-amber-50/10" : "hover:bg-slate-50/80"}`}>
                    <td className="p-3 font-bold text-slate-900 whitespace-nowrap">{item.code}</td>
                    <td className="p-3 font-medium text-slate-600 max-w-[340px] flex items-center justify-between gap-2">
                      <span>{item.description.toUpperCase()}</span>
                      {mostrarOcultos ? (
                        <button onClick={() => reestablecerSku(item.id, item.code)} className="text-slate-400 hover:text-emerald-600 transition-colors flex-shrink-0 ml-1">
                          <Eye size={13} />
                        </button>
                      ) : (
                        <button onClick={() => deshabilitarYArchivarSku(item.id, item.code)} className="text-slate-800 hover:text-rose-800 transition-colors flex-shrink-0 ml-1">
                          <EyeOff size={13} />
                        </button>
                      )}
                    </td>
                    <td className="p-3 text-center font-medium text-slate-800">{item.lead_time}</td>
                    <td className="p-3 text-right font-semibold text-slate-900">{item.stockFisico.toLocaleString()}</td>
                    <td className="p-3 text-right font-semibold text-blue-600">
                      {item.enTránsito > 0 ? (
                        <span className="bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 text-[10px] font-medium inline-flex items-center gap-1">
                          <Ship size={10} /> {item.enTránsito.toLocaleString()}
                        </span>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="p-3 text-right bg-purple-50/60 w-48">
                      <div className="flex flex-col items-end justify-center pr-1">
                        <span className="font-black text-purple-900 text-xs">
                          {Math.round(item.consumoIA).toLocaleString()} u/m
                        </span>
                        <span className="text-[9px] text-slate-500 font-medium mt-0.5">
                          Histórico: {Math.round(item.promedioReal).toLocaleString()}
                        </span>
                      </div>
                    </td>
                    <td className={`p-3 text-center font-bold bg-blue-50/5 ${item.coberturaMeses < 1.0 ? "text-rose-600 font-black" : "text-slate-700"}`}>
                      {item.coberturaMeses.toFixed(1)} Meses
                    </td>
                    <td className={`p-3 text-center font-bold ${item.mesQuiebre !== "OK" ? "text-rose-600 bg-rose-50/30" : "text-emerald-600"}`}>
                      {item.mesQuiebre}
                    </td>
                    <td className="p-3 text-center font-medium">
                      {item.estado === "COMPRAR YA" ? (
                        <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded font-bold text-[10px]">
                          🚨 {item.fechaLimiteOCStr}
                        </span>
                      ) : <span className="text-slate-400">{item.fechaLimiteOCStr}</span>}
                    </td>
                    <td className="p-3 text-right font-bold bg-slate-50/50 text-slate-900 w-32">
                      {item.pedidoSugerido > 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                          <ArrowDownToLine size={10} className="text-emerald-600" />
                          {Math.round(item.pedidoSugerido).toLocaleString()}
                        </span>
                      ) : <span className="text-slate-400">0</span>}
                    </td>

                    {item.proyeccionesPorMes.map((p: any, idx: number) => (
                      <td key={idx} className="p-3 text-right border-l border-slate-100 whitespace-nowrap bg-slate-50/20 w-32">
                        <div className="flex flex-col items-end">
                          <span className={`font-semibold ${p.stockFinal <= 0 ? "text-rose-600 font-bold bg-rose-50 px-1" : "text-slate-800"}`}>
                            {Math.round(p.stockFinal).toLocaleString()}
                          </span>
                          <div className="flex items-center gap-1.5 text-[9px] mt-0.5 text-slate-400 font-mono">
                            {p.arriboInyectado > 0 && (
                              <span className="text-emerald-600 font-bold">
                                +{Math.round(p.arriboInyectado).toLocaleString()}
                              </span>
                            )}
                            <span>↓{Math.round(p.demandaPredicha).toLocaleString()}</span>
                          </div>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}