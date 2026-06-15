"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Search, AlertTriangle, Octagon, CalendarClock, ListFilter, ArrowDownToLine, Ship } from "lucide-react";

export default function ModuloAlertasMaestras() {
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroFamilia, setFiltroFamilia] = useState("TODOS");
  
  // Estado para alternar entre tarjetas de KPI ("TODOS" o la alerta seleccionada)
  const [alertaFiltroActivo, setAlertaFiltroActivo] = useState<string>("TODOS");

  // 🗓️ CONFIGURACIÓN DE FECHA 100% DINÁMICA BASADA EN TU MODELO DE PREDICCIONES
  const fechaActualComputada = useMemo(() => new Date(), []);
  const AÑO_ACTUAL = fechaActualComputada.getFullYear();
  const MES_ACTUAL_JS = fechaActualComputada.getMonth();

  const DOCUMENTOS_SALIDA = ["NS", "22", "23", "93", "TD"];

  useEffect(() => {
    let isMounted = true;
    
    async function fetchDataReal() {
      try {
        // 🎯 CORRECCIÓN CRÍTICA: Traer ÚNICAMENTE productos activos directamente desde el query
        const { data: dbProducts, error: errProd } = await supabase
          .from("products")
          .select("id, code, description, family, lead_time, stock, active, custom_average_consumption")
          .eq("active", true);

        const { data: dbArrivals, error: errArr } = await supabase
          .from("arrivals")
          .select("*")
          .eq("status", "PENDIENTE"); // Filtro optimizado de tu tabla

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

        // Mapeo indexado para optimizar velocidad del bucle
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
            stockFisico: Number(p.stock || 0),
            custom_average_consumption: parseInt(p.custom_average_consumption) || 0,
            movimientos: movsByProduct[productUUID] || [],
            arribos: arrivalsByProduct[productUUID] || []
          };
        });

        setProductos(datosConsolidados);
      } catch (err) {
        console.error("Error sincronizando alertas Ares:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchDataReal();
    return () => { isMounted = false; };
  }, []);

  // 🗓️ CABECERAS AUXILIARES PARA EL MOTOR LOGÍSTICO (12 MESES)
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

  // 🧠 MOTOR DE PROCESAMIENTO MATEMÁTICO IDÉNTICO A TU MÓDULO DE PREDICCIONES
  const productosAnalizados = useMemo(() => {
    return productos.map(item => {
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

      // Clasificación exacta de tu regla de negocio
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
        consumoIA: demandaPredichaFinal, 
        coberturaMeses,
        mesQuiebre: quiebreRealDetectado ? mesQuiebreCalculado : "OK",
        fechaLimiteOCStr: quiebreRealDetectado ? fechaLimiteOC.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : "---",
        pedidoSugerido: quiebreRealDetectado ? sugeridoCompra : 0, 
        estado: estadoAbastecimiento
      };
    });
  }, [productos, mesesHeaders, AÑO_ACTUAL, MES_ACTUAL_JS]);

  // 📊 CONTEXTO GLOBAL DE CANTIDADES (Para las Tarjetas KPI)
  const conteoAlertasGlobales = useMemo(() => {
    let comprarYa = 0;
    let porRevisar = 0;
    let stockOk = 0;

    productosAnalizados.forEach(p => {
      if (p.estado === "COMPRAR YA") comprarYa++;
      else if (p.estado === "POR REVISAR") porRevisar++;
      else if (p.estado === "STOCK OK") stockOk++;
    });

    return { comprarYa, porRevisar, stockOk };
  }, [productosAnalizados]);

  // 🔍 FILTRADO DINÁMICO EXCLUSIVO DE COBERTURA Y EXCEPCIONES
  const productosFiltradosAlertas = useMemo(() => {
    return productosAnalizados.filter(p => {
      // Exclusión estricta de SKUs sanos o muertos si no hay filtro asignado
      if (alertaFiltroActivo === "TODOS" && (p.estado === "STOCK OK" || p.estado === "SIN MOVIMIENTO")) {
        return false;
      }

      const cumpleTexto = !search.trim() || 
                           p.code.toLowerCase().includes(search.toLowerCase()) || 
                           p.description.toLowerCase().includes(search.toLowerCase());
      const cumpleFamilia = filtroFamilia === "TODOS" || p.family === filtroFamilia;
      const cumpleAlertaCard = alertaFiltroActivo === "TODOS" || p.estado === alertaFiltroActivo;

      return cumpleTexto && cumpleFamilia && cumpleAlertaCard;
    });
  }, [productosAnalizados, search, filtroFamilia, alertaFiltroActivo]);

  const familiasUnicas = useMemo(() => {
    return Array.from(new Set(productos.map(p => p.family).filter(Boolean)));
  }, [productos]);

  if (loading) return (
    <div className="min-h-[60vh] flex items-center justify-center bg-[#f8fafc]">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando Estado Maestro de Alertas Ares...</p>
      </div>
    </div>
  );

  return (
    <div className="bg-[#f8fafc] p-4 sm:p-6 rounded-2xl border border-slate-200 space-y-5 w-full text-slate-800 antialiased">
      
      {/* 🚨 KPIN DE EXCEPCIONES LOGÍSTICAS */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center px-1">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Dashboard de Riesgos y Abastecimiento Crítico (Solo Activos)</span>
          {alertaFiltroActivo !== "TODOS" && (
            <button 
              onClick={() => setAlertaFiltroActivo("TODOS")}
              className="text-[9px] bg-slate-200 text-slate-700 hover:bg-slate-300 font-extrabold px-2 py-0.5 rounded transition-all"
            >
              🔄 VER TODOS LOS RIESGOS
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {/* Tarjeta COMPRAR YA */}
          <div 
            onClick={() => setAlertaFiltroActivo(alertaFiltroActivo === "COMPRAR YA" ? "TODOS" : "COMPRAR YA")}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              alertaFiltroActivo === "COMPRAR YA" 
                ? "bg-red-600 border-red-700 text-white shadow-md scale-[1.02]" 
                : "bg-white border-red-200 hover:bg-red-50/50"
            }`}
          >
            <div className="flex justify-between items-start">
              <span className={`text-[10px] font-black uppercase tracking-wider ${alertaFiltroActivo === "COMPRAR YA" ? "text-red-100" : "text-red-600"}`}>1. Comprar Ya</span>
              <Octagon size={14} className={alertaFiltroActivo === "COMPRAR YA" ? "text-white" : "text-red-600"} />
            </div>
            <p className={`text-2xl font-black mt-1 ${alertaFiltroActivo === "COMPRAR YA" ? "text-white" : "text-slate-900"}`}>{conteoAlertasGlobales.comprarYa}</p>
            <span className={`text-[8px] block font-semibold mt-1 ${alertaFiltroActivo === "COMPRAR YA" ? "text-red-200" : "text-slate-400"}`}>Quiebre inminente o fecha límite OC vencida</span>
          </div>

          {/* Tarjeta POR REVISAR */}
          <div 
            onClick={() => setAlertaFiltroActivo(alertaFiltroActivo === "POR REVISAR" ? "TODOS" : "POR REVISAR")}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              alertaFiltroActivo === "POR REVISAR" 
                ? "bg-amber-600 border-amber-700 text-white shadow-md scale-[1.02]" 
                : "bg-white border-amber-200 hover:bg-amber-50/50"
            }`}
          >
            <div className="flex justify-between items-start">
              <span className={`text-[10px] font-black uppercase tracking-wider ${alertaFiltroActivo === "POR REVISAR" ? "text-amber-100" : "text-amber-700"}`}>2. Por Revisar</span>
              <AlertTriangle size={14} className={alertaFiltroActivo === "POR REVISAR" ? "text-white" : "text-amber-600"} />
            </div>
            <p className={`text-2xl font-black mt-1 ${alertaFiltroActivo === "POR REVISAR" ? "text-white" : "text-slate-900"}`}>{conteoAlertasGlobales.porRevisar}</p>
            <span className={`text-[8px] block font-semibold mt-1 ${alertaFiltroActivo === "POR REVISAR" ? "text-amber-200" : "text-slate-400"}`}>Cobertura menor al Lead Time + 1 mes</span>
          </div>

          {/* Tarjeta STOCK OK (Oculta por defecto en la tabla maestra excepto bajo filtro manual) */}
          <div 
            onClick={() => setAlertaFiltroActivo(alertaFiltroActivo === "STOCK OK" ? "TODOS" : "STOCK OK")}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              alertaFiltroActivo === "STOCK OK" 
                ? "bg-emerald-600 border-emerald-700 text-white shadow-md scale-[1.02]" 
                : "bg-white border-slate-200 hover:bg-emerald-50/30"
            }`}
          >
            <div className="flex justify-between items-start">
              <span className={`text-[10px] font-black uppercase tracking-wider ${alertaFiltroActivo === "STOCK OK" ? "text-emerald-100" : "text-slate-500"}`}>3. SKUs Abastecidos</span>
              <span className={`text-[9px] font-bold ${alertaFiltroActivo === "STOCK OK" ? "text-white" : "text-emerald-600"}`}>STOCK OK</span>
            </div>
            <p className={`text-2xl font-black mt-1 ${alertaFiltroActivo === "STOCK OK" ? "text-white" : "text-slate-900"}`}>{conteoAlertasGlobales.stockOk}</p>
            <span className={`text-[8px] block font-semibold mt-1 ${alertaFiltroActivo === "STOCK OK" ? "text-emerald-200" : "text-slate-400"}`}>Flujo seguro de inventario a largo plazo</span>
          </div>
        </div>
      </div>

      {/* SECTOR FILTROS */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-8 relative">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Buscador Especializado</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Filtrar por SKU o palabra clave..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:bg-white focus:border-purple-600 transition-all text-slate-900"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="md:col-span-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Filtrar por Línea/Familia</label>
            <select
              value={filtroFamilia}
              onChange={(e) => setFiltroFamilia(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none text-slate-700 cursor-pointer appearance-none"
            >
              <option value="TODOS">TODAS LAS FAMILIAS</option>
              {familiasUnicas.map((f, idx) => (
                <option key={idx} value={f}>{f.toUpperCase()}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 📋 TABLA MAESTRA DE RIESGOS LOGÍSTICOS */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListFilter size={14} className="text-purple-600" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
              {alertaFiltroActivo === "STOCK OK" ? "Monitor de Control Operativo Seguros" : "Monitoreo de Excepciones de Compra Prioritarias"} ({productosFiltradosAlertas.length})
            </h3>
          </div>
          <span className="text-[9px] bg-purple-100 text-purple-800 font-extrabold px-2 py-0.5 rounded-sm">
            MOTOR LOGÍSTICO PREDICTIVO ARES V2
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-[9px] font-black uppercase tracking-wider text-slate-500">
                <th className="p-3">Código SKU</th>
                <th className="p-3">Descripción</th>
                <th className="p-3">Línea/Familia</th>
                <th className="p-3 text-center">Lead Time</th>
                <th className="p-3 text-right">Stock Físico</th>
                <th className="p-3 text-right">En Tránsito</th>
                <th className="p-3 text-right">Predicción Consumo</th>
                <th className="p-3 text-center">Cobertura</th>
                <th className="p-3 text-center">Mes Quiebre</th>
                <th className="p-3 text-center">Fecha Límite OC</th>
                <th className="p-3 text-right">Pedido Sugerido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {productosFiltradosAlertas.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400 font-bold uppercase tracking-wide text-[10px]">
                    👌 Ningún SKU califica bajo este estado crítico actualmente. ¡Stock en orden!
                  </td>
                </tr>
              ) : (
                productosFiltradosAlertas.map((row) => {
                  let alertBadge = "bg-emerald-500 text-white";
                  if (row.estado === "COMPRAR YA") alertBadge = "bg-red-600 text-white animate-pulse font-black";
                  if (row.estado === "POR REVISAR") alertBadge = "bg-amber-500 text-white font-bold";

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Código */}
                      <td className="p-3 font-mono font-bold text-slate-900 tracking-tight">{row.code}</td>
                      
                      {/* Descripción */}
                      <td className="p-3 text-slate-600 max-w-[240px] truncate font-medium" title={row.description}>
                        {row.description}
                      </td>
                      
                      {/* Familia */}
                      <td className="p-3">
                        <span className="text-[9px] bg-slate-100 font-bold px-2 py-0.5 rounded text-slate-600">
                          {row.family}
                        </span>
                      </td>
                      
                      {/* Lead Time */}
                      <td className="p-3 text-center font-semibold text-slate-500">{row.lead_time}d</td>
                      
                      {/* Stock */}
                      <td className="p-3 text-right font-bold text-slate-900 bg-slate-50/30">
                        {row.stockFisico.toLocaleString()}
                      </td>
                      
                      {/* Arribos */}
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
                      
                      {/* Consumo Predicho */}
                      <td className="p-3 text-right font-bold text-purple-950 bg-purple-50/20">
                        {row.consumoIA > 0 ? `${Math.round(row.consumoIA).toLocaleString()} u/m` : "0"}
                      </td>
                      
                      {/* Cobertura */}
                      <td className="p-3 text-center">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide block w-fit mx-auto ${alertBadge}`}>
                          {row.coberturaMeses > 99 ? "∞" : `${row.coberturaMeses.toFixed(1)} m`}
                        </span>
                      </td>
                      
                      {/* Mes Quiebre */}
                      <td className="p-3 text-center font-bold">
                        {row.mesQuiebre === "OK" ? (
                          <span className="text-emerald-600 font-black text-[10px]">OK</span>
                        ) : (
                          <span className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded text-[10px] font-black border border-red-100">
                            {row.mesQuiebre}
                          </span>
                        )}
                      </td>
                      
                      {/* Fecha Límite OC */}
                      <td className="p-3 text-center font-mono font-bold text-slate-600">
                        {row.fechaLimiteOCStr === "---" ? (
                          <span className="text-slate-300">---</span>
                        ) : (
                          <span className={row.estado === "COMPRAR YA" ? "text-red-600" : "text-slate-700"}>
                            {row.fechaLimiteOCStr}
                          </span>
                        )}
                      </td>
                      
                      {/* Pedido Sugerido */}
                      <td className="p-3 text-right font-black bg-emerald-50/20 text-emerald-950">
                        {row.pedidoSugerido > 0 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-black">
                            <ArrowDownToLine size={12} className="text-emerald-500" />
                            {Math.round(row.pedidoSugerido).toLocaleString()}
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