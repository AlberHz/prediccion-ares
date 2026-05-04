"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase"; //
import * as XLSX from "xlsx";
import { 
  CloudUpload, CheckCircle2, AlertCircle, 
  FileSpreadsheet, Loader2, RefreshCcw, Database, ShieldCheck, Zap
} from "lucide-react";

export default function CargarMovimientos() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null, msg: string }>({ type: null, msg: "" });
  const [preview, setPreview] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);

  // 1. NORMALIZACIÓN DE CABECERAS
  const normalizeKey = (str: string) => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, "_"); 
  };

  // 2. PROCESADOR DE ALTO VOLUMEN PARA MOVIMIENTOS
  const processAndCleanData = (rawData: any[]) => {
    return rawData.map((row: any) => {
      const cleanedRow: any = {};
      for (let key in row) {
        const cleanKey = normalizeKey(key);
        let value = row[key];

        if (typeof value === "string") value = value.trim();

        // Manejo de Fechas (PostgreSQL espera YYYY-MM-DD)
        if (cleanKey === "fecha" && typeof value === "number") {
          // Si el Excel trae la fecha como número de serie de Excel
          const date = new Date((value - 25569) * 86400 * 1000);
          value = date.toISOString().split('T')[0];
        }

        // Validación de numéricos (float8 en base de datos)
        if (["cantidad", "costo", "costo_total"].includes(cleanKey)) {
          const num = parseFloat(value);
          value = isNaN(num) ? 0 : num;
        }

        // Código y Tipos como String
        if (["codigo", "tipo_1", "tipo_2", "um"].includes(cleanKey)) {
          value = String(value);
        }

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
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const cleanJson = processAndCleanData(XLSX.utils.sheet_to_json(ws));
      setPreview(cleanJson);
      setStatus({ type: null, msg: "" });
    };
    reader.readAsBinaryString(file);
  };

  // 3. MOTOR DE CARGA MASIVA (BIG DATA)
  const syncWithSupabase = async () => {
    if (preview.length === 0) return;
    setLoading(true);
    setProgress(0);
    setStatus({ type: null, msg: "" });
    
    try {
      // Paso 1: Limpiar tabla actual
      await supabase.from("movimientos").delete().neq("id", -1);

      // Paso 2: Carga en lotes (Aumentamos a 1000 por lote para velocidad)
      const chunkSize = 1000;
      for (let i = 0; i < preview.length; i += chunkSize) {
        const chunk = preview.slice(i, i + chunkSize);
        const { error } = await supabase.from("movimientos").insert(chunk);
        if (error) throw error;
        
        setProgress(Math.min(i + chunkSize, preview.length));
      }

      setStatus({ 
        type: 'success', 
        msg: `Sincronización Exitosa: ${preview.length} movimientos procesados.` 
      });
      setPreview([]);
    } catch (err: any) {
      setStatus({ type: 'error', msg: `Fallo en carga: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      
      {/* HEADER */}
      <div className="bg-white p-8 rounded-sm border border-[#d8e0e5] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-light text-[#1d2d3e]">
            Ingesta de <span className="font-bold text-[#84cc16]">Movimientos</span>
          </h2>
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-yellow-500 fill-yellow-500" />
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
              Motor de alta capacidad optimizado (50k+ filas)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 bg-[#f3f6f8] p-3 rounded-sm border border-[#d8e0e5]">
          <Database size={20} className="text-[#354a5f]" />
          <span className="text-[10px] font-black text-[#354a5f] uppercase tracking-widest leading-none">
            Target: movimientos
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* PANEL DE CONTROL */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white p-6 rounded-sm border border-[#d8e0e5] shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[4px] bg-[#354a5f]" />
            <h3 className="text-[11px] font-black text-[#354a5f] uppercase tracking-widest mb-4">Histórico Almacén</h3>
            
            <label className="group flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-[#d8e0e5] rounded-sm cursor-pointer hover:bg-slate-50 hover:border-[#84cc16] transition-all">
              <CloudUpload className="text-slate-300 group-hover:text-[#84cc16] mb-3 transition-colors" size={36} />
              <p className="text-[10px] font-bold text-slate-400 uppercase text-center px-4">
                Cargar Data Masiva (.xlsx)
              </p>
              <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} />
            </label>
          </div>

          {preview.length > 0 && (
            <button
              onClick={syncWithSupabase}
              disabled={loading}
              className="w-full bg-[#1d2d3e] text-white py-4 rounded-sm font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-md"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="animate-spin" size={16} />
                  <span>{progress} / {preview.length}</span>
                </div>
              ) : (
                <> <RefreshCcw size={18} /> Iniciar Carga Pesada </>
              )}
            </button>
          )}

          {status.type && (
            <div className={`p-4 border-l-4 ${status.type === 'success' ? 'bg-green-50 border-[#84cc16] text-green-700' : 'bg-red-50 border-red-500 text-red-700'}`}>
              <p className="text-[10px] font-bold uppercase">{status.msg}</p>
            </div>
          )}
        </div>

        {/* PANEL DE VISTA PREVIA */}
        <div className="lg:col-span-3 bg-white rounded-sm border border-[#d8e0e5] shadow-sm overflow-hidden flex flex-col">
          <div className="bg-[#354a5f] px-6 py-3 flex justify-between items-center">
            <span className="text-[10px] font-bold text-white uppercase tracking-[0.2em] flex items-center gap-2">
              <FileSpreadsheet size={14} className="text-[#84cc16]" /> 
              Auditoría de Movimientos Registrados
            </span>
            {preview.length > 0 && (
              <span className="text-[9px] bg-[#84cc16] text-white px-3 py-1 rounded-full font-black">
                {preview.length} FILAS EN MEMORIA
              </span>
            )}
          </div>
          
          <div className="flex-1 overflow-auto max-h-[500px]">
            {preview.length > 0 ? (
              <table className="w-full text-[11px] text-left border-collapse">
                <thead className="sticky top-0 bg-white border-b border-[#d8e0e5] z-10">
                  <tr>
                    {Object.keys(preview[0]).map((key) => (
                      <th key={key} className="px-6 py-4 font-black text-[#354a5f] uppercase tracking-tighter bg-[#f3f6f8]">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.slice(0, 50).map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      {Object.values(row).map((val: any, j) => (
                        <td key={j} className="px-6 py-3 text-slate-500 whitespace-nowrap">
                          {val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-20 text-slate-300">
                <p className="text-[11px] font-bold uppercase tracking-[0.3em]">Esperando archivo de Movimientos...</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}