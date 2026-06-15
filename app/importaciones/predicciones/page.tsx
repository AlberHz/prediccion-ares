"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Search, ArrowDownToLine, Ship, TrendingUp, EyeOff, Eye, Layers } from "lucide-react";

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
        // 🌟 Se agregó "custom_average_consumption" a la lectura de productos
        const { data: dbProducts, error: errProd } = await supabase.from("products").select("id, code, description, family, lead_time, stock, active, custom_average_consumption");
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
            custom_average_consumption: parseInt(p.custom_average_consumption) || 0, // 🌟 Mapeado seguro a memoria
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
        validasSalidas: salidasValidas.forEach((m: any) => {
          const fechaObj = m.date ? new Date(m.date) : new Date(m.created_at);
          const llaveMes = `${fechaObj.getFullYear()}-${fechaObj.getMonth()}`;
          historialPorMes[llaveMes] = (historialPorMes[llaveMes] || 0) + Math.abs(Number(m.quantity || 0));
        });

        const cantidadesMensuales = Object.values(historialPorMes);
        const totalMesesPeriodo = cantidadesMensuales.length > 0 ? cantidadesMensuales.length : 1;
        const unidadesTotalesSalida = cantidadesMensuales.reduce((sum, val) => sum + val, 0);
        
        // 🌟 REGLA DE NEGOCIO ENRIQUECIDA: Si tiene promedio manual fijado mayor a 0, usa ese, sino calcula el real del historial.
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

        const totalArribos = item.arribos.reduce((sum: number, a: any) => sum + Number(a.quantity || 0), 0);
        const inventarioVirtual = stockFisico + totalArribos;
        const coberturaMeses = demandaPredichaFinal > 0 ? inventarioVirtual / demandaPredichaFinal : 0;
        const sugeridoCompra = demandaPredichaFinal > 0 ? (demandaPredichaFinal * leadTimeMeses) * 1.15 : 0;

        let stockSimulado = stockFisico;
        let mesQuiebreCalculado = "ESTABLE";
        let yaQuebro = false;
        let fechaQuiebre = new Date(AÑO_ACTUAL, MES_ACTUAL_JS + 11, 28); 

        const proyeccionesPorMes = mesesHeaders.map((m) => {
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

  // 🗂️ AGRUPACIÓN DINÁMICA POR FAMILIA PARA LA TABLA
  const dataAgrupadaPorFamilia = useMemo(() => {
    return dataProcesada.reduce((acc: { [key: string]: any[] }, item) => {
      const familia = item.family || "GENERAL";
      if (!acc[familia]) {
        acc[familia] = [];
      }
      acc[familia].push(item);
      return acc;
    }, {});
  }, [dataProcesada]);

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
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ejecutando Modelado Predictivo Ares...</p>
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
        {/* FILTROS */}
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

        {/* METRICAS */}
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
            <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wider">Consumo Promedio</p>
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

        {/* TABLA AGRUPADA POR FAMILIA */}
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
                  <th className="p-3 text-right w-48 border-b border-slate-700 bg-purple-950 text-purple-300 font-black">Prediccion</th>
                  <th className="p-3 text-center w-28 border-b border-slate-700 bg-slate-900 text-blue-300">Cobertura</th>
                  <th className="p-3 text-center w-24 border-b border-slate-700">Quiebre</th>
                  <th className="p-3 text-center w-28 border-b border-slate-700">Fecha OC</th>
                  <th className="p-3 text-right w-32 border-b border-slate-700 bg-slate-900 text-emerald-300 font-bold">Punto ROP</th>
                  {mesesHeaders.map(m => (
                    <th key={m.id} className="p-3 text-right w-32 font-medium border-l border-slate-800 bg-slate-900/40 text-slate-300">
                      {m.nombre} '{String(m.año).slice(-2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {Object.keys(dataAgrupadaPorFamilia).map((familia) => [
                  // 1️⃣ FILA SEPARADORA/SUBTÍTULO DE FAMILIA
                  <tr key={`group-${familia}`} className="bg-slate-100/80 font-bold text-slate-700 tracking-wide">
                    <td colSpan={10 + mesesHeaders.length} className="p-2.5 pl-4 border-y border-slate-200">
                      <span className="inline-flex items-center gap-2 text-[11px] uppercase text-slate-900 font-black">
                        <Layers size={13} className="text-purple-600" />
                        FAMILIA: {familia} 
                        <span className="text-[10px] font-normal text-slate-500 normal-case bg-white border border-slate-200 px-2 py-0.5 rounded-full ml-1">
                          {dataAgrupadaPorFamilia[familia].length} {dataAgrupadaPorFamilia[familia].length === 1 ? 'SKU detectado' : 'SKUs detectados'}
                        </span>
                      </span>
                    </td>
                  </tr>,
                  // 2️⃣ FILAS DE PRODUCTOS DE ESTA FAMILIA
                  dataAgrupadaPorFamilia[familia].map((row) => {
                    let colorAlerta = "bg-emerald-50 text-emerald-700 border-emerald-200";
                    if (row.estado === "COMPRAR YA") colorAlerta = "bg-red-50 text-red-700 border-red-200 font-bold animate-pulse";
                    if (row.estado === "POR REVISAR") colorAlerta = "bg-amber-50 text-amber-700 border-amber-200 font-semibold";
                    if (row.estado === "SIN MOVIMIENTO") colorAlerta = "bg-slate-50 text-slate-400 border-slate-200";

                    return (
                      <tr key={row.id} className="hover:bg-slate-50/80 group transition-colors whitespace-nowrap">
                        {/* Código */}
                        <td className="p-3 font-mono text-slate-900 font-bold">
                          <div className="flex items-center gap-2">
                            {row.active ? (
                              <button 
                                onClick={() => deshabilitarYArchivarSku(row.id, row.code)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded transition-all text-slate-400 hover:text-red-600"
                                title="Archivar SKU"
                              >
                                <EyeOff size={12} />
                              </button>
                            ) : (
                              <button 
                                onClick={() => reestablecerSku(row.id, row.code)}
                                className="p-1 bg-amber-100 hover:bg-amber-200 rounded text-amber-800 flex items-center gap-1"
                                title="Restaurar SKU"
                              >
                                <Eye size={12} />
                              </button>
                            )}
                            <span className={!row.active ? "line-through text-slate-400" : ""}>{row.code}</span>
                          </div>
                        </td>

                        {/* Descripción */}
                        <td className="p-3 truncate max-w-[340px] font-medium text-slate-600" title={row.description}>
                          {row.description}
                        </td>

                        {/* Lead Time */}
                        <td className="p-3 text-center font-medium text-slate-500">
                          {row.lead_time}d
                        </td>

                        {/* Stock Físico */}
                        <td className="p-3 text-right font-bold text-slate-900 bg-slate-50/40">
                          {row.stockFisico.toLocaleString()}
                        </td>

                        {/* Arribos */}
                        <td className="p-3 text-right font-medium text-blue-600 bg-blue-50/10">
                          {row.enTránsito > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <Ship size={11} className="text-blue-400" />
                              {row.enTránsito.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-slate-300">---</span>
                          )}
                        </td>

                        {/* Predicción IA */}
                        <td className="p-3 text-right font-bold bg-purple-50/40 text-purple-950 border-r border-purple-100">
                          {row.consumoIA > 0 ? `${Math.round(row.consumoIA).toLocaleString()} u/m` : "0"}
                        </td>

                        {/* Cobertura */}
                        <td className="p-3 text-center bg-slate-50/50">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${colorAlerta}`}>
                            {row.coberturaMeses > 99 ? "∞" : `${row.coberturaMeses.toFixed(1)} m`}
                          </span>
                        </td>

                        {/* Mes Quiebre */}
                        <td className="p-3 text-center font-bold">
                          {row.mesQuiebre === "OK" ? (
                            <span className="text-emerald-600 text-[10px] font-black">OK</span>
                          ) : (
                            <span className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded text-[10px] font-black border border-red-100">{row.mesQuiebre}</span>
                          )}
                        </td>

                        {/* Fecha Límite OC */}
                        <td className="p-3 text-center font-mono font-semibold text-slate-500">
                          {row.fechaLimiteOCStr === "---" ? (
                            <span className="text-slate-300">---</span>
                          ) : (
                            <span className={row.estado === "COMPRAR YA" ? "text-red-600 font-bold" : "text-slate-600"}>
                              {row.fechaLimiteOCStr}
                            </span>
                          )}
                        </td>

                        {/* Sugerido Compra */}
                        <td className="p-3 text-right font-black bg-emerald-50/30 text-emerald-900 border-r border-slate-200">
                          {row.pedidoSugerido > 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <ArrowDownToLine size={12} className="text-emerald-500" />
                              {Math.round(row.pedidoSugerido).toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-slate-300 font-normal">---</span>
                          )}
                        </td>

                        {/* 📅 CELDAS DINÁMICAS DE LOS 12 MESES FUTUROS */}
                        {row.proyeccionesPorMes.map((mesProj: any, idx: number) => {
                          const tieneArribo = mesProj.arriboInyectado > 0;
                          const inventarioCero = mesProj.stockFinal <= 0;

                          return (
                            <td 
                              key={`${row.id}-mes-${idx}`} 
                              className={`p-3 text-right border-l border-slate-100 font-mono transition-all ${
                                inventarioCero 
                                  ? "bg-red-50/70 text-red-700 font-bold" 
                                  : "text-slate-600 font-medium"
                              }`}
                            >
                              <div className="flex flex-col justify-end">
                                <span>{Math.round(mesProj.stockFinal).toLocaleString()}</span>
                                {tieneArribo && (
                                  <span className="text-[9px] text-blue-600 font-bold flex items-center gap-0.5 justify-end mt-0.5" title="Arribo planificado">
                                    +{Math.round(mesProj.arriboInyectado).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                ])}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}