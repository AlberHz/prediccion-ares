"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase"; // Tu configuración
import * as XLSX from "xlsx";
import { 
  CloudUpload, CheckCircle2, AlertCircle, 
  FileSpreadsheet, Loader2, RefreshCcw, Box, ShieldCheck, Database
} from "lucide-react";

export default function CargarSuministros() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null, msg: string }>({ type: null, msg: "" });
  const [preview, setPreview] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);

  // 1. NORMALIZACIÓN ROBUSTA (Mismo estándar que Importaciones y MP)
  const normalizeKey = (str: string) => {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "_"); 
  };

  const processAndCleanData = (rawData: any[]) => {
    return rawData.map((row: any) => {
      const cleanedRow: any = {};
      for (let key in row) {
        const cleanKey = normalizeKey(key);
        let value = row[key];

        if (typeof value === "string") value = value.trim();

        // Validación de tipos numéricos para suministros
        if (cleanKey === "stock" || cleanKey === "lead_time") {
          const num = parseFloat(value);
          value = isNaN(num) ? 0 : num;
        }

        if (cleanKey === "codigo") value = String(value);

        cleanedRow[cleanKey] = value;
      }
      return cleanedRow;
    }).filter(row => row.codigo && row.codigo !== "");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const cleanJson = processAndCleanData(XLSX.utils.sheet_to_json(ws));
        
        setPreview(cleanJson);
        setStatus({ type: null, msg: "" });
      } catch (err) {
        setStatus({ type: 'error', msg: "Error al procesar el archivo de Suministros." });
      }
    };
    reader.readAsBinaryString(file);
  };

  // 2. SINCRONIZACIÓN DE ALTO RENDIMIENTO (BATCHING)
  const syncWithSupabase = async () => {
    if (preview.length === 0) return;
    setLoading(true);
    setProgress(0);
    setStatus({ type: null, msg: "" });
    
    try {
      // Paso 1: Borrar registros actuales de suministros
      const { error: deleteError } = await supabase
        .from("sum_maestro")
        .delete()
        .neq("codigo", "SYS_RESERVED");

      if (deleteError) throw deleteError;

      // Paso 2: Carga en lotes de 500 para evitar saturación
      const chunkSize = 500;
      for (let i = 0; i < preview.length; i += chunkSize) {
        const chunk = preview.slice(i, i + chunkSize);
        const { error } = await supabase.from("sum_maestro").insert(chunk);
        if (error) throw error;
        
        setProgress(Math.min(i + chunkSize, preview.length));
      }

      setStatus({ 
        type: 'success', 
        msg: `Éxito: ${preview.length} suministros actualizados en el sistema.` 
      });
      setPreview([]);
    } catch (err: any) {
      console.error("Error Suministros:", err);
      setStatus({ type: 'error', msg: `Error de Base de Datos: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      
      {/* HEADER: Diseño establecido ARES */}
      <div className="bg-white p-8 rounded-sm border border-[#d8e0e5] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-light text-[#1d2d3e]">
            Gestión Maestro <span className="font-bold text-[#84cc16]">Suministros</span>
          </h2>
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-[#0070d2]" />
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
              Normalización de insumos indirectos activa
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 bg-[#f3f6f8] p-3 rounded-sm border border-[#d8e0e5]">
          <Database size={20} className="text-[#354a5f]" />
          <span className="text-[10px] font-black text-[#354a5f] uppercase tracking-widest leading-none">
            Target: sum_maestro
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* PANEL IZQUIERDO: Carga de Archivo */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white p-6 rounded-sm border border-[#d8e0e5] shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[4px] bg-[#354a5f]" />
            <h3 className="text-[11px] font-black text-[#354a5f] uppercase tracking-widest mb-4">Reporte Indirectos</h3>
            
            <label className="group flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-[#d8e0e5] rounded-sm cursor-pointer hover:bg-slate-50 hover:border-[#84cc16] transition-all">
              <CloudUpload className="text-slate-300 group-hover:text-[#84cc16] mb-3 transition-colors" size={36} />
              <p className="text-[10px] font-bold text-slate-400 uppercase text-center px-4">
                Cargar Maestro Suministros
              </p>
              <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} />
            </label>
          </div>

          {preview.length > 0 && (
            <button
              onClick={syncWithSupabase}
              disabled={loading}
              className="w-full bg-[#1d2d3e] hover:bg-[#354a5f] text-white py-4 rounded-sm font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-md transition-all disabled:opacity-50"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="animate-spin" size={16} />
                  <span>{progress} / {preview.length}</span>
                </div>
              ) : (
                <> <RefreshCcw size={18} /> Sincronizar Suministros </>
              )}
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

        {/* PANEL DERECHO: Previsualización */}
        <div className="lg:col-span-3 bg-white rounded-sm border border-[#d8e0e5] shadow-sm overflow-hidden flex flex-col">
          <div className="bg-[#354a5f] px-6 py-3 flex justify-between items-center">
            <span className="text-[10px] font-bold text-white uppercase tracking-[0.2em] flex items-center gap-2">
              <FileSpreadsheet size={14} className="text-[#84cc16]" /> 
              Auditoría de Insumos Indirectos
            </span>
            {preview.length > 0 && (
              <span className="text-[9px] bg-[#84cc16] text-white px-3 py-1 rounded-full font-black">
                {preview.length} ITEMS DETECTADOS
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
                <p className="text-[11px] font-bold uppercase tracking-[0.3em]">Esperando archivo de Suministros...</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}