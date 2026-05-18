"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";
import { motion, AnimatePresence } from "framer-motion";
import { Box, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, UploadCloud, ArrowRight } from "lucide-react";
import { cleanStockData, cleanMovementData, RawStockRow, RawMovementRow } from "@/lib/data-cleaner";

export default function CargarDatosPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  
  const [stockCount, setStockCount] = useState<number | null>(null);
  const [movementsCount, setMovementsCount] = useState<number | null>(null);

  const [dataStock, setDataStock] = useState<any[]>([]);
  const [dataMovements, setDataMovements] = useState<any[]>([]);

  // 1. LECTURA Y LIMPIEZA DEL EXCEL
  const handleFileProcessing = (e: React.ChangeEvent<HTMLInputElement>, tipo: "stock" | "movimientos") => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const binaryString = evt.target?.result;
        const workbook = XLSX.read(binaryString, { type: "binary" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet);

        if (tipo === "stock") {
          const resultadoLimpio = cleanStockData(jsonRows as RawStockRow[]);
          setDataStock(resultadoLimpio);
          setStockCount(resultadoLimpio.length);
          setStatus({ type: "success", msg: `${resultadoLimpio.length} registros de catálogo validados y listos en memoria.` });
        } else {
          const resultadoLimpio = cleanMovementData(jsonRows as RawMovementRow[]);
          setDataMovements(resultadoLimpio);
          setMovementsCount(resultadoLimpio.length);
          setStatus({ type: "success", msg: `${resultadoLimpio.length} registros de movimientos validados y listos en memoria.` });
        }
      } catch (err) {
        setStatus({ type: "error", msg: "Error de formato de archivo. Verifica los nombres de las columnas." });
      }
    };
    reader.readAsBinaryString(file);
  };

  // 2. EJECUCIÓN DIRECTA A SUPABASE (Sin servicios externos)
  const handleInyeccionDatos = async () => {
    if (dataStock.length === 0 && dataMovements.length === 0) {
      setStatus({ type: "error", msg: "No se han detectado datos válidos." });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesión inválida o caducada. Por favor, reautentíquese en el sistema.");

      let mensajeExito = "Sincronización Exitosa: ";

      // BLOQUE A: Inyección de Catálogo y Stock Actual
      if (dataStock.length > 0) {
        const productsToUpsert = dataStock.map(item => ({
          user_id: user.id,
          code: item.code,
          description: item.description,
          stock: item.stock,            
          unit: item.unit,
          lead_time: item.lead_time,    
          family: item.family,
          cost: item.cost,
          currency: "USD"
        }));

        const { error: stockError } = await supabase
          .from("products")
          .upsert(productsToUpsert, { onConflict: "user_id, code" });

        if (stockError) throw new Error(`Fallo en Catálogo: ${stockError.message}`);
        mensajeExito += `[${dataStock.length} SKUs actualizados] `;
      }

      // BLOQUE B: Inyección de Historial de Movimientos
      if (dataMovements.length > 0) {
        // Necesitamos pedirle a la base de datos qué IDs tienen los productos de este usuario
        const { data: userProducts, error: fetchError } = await supabase
          .from("products")
          .select("id, code")
          .eq("user_id", user.id);

        if (fetchError) throw new Error(`Fallo al leer catálogo interno: ${fetchError.message}`);
        
        const productMap = new Map<string, string>(userProducts?.map(p => [p.code, p.id]) || []);

        const movementsToInsert = dataMovements
          .filter(item => productMap.has(item.code)) 
          .map(item => ({
            product_id: productMap.get(item.code)!,
            user_id: user.id,
            type: item.type,
            transaction_code: item.transactionCode,
            date: item.date,
            quantity: item.quantity,
            description: item.description 
          }));

        if (movementsToInsert.length === 0) {
          throw new Error("Carga abortada: Ningún código del archivo de movimientos coincide con los SKUs del Maestro.");
        }

        const { error: insertError } = await supabase
          .from("movements")
          .insert(movementsToInsert);

        if (insertError) throw new Error(`Fallo en Kardex: ${insertError.message}`);
        mensajeExito += `[${movementsToInsert.length} movimientos añadidos al historial]`;
      }

      // Éxito total: Limpiar memoria y mostrar mensaje
      setStatus({ type: "success", msg: mensajeExito });
      setDataStock([]);
      setDataMovements([]);
      setStockCount(null);
      setMovementsCount(null);
      
    } catch (error: any) {
      console.error("Error en Inyección:", error);
      setStatus({ type: "error", msg: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8 select-none text-slate-800 antialiased">
      
      <div className="border-b border-slate-100 pb-5">
        <h1 className="text-xl font-bold tracking-tight text-slate-950">Consola de Ingesta y Limpieza de Datos</h1>
        <p className="text-xs text-slate-400 font-medium mt-1">Carga de archivos planos del ERP para el procesamiento y actualización del motor estadístico.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* PANEL STOCK */}
        <div className="border border-slate-200/60 p-6 rounded-xl bg-slate-50 flex flex-col justify-between min-h-[220px]">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Box size={16} className="text-slate-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">1. Reporte de Catálogo y Stock</h3>
            </div>
            <p className="text-[11px] text-slate-400 font-medium leading-relaxed mb-5">
              Requerido para actualizar inventarios base y tiempos de reabastecimiento teóricos. <br />
              Columnas: <span className="font-mono text-slate-500 text-[10px]">CODIGO, DESCRIPCIÓN, STOCK, UND, LEAD_TIME, FAMILIA, COSTO</span>
            </p>
          </div>
          
          <label className="border border-dashed border-slate-300 hover:border-slate-900 bg-white p-5 rounded-lg text-center cursor-pointer block transition-colors group shadow-sm">
            <UploadCloud size={20} className="mx-auto text-slate-400 group-hover:text-slate-900 mb-2 transition-colors" />
            <span className="text-[11px] font-bold text-slate-600 group-hover:text-slate-900 transition-colors block">
              {stockCount ? `✓ ${stockCount} filas en memoria` : "Subir archivo de Stock"}
            </span>
            <input type="file" accept=".xlsx, .xls, .csv" onChange={(e) => handleFileProcessing(e, "stock")} className="hidden" />
          </label>
        </div>

        {/* PANEL MOVIMIENTOS */}
        <div className="border border-slate-200/60 p-6 rounded-xl bg-slate-50 flex flex-col justify-between min-h-[220px]">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileSpreadsheet size={16} className="text-slate-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">2. Kardex de Movimientos</h3>
            </div>
            <p className="text-[11px] text-slate-400 font-medium leading-relaxed mb-5">
              Historial de consumos e ingresos mensuales de la planta. <br />
              Columnas: <span className="font-mono text-slate-500 text-[10px]">CT (NI/NS), TD, FECHA, CODIGO, DESCRIPCIÓN, CANTIDAD</span>
            </p>
          </div>
          
          <label className="border border-dashed border-slate-300 hover:border-slate-900 bg-white p-5 rounded-lg text-center cursor-pointer block transition-colors group shadow-sm">
            <UploadCloud size={20} className="mx-auto text-slate-400 group-hover:text-slate-900 mb-2 transition-colors" />
            <span className="text-[11px] font-bold text-slate-600 group-hover:text-slate-900 transition-colors block">
              {movementsCount ? `✓ ${movementsCount} filas en memoria` : "Subir archivo de Movimientos"}
            </span>
            <input type="file" accept=".xlsx, .xls, .csv" onChange={(e) => handleFileProcessing(e, "movimientos")} className="hidden" />
          </label>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {status && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className={`p-4 rounded-xl flex items-start gap-3 border text-xs font-medium shadow-sm ${
              status.type === "success" 
                ? "bg-emerald-50 border-emerald-200 text-emerald-950" 
                : "bg-red-50 border-red-200/60 text-red-950"
            }`}
          >
            {status.type === "success" ? (
              <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
            )}
            <div className="leading-relaxed">{status.msg}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-end pt-2 border-t border-slate-100">
        <button
          disabled={loading || (dataStock.length === 0 && dataMovements.length === 0)}
          onClick={handleInyeccionDatos}
          className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 text-white font-semibold text-xs px-6 py-3 rounded-lg flex items-center gap-2 tracking-wide transition-all active:scale-[0.99] shadow-md shadow-slate-900/10 cursor-pointer"
        >
          {loading ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              Sincronizando con Supabase...
            </>
          ) : (
            <>
              Procesar e Inyectar Datos
              <ArrowRight size={13} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}