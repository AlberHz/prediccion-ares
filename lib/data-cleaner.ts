// src/lib/data-cleaner.ts

export interface RawStockRow {
  CODIGO: string | number;
  DESCRIPCIÓN: string;
  STOCK: string | number;
  UND: string;
  LEAD_TIME: string | number; // Nuevo campo agregado para tu Excel maestro
  FAMILIA: string;
  COSTO: string | number;
}

export interface RawMovementRow {
  CT: 'NI' | 'NS' | string;
  TD: string | number;
  FECHA: string | number; // Puede venir como número de serie de Excel o string
  CODIGO: string | number;
  DESCRIPCIÓN: string;
  CANTIDAD: string | number;
}

// Función auxiliar para limpiar números (quita comas, espacios y maneja vacíos)
const cleanNumber = (val: string | number): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = val.replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

// Función auxiliar para limpiar números enteros (específico para Lead Time en días)
const cleanInteger = (val: string | number): number => {
  const num = cleanNumber(val);
  return Math.round(num);
};

// Función auxiliar para parsear fechas de Excel (números de serie) o strings normales
const cleanExcelDate = (dateVal: string | number): string => {
  if (!dateVal) return new Date().toISOString().split('T')[0];
  
  // Si viene como número de serie de Excel (ej: 45231)
  if (typeof dateVal === 'number' || !isNaN(Number(dateVal))) {
    const excelDate = new Date(Math.round((Number(dateVal) - 25569) * 86400 * 1000));
    return excelDate.toISOString().split('T')[0];
  }

  // Si viene como string dd/mm/yyyy o yyyy-mm-dd
  const dateStr = String(dateVal).trim();
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`; // yyyy/mm/dd
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`; // dd/mm/yyyy
  }
  
  return dateStr.substring(0, 10);
};

// 1. LIMPIADOR PARA LA NUEVA TABLA MAESTRA UNIFICADA DE PRODUCTOS (Incluye Stock y Lead Time)
export const cleanStockData = (rawRows: RawStockRow[]) => {
  return rawRows
    .filter(row => row.CODIGO && String(row.CODIGO).trim() !== "") // Ignora filas vacías
    .map(row => ({
      code: String(row.CODIGO).trim().toUpperCase(),
      description: String(row.DESCRIPCIÓN || '').trim(),
      stock: cleanNumber(row.STOCK),             
      unit: String(row.UND || 'UND').trim().toUpperCase(),
      lead_time: cleanInteger(row.LEAD_TIME),      
      family: String(row.FAMILIA || 'GENERAL').trim().toUpperCase(),
      cost: cleanNumber(row.COSTO),
    }));
};

// 2. LIMPIADOR PARA LA TABLA DE MOVIMIENTOS (Conserva descripción)
export const cleanMovementData = (rawRows: RawMovementRow[]) => {
  return rawRows
    .filter(row => row.CODIGO && String(row.CODIGO).trim() !== "")
    .map(row => {
      // Mapear el tipo de movimiento NI -> IN, NS -> OUT
      const rawType = String(row.CT).trim().toUpperCase();
      const type: 'IN' | 'OUT' = rawType === 'NI' || rawType === 'INGRESO' ? 'IN' : 'OUT';

      return {
        type,
        transactionCode: String(row.TD || '').trim(),
        date: cleanExcelDate(row.FECHA),
        code: String(row.CODIGO).trim().toUpperCase(),
        description: String(row.DESCRIPCIÓN || '').trim(), 
        quantity: Math.abs(cleanNumber(row.CANTIDAD)), // Siempre positivo en la BD, el tipo IN/OUT define el signo
      };
    });
};