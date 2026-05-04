"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase"; 
import * as XLSX from "xlsx";
import { 
  CloudUpload, CheckCircle2, AlertCircle, 
  FileSpreadsheet, Loader2, RefreshCcw, Box, ShieldCheck, Database
} from "lucide-react";

export default function CargarImportaciones() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null, msg: string }>({ type: null, msg: "" });
  const [preview, setPreview] = useState<any[]>([]);

  // 1. FUNCIÓN DE NORMALIZACIÓN (Elimina tildes, espacios locos y mayúsculas)
  const normalizeKey = (str: string) => {
    return str
      .normalize("NFD")                  // Descompone caracteres (é -> e + ´)
      .replace(/[\u0300-\u036f]/g, "")   // Borra los acentos
      .toLowerCase()                     // Todo a minúsculas
      .trim()                            // Quita espacios extremos
      .replace(/\s+/g, "_");             // Cambia espacios internos por "_" (ej: "Lead Time" -> "lead_time")
  };

  // 2. PROCESADOR ROBUSTO DE DATOS
  const processAndCleanData = (rawData: any[]) => {
    return rawData
      .map((row: any) => {
        const cleanedRow: any = {};
        
        for (let key in row) {
          const cleanKey = normalizeKey(key);
          let value = row[key];

          // Limpieza de strings (evitar espacios accidentales en descripciones o códigos)
          if (typeof value === "string") {
            value = value.trim();
          }

          // Validación de Tipos Numéricos (Para evitar errores de Schema en stock y lead_time)
          if (cleanKey === "stock" || cleanKey === "lead_time") {
            const num = parseFloat(value);
            value = isNaN(num) ? 0 : num;
          }

          // Asegurar que el código sea tratado como texto (evita que "00123" sea 123)
          if (cleanKey === "codigo") {
            value = String(value);
          }

          cleanedRow[cleanKey] = value;
        }
        return cleanedRow;
      })
      // Filtro de seguridad: Ignorar filas donde el código sea nulo o vacío
      .filter(row => row.codigo && row.codigo !== "undefined" && row.codigo !== "");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        const rawJson = XLSX.utils.sheet_to_json(ws);
        const cleanJson = processAndCleanData(rawJson);
        
        setPreview(cleanJson);
        setStatus({ type: null, msg: "" });
      } catch (err) {
        setStatus({ type: 'error', msg: "Error al leer el archivo Excel." });
      }
    };
    reader.readAsBinaryString(file);
  };

  const syncWithSupabase = async () => {
    if (preview.length === 0) return;
    setLoading(true);
    setStatus({ type: null, msg: "" });
    
    try {
      // Pasó 1: Limpiar tabla destino (Truncate lógico)
      const { error: deleteError } = await supabase
        .from("imp_maestro")
        .delete()
        .neq("codigo", "RESERVED_INTERNAL_ID"); 

      if (deleteError) throw deleteError;

      // Paso 2: Inserción Masiva
      const { error: insertError } = await supabase
        .from("imp_maestro")
        .insert(preview);
      
      if (insertError) throw insertError;

      setStatus({ 
        type: 'success', 
        msg: `Sincronización exitosa: ${preview.length} artículos normalizados y cargados.` 
      });
      setPreview([]);
    } catch (err: any) {
      console.error("Detalle Error:", err);
      setStatus({ type: 'error', msg: `Error de Integridad: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      
      {/* HEADER DE MÓDULO */}
      <div className="bg-white p-8 rounded-sm border border-[#d8e0e5] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-light text-[#1d2d3e]">
            Ingesta de <span className="font-bold text-[#84cc16]">Importaciones</span>
          </h2>
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-[#0070d2]" />
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
              Normalizador de caracteres y limpieza de tipos activo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 bg-[#f3f6f8] p-3 rounded-sm border border-[#d8e0e5]">
          <Database size={20} className="text-[#354a5f]" />
          <span className="text-[10px] font-black text-[#354a5f] uppercase tracking-widest leading-none">
            Target: imp_maestro
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* PANEL DE CARGA */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white p-6 rounded-sm border border-[#d8e0e5] shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[4px] bg-[#354a5f]" />
            <h3 className="text-[11px] font-black text-[#354a5f] uppercase tracking-widest mb-4">Fuente de Datos</h3>
            
            <label className="group flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-[#d8e0e5] rounded-sm cursor-pointer hover:bg-slate-50 hover:border-[#84cc16] transition-all">
              <CloudUpload className="text-slate-300 group-hover:text-[#84cc16] mb-3 transition-colors" size={36} />
              <p className="text-[10px] font-bold text-slate-400 uppercase text-center px-4">
                Seleccionar Maestro (.xlsx)
              </p>
              <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} />
            </label>
          </div>

          {preview.length > 0 && (
            <button
              onClick={syncWithSupabase}
              disabled={loading}
              className="w-full bg-[#1d2d3e] hover:bg-[#354a5f] text-white py-4 rounded-sm font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-md transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <RefreshCcw size={18} />}
              Sincronizar Datos Limpios
            </button>
          )}

          {status.type && (
            <div className={`p-4 border-l-4 animate-in slide-in-from-left-4 ${status.type === 'success' ? 'bg-green-50 border-[#84cc16] text-green-700' : 'bg-red-50 border-red-500 text-red-700'}`}>
              <div className="flex items-center gap-3">
                {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <p className="text-[10px] font-bold uppercase tracking-tight leading-snug">{status.msg}</p>
              </div>
            </div>
          )}
        </div>

        {/* VISTA PREVIA / AUDITORÍA */}
        <div className="lg:col-span-3 bg-white rounded-sm border border-[#d8e0e5] shadow-sm overflow-hidden flex flex-col">
          <div className="bg-[#354a5f] px-6 py-3 flex justify-between items-center">
            <span className="text-[10px] font-bold text-white uppercase tracking-[0.2em] flex items-center gap-2">
              <FileSpreadsheet size={14} className="text-[#84cc16]" /> 
              Registros procesados para carga
            </span>
            {preview.length > 0 && (
              <span className="text-[9px] bg-[#84cc16] text-white px-3 py-1 rounded-full font-black">
                {preview.length} FILAS LISTAS
              </span>
            )}
          </div>
          
          <div className="flex-1 overflow-auto max-h-[500px]">
            {preview.length > 0 ? (
              <table className="w-full text-[11px] text-left border-collapse">
                <thead className="sticky top-0 bg-white border-b border-[#d8e0e5] z-10 shadow-sm">
                  <tr>
                    {Object.keys(preview[0]).map((key) => (
                      <th key={key} className="px-6 py-4 font-black text-[#354a5f] uppercase tracking-tighter bg-[#f3f6f8]">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.slice(0, 100).map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      {Object.values(row).map((val: any, j) => (
                        <td key={j} className="px-6 py-3 text-slate-500 font-medium whitespace-nowrap">
                          {val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-20 text-slate-300">
                <Box size={64} strokeWidth={1} className="opacity-10 mb-4" />
                <p className="text-[11px] font-bold uppercase tracking-[0.3em]">Esperando archivo para normalizar...</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}