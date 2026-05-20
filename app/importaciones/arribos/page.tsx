"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Ship, Plus, Trash2, Calendar, Hash, Search, AlertCircle, Check, Edit2, Save, X } from "lucide-react";

/**
 * ARES SYSTEM - MÓDULO DE GESTIÓN DE ARRIBOS (COMPILACIÓN CORREGIDA)
 * - Nueva disposición vertical (Formulario arriba, Tabla completa abajo).
 * - Edición DUAL inline de cantidades Y fechas directo en la tabla con persistencia completa.
 * - Iconografía marítima integrada en las filas de tránsito.
 */

export default function GestionArribos() {
  const [arribos, setArribos] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(""); 

  // Estados para la edición integral en línea de la fila
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingQuantity, setEditingQuantity] = useState<string>("");
  const [editingEtaDate, setEditingEtaDate] = useState<string>("");

  // Estado para el buscador interactivo de productos (Formulario)
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState<any>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Resto de estados del Formulario de inserción
  const [quantity, setQuantity] = useState("");
  const [etaDate, setEtaDate] = useState("");
  const [orderCode, setOrderCode] = useState("");
  const [errorForm, setErrorForm] = useState("");
  const [successForm, setSuccessForm] = useState(false);

  useEffect(() => {
    cargarDatos();

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMostrarDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function cargarDatos() {
    setLoading(true);
    try {
      const { data: dataArrivals, error: errArr } = await supabase
        .from("arrivals")
        .select(`
          id,
          quantity,
          eta_date,
          order_code,
          created_at,
          product_id,
          products (
            code,
            description,
            family
          )
        `)
        .order("eta_date", { ascending: true });

      if (errArr) throw errArr;
      setArribos(dataArrivals || []);

      const { data: dataProducts, error: errProd } = await supabase
        .from("products")
        .select("id, code, description")
        .order("code", { ascending: true });

      if (errProd) throw errProd;
      setProductos(dataProducts || []);

    } catch (error: any) {
      console.error("Error al cargar el módulo de arribos:", error);
      setErrorForm(`Error de sincronización con Supabase: ${error?.message || error}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAgregarArribo(e: React.FormEvent) {
    e.preventDefault();
    setErrorForm("");
    setSuccessForm(false);

    if (!productoSeleccionado || !quantity || !etaDate) {
      setErrorForm("Por favor, selecciona un Producto e introduce Cantidad y Fecha ETA.");
      return;
    }

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        throw new Error("No se pudo verificar la sesión del usuario. Por favor, inicia sesión nuevamente.");
      }

      const { error } = await supabase.from("arrivals").insert([
        {
          product_id: productoSeleccionado.id,
          quantity: Number(quantity),
          eta_date: etaDate,
          order_code: orderCode.trim() || null,
          user_id: user.id
        }
      ]);

      if (error) throw error;

      setQuantity("");
      setEtaDate("");
      setOrderCode("");
      setBusquedaProducto("");
      setProductoSeleccionado(null);
      setSuccessForm(true);
      cargarDatos();
    } catch (err: any) {
      setErrorForm(`Error de base de datos al guardar: ${err.message || err}`);
    }
  }

  async function handleGuardarEdicionCompleta(id: string) {
    const nuevaCant = Number(editingQuantity);
    
    if (isNaN(nuevaCant) || nuevaCant <= 0) {
      alert("Por favor introduce una cantidad válida mayor que cero.");
      return;
    }
    if (!editingEtaDate) {
      alert("Por favor selecciona una fecha de arribo válida.");
      return;
    }

    try {
      const { error } = await supabase
        .from("arrivals")
        .update({ 
          quantity: nuevaCant,
          eta_date: editingEtaDate
        })
        .eq("id", id);

      if (error) throw error;

      setEditingId(null);
      setArribos(arribos.map(item => 
        item.id === id ? { ...item, quantity: nuevaCant, eta_date: editingEtaDate } : item
      ));
    } catch (err: any) {
      alert(`Error de red al actualizar los datos de arribo: ${err.message || err}`);
    }
  }

  async function handleEliminarArribo(id: string) {
    if (confirm("¿Deseas eliminar este arribo? Al hacerlo, dejará de sumar en la simulación de inventario futuro.")) {
      try {
        const { error } = await supabase.from("arrivals").delete().eq("id", id);
        if (error) throw error;
        cargarDatos();
      } catch (err) {
        console.error("Error al eliminar el registro de tránsito:", err);
      }
    }
  }

  const productosFiltradosSelector = productos.filter((p) => {
    const minTerm = busquedaProducto.toLowerCase();
    const codigo = p.code?.toLowerCase() || "";
    const desc = p.description?.toLowerCase() || "";
    return codigo.includes(minTerm) || desc.includes(minTerm);
  });

  const arribosFiltradosTabla = arribos.filter((a) => {
    const sku = a.products?.code?.toLowerCase() || "";
    const desc = a.products?.description?.toLowerCase() || "";
    const orden = a.order_code?.toLowerCase() || "";
    const term = searchTerm.toLowerCase();
    return sku.includes(term) || desc.includes(term) || orden.includes(term);
  });

  if (loading) return (
    <div className="min-h-[80vh] flex items-center justify-center bg-[#f8fafc]">
      <div className="text-center space-y-2">
        <div className="w-8 h-8 border-2 border-slate-800 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Conectando con las tablas de ARES System...</p>
      </div>
    </div>
  );

  return (
    <div className="bg-[#f8fafc] min-h-screen text-slate-800 antialiased font-sans">
      <header className="bg-white border-b border-slate-200 p-5">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-base tracking-tight">
          <Ship size={18} className="text-blue-600" />
          <span>Gestión de Arribos e Importaciones en Tránsito (ARES)</span>
        </div>
        <p className="text-[11px] text-slate-400 font-medium mt-0.5">Control de cargas vivas encaminadas a la planta. Impacta directamente la simulación mensual.</p>
      </header>

      <main className="p-5 max-w-[1920px] mx-auto space-y-6">
        
        {/* ================= SECCIÓN FORMULARIO ================= */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-1.5 border-b border-slate-100 pb-3 mb-4">
            <Plus size={16} className="text-blue-600" />
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Inyectar Nuevo Tránsito al Flujo Logístico</h2>
          </div>

          <form onSubmit={handleAgregarArribo} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="relative md:col-span-1" ref={dropdownRef}>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Buscar Artículo o Nombre *
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 text-slate-400" size={13} />
                <input
                  type="text"
                  placeholder="Escribe código SKU o descripción..."
                  className={`w-full pl-8 pr-2 py-2 bg-slate-50 border ${productoSeleccionado ? 'border-emerald-300 bg-emerald-50/10' : 'border-slate-200'} rounded-lg text-[11px] font-semibold outline-none focus:bg-white focus:border-slate-400`}
                  value={busquedaProducto}
                  onChange={(e) => {
                    setBusquedaProducto(e.target.value);
                    setMostrarDropdown(true);
                  }}
                  onFocus={() => setMostrarDropdown(true)}
                />
              </div>

              {mostrarDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-[220px] overflow-y-auto custom-scrollbar">
                  {productosFiltradosSelector.length === 0 ? (
                    <div className="p-3 text-[11px] text-slate-400 text-center font-medium">
                      Ningún producto coincide con la búsqueda.
                    </div>
                  ) : (
                    productosFiltradosSelector.map((p) => (
                      <div
                        key={p.id}
                        className={`p-2.5 hover:bg-slate-50 border-b border-slate-50 cursor-pointer flex flex-col gap-0.5 ${productoSeleccionado?.id === p.id ? 'bg-blue-50/40' : ''}`}
                        onClick={() => {
                          setProductoSeleccionado(p);
                          setBusquedaProducto(`[${p.code}] ${p.description || ""}`);
                          setMostrarDropdown(false);
                        }}
                      >
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-900">
                          <span>SKU: {p.code}</span>
                          {productoSeleccionado?.id === p.id && <Check size={11} className="text-emerald-600" />}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium truncate uppercase">
                          {p.description || "SIN DESCRIPCIÓN COMERCIAL"}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Cantidad *</label>
              <input
                type="number"
                min="1"
                placeholder="0"
                className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-[11px] font-bold outline-none focus:bg-white"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Fecha ETA (Llegada) *</label>
              <input
                type="date"
                className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-[11px] font-bold text-slate-600 outline-none focus:bg-white"
                value={etaDate}
                onChange={(e) => setEtaDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Nº Orden Compra </label>
              <div className="relative">
                <Hash className="absolute left-2.5 top-2.5 text-slate-400" size={11} />
                <input
                  type="text"
                  placeholder="9923"
                  className="w-full pl-7 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-medium outline-none focus:bg-white"
                  value={orderCode}
                  onChange={(e) => setOrderCode(e.target.value)}
                />
              </div>
            </div>

            <div className="md:col-span-4 flex flex-col sm:flex-row justify-between items-center pt-2 gap-2">
              <div className="w-full sm:w-auto">
                {errorForm && (
                  <div className="p-2 bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold rounded-lg flex items-center gap-1.5">
                    <AlertCircle size={12} />
                    <span className="break-all">{errorForm}</span>
                  </div>
                )}
                {successForm && (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold rounded-lg">
                    ✓ Tránsito guardado exitosamente. Reflejado en el horizonte logístico.
                  </div>
                )}
              </div>
              <button
                type="submit"
                className="w-full sm:w-48 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] uppercase tracking-wider py-2.5 px-4 rounded-lg shadow-sm transition-all text-center"
              >
                Confirmar Arribo
              </button>
            </div>
          </form>
        </div>

        {/* ================= SECCIÓN TABLA COMPLETA ================= */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 bg-slate-50/60 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative flex-1 w-full max-w-md">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={13} />
              <input
                type="text"
                placeholder="Filtrar cargas por SKU, descripción o Código de Orden..."
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-medium outline-none focus:border-slate-300"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-1 rounded-md self-end sm:self-auto">
              {arribosFiltradosTabla.length} CARGAS ACTIVAS
            </span>
          </div>

          <div className="overflow-x-auto w-full flex-1 max-h-[650px] custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#0f172a] text-slate-200 font-semibold text-[10px] tracking-wider uppercase sticky top-0 z-10 whitespace-nowrap">
                  <th className="p-3 border-b border-slate-700">Código SKU</th>
                  <th className="p-3 border-b border-slate-700">Descripción del Artículo</th>
                  <th className="p-3 text-right border-b border-slate-700 w-40">Cant. Tránsito</th>
                  <th className="p-3 text-center border-b border-slate-700 bg-blue-950 text-blue-300 w-56">Fecha ETA (Arribo)</th>
                  <th className="p-3 border-b border-slate-700">Orden de Compra</th>
                  <th className="p-3 text-center border-b border-slate-700 w-24">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {arribosFiltradosTabla.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 font-medium">
                      No hay compras en Tránsito registradas en el horizonte logístico.
                    </td>
                  </tr>
                ) : (
                  arribosFiltradosTabla.map((a) => {
                    const isEditing = editingId === a.id;

                    const fechaEtaFormatted = a.eta_date
                      ? new Date(a.eta_date).toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                          timeZone: "UTC"
                        })
                      : "---";

                    return (
                      <tr key={a.id} className="hover:bg-slate-50/60 transition-colors">
                        
                        <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Ship size={13} className="text-blue-500 animate-pulse" />
                            <span>{a.products?.code || "MIGRADO"}</span>
                          </div>
                        </td>
                        
                        <td className="p-3 font-medium text-slate-600 truncate max-w-[320px]" title={a.products?.description}>
                          {a.products?.description ? a.products.description.toUpperCase() : "SIN IDENTIFICACIÓN"}
                        </td>

                        {/* CANTIDAD EDITABLE INLINE */}
                        <td className="p-2 text-right font-black text-blue-700 bg-blue-50/30">
                          {isEditing ? (
                            <input
                              type="number"
                              min="1"
                              className="w-28 p-1 text-right border border-blue-400 bg-white rounded text-[11px] font-bold outline-none text-slate-900 focus:ring-1 focus:ring-blue-500"
                              value={editingQuantity}
                              onChange={(e) => setEditingQuantity(e.target.value)}
                            />
                          ) : (
                            <span className="px-1">{Number(a.quantity).toLocaleString()}</span>
                          )}
                        </td>

                        {/* FECHA ETA EDITABLE INLINE */}
                        <td className="p-2 text-center font-bold bg-blue-50/10 text-slate-800 whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex items-center justify-center">
                              <input
                                type="date"
                                className="p-1 border border-blue-400 bg-white rounded text-[11px] font-bold outline-none text-slate-700 focus:ring-1 focus:ring-blue-500"
                                value={editingEtaDate}
                                onChange={(e) => setEditingEtaDate(e.target.value)}
                              />
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <Calendar size={11} className="text-blue-500" />
                              <span>{fechaEtaFormatted}</span>
                            </div>
                          )}
                        </td>
                        
                        <td className="p-3 font-bold text-slate-500 whitespace-nowrap">
                          {a.order_code || <span className="text-slate-300">---</span>}
                        </td>

                        {/* ACCIONES DE EDICIÓN COMBINADA */}
                        <td className="p-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => handleGuardarEdicionCompleta(a.id)}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                  title="Guardar Cantidad y Fecha"
                                >
                                  <Save size={13} />
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                                  title="Cancelar"
                                >
                                  <X size={13} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingId(a.id);
                                    setEditingQuantity(String(a.quantity));
                                    setEditingEtaDate(a.eta_date || "");
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                  title="Modificar Arribo"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  onClick={() => handleEliminarArribo(a.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                                  title="Eliminar de la simulación"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 9999px; }
      `}</style>
    </div>
  );
}