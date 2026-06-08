"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/lib/supabase";

interface Product {
  id: string;
  code: string;
  description: string;
  stock: number;
  unit: string;
  family: string;
  cost: number;
  lead_time: number;
}

interface DataContextType {
  productos: Product[];
  loading: boolean;
  refetchData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [productos, setProductos] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const cargarDatosDesdeSupabase = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Traemos todo el catálogo de productos con sus campos
      const { data, error } = await supabase
        .from("products")
        .select("id, code, description, stock, unit, family, cost, lead_time")
        .eq("user_id", user.id)
        .order("code", { ascending: true });

      if (error) throw error;
      setProductos(data || []);
    } catch (error) {
      console.error("Error cargando caché global:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatosDesdeSupabase();
  }, []);

  return (
    <DataContext.Provider value={{ productos, loading, refetchData: cargarDatosDesdeSupabase }}>
      {children}
    </DataContext.Provider>
  );
}

export function useGlobalData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useGlobalData debe ser usado dentro de un DataProvider");
  }
  return context;
}