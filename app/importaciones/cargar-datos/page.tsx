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

  // 2. EJECUCIÓN DIRECTA A SUPABASE
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

      // ==========================================
      // BLOQUE A: Actualización selectiva de Catálogo (Stock y Familia vs Producto Nuevo)
      // ==========================================
      if (dataStock.length > 0) {
        const codigosSubidos = dataStock.map(item => String(item.code).trim());

        // Identificar qué productos ya existen en Supabase para este usuario específico
        const { data: productosExistentes, error: fetchExistentesError } = await supabase
          .from("products")
          .select("code")
          .eq("user_id", user.id)
          .in("code", codigosSubidos);

        if (fetchExistentesError) throw new Error(`Error al verificar duplicados: ${fetchExistentesError.message}`);

        const setExistentes = new Set(productosExistentes?.map(p => String(p.code).trim()) || []);

        const productosNuevosToInsert: any[] = [];
        const productosExistentesToUpdate: any[] = [];

        dataStock.forEach(item => {
          const codigoLimpio = String(item.code).trim();
          
          if (setExistentes.has(codigoLimpio)) {
            // REQUERIMIENTO 1: Si ya existe en la Base de Datos, SOLO modificamos stock y familia
            productosExistentesToUpdate.push({
              user_id: user.id,
              code: codigoLimpio,
              stock: item.stock,
              family: item.family
            });
          } else {
            // REQUERIMIENTO 1: Si es un producto NUEVO, se insertan todos los campos (Sin incluir costo)
            productosNuevosToInsert.push({
              user_id: user.id,
              code: codigoLimpio,
              description: item.description,
              stock: item.stock,            
              unit: item.unit,
              family: item.family,
              currency: "USD"
            });
          }
        });

        // Inyección de ítems completamente nuevos
        if (productosNuevosToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from("products")
            .insert(productosNuevosToInsert);

          if (insertError) throw new Error(`Fallo al registrar productos nuevos: ${insertError.message}`);
        }

        // Actualización parcial controlada de ítems existentes
        if (productosExistentesToUpdate.length > 0) {
          const { error: updateError } = await supabase
            .from("products")
            .upsert(productosExistentesToUpdate, {
              onConflict: "user_id,code",
              ignoreDuplicates: false
            });

          if (updateError) throw new Error(`Fallo al actualizar stock/familia del catálogo: ${updateError.message}`);
        }

        mensajeExito += `[${productosNuevosToInsert.length} SKUs creados, ${productosExistentesToUpdate.length} Stocks/Familias actualizados] `;
      }

      // ==========================================
      // BLOQUE B: Inyección Masiva de Movimientos (FILTRADO POR MAESTRO Y SUBIDA DIRECTA)
      // ==========================================
      if (dataMovements.length > 0) {
        // Traemos todo el catálogo actual del usuario desde Supabase
        const { data: userProducts, error: fetchError } = await supabase
          .from("products")
          .select("id, code")
          .eq("user_id", user.id);

        if (fetchError) throw new Error(`Fallo al leer catálogo interno: ${fetchError.message}`);
        
        const productMap = new Map<string, string>(
          userProducts?.map(p => [String(p.code).trim(), p.id]) || []
        );

        // REQUERIMIENTO MODIFICADO: Filtra y mapea solo los movimientos cuyo código exista en el mapa. El resto se ignora.
        const movementsToInsert = dataMovements
          .filter(item => productMap.has(String(item.code).trim())) 
          .map(item => ({
            product_id: productMap.get(String(item.code).trim())!,
            user_id: user.id,
            type: item.type,
            transaction_code: item.transactionCode,
            date: item.date,
            quantity: item.quantity,
            description: item.description 
          }));

        // Si después de filtrar no queda ningún movimiento válido, avisamos de manera limpia en vez de romper el flujo
        if (movementsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from("movements")
            .insert(movementsToInsert);

          if (insertError) throw new Error(`Fallo en Kardex: ${insertError.message}`);
          mensajeExito += `[${movementsToInsert.length} nuevos movimientos inyectados]`;
        } else {
          mensajeExito += `[0 movimientos nuevos: no coincidieron códigos con el Maestro]`;
        }
      }

      setStatus({ type: "success", msg: mensajeExito });
      setDataStock([]);
      setDataMovements([]);
      setStockCount(null);
      setMovementsCount(null);
      
    } catch (error: any) {
      console.error("Error en Inyección:", error);
      setStatus({ type: "error", msg: error.message });
    } finally {
      loading;
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8 select-none text-slate-800 antialiased">
      
      <div className="border-b border-slate-100 pb-5">
        <h1 className="text-xl font-bold tracking-tight text-slate-950">Consola de Ingesta y Limpieza de Datos</h1>
        <p className="text-xs text-slate-400 font-medium mt-1">Carga de archivos planos del ERP para el procesamiento y actualización del motor de inventario.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* PANEL STOCK */}
        <div className="border border-slate-200/60 p-6 rounded-xl bg-slate-50 flex flex-col justify-between min-h-[220px]">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Box size={16} className="text-slate-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">1. Reporte de Catálogo (Actualizar Stock y Familia)</h3>
            </div>
            <p className="text-[11px] text-slate-400 font-medium leading-relaxed mb-5">
              Requerido para sobreescribir los inventarios base y familias de forma segura. <br />
              Columnas: <span className="font-mono text-slate-500 text-[10px]">CODIGO, DESCRIPCIÓN, STOCK, UND, FAMILIA</span>
            </p>
          </div>
          
          <label className="border border-dashed border-slate-300 hover:border-slate-900 bg-white p-5 rounded-lg text-center cursor-pointer block transition-colors group shadow-sm">
            <UploadCloud size={20} className="mx-auto text-slate-400 group-hover:text-slate-900 mb-2 transition-colors" />
            <span className="text-[11px] font-bold text-slate-600 group-hover:text-slate-900 transition-colors block">
              {stockCount ? `✓ ${stockCount} SKUs validados` : "Subir archivo de Stock"}
            </span>
            <input type="file" accept=".xlsx, .xls, .csv" onChange={(e) => handleFileProcessing(e, "stock")} className="hidden" />
          </label>
        </div>

        {/* PANEL MOVIMIENTOS */}
        <div className="border border-slate-200/60 p-6 rounded-xl bg-slate-50 flex flex-col justify-between min-h-[220px]">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileSpreadsheet size={16} className="text-slate-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">2. Kardex de Movimientos (Insertar Historial)</h3>
            </div>
            <p className="text-[11px] text-slate-400 font-medium leading-relaxed mb-5">
              Añade de forma incremental los nuevos consumos e ingresos mensuales. <br />
              Columnas: <span className="font-mono text-slate-500 text-[10px]">CT (NI/NS), TD, FECHA, CODIGO, DESCRIPCIÓN, CANTIDAD</span>
            </p>
          </div>
          
          <label className="border border-dashed border-slate-300 hover:border-slate-900 bg-white p-5 rounded-lg text-center cursor-pointer block transition-colors group shadow-sm">
            <UploadCloud size={20} className="mx-auto text-slate-400 group-hover:text-slate-900 mb-2 transition-colors" />
            <span className="text-[11px] font-bold text-slate-600 group-hover:text-slate-900 transition-colors block">
              {movementsCount ? `✓ ${movementsCount} movimientos listos` : "Subir archivo de Movimientos"}
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
              Procesando base de datos...
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