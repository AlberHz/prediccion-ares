import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { jsPDF } from "https://esm.sh/jspdf@2.5.1"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")

// Función avanzada de PDF con personalización de colores según estado
function generarPDFCategoria(tituloCategoria: string, productos: any[], fechaStr: string, estadoTipo: string): string {
  const doc = new jsPDF("l", "mm", "a4")
  
  // Configuración de paleta de colores según tu regla estricta de alertas
  let r = 30, g = 41, b = 59 // Por defecto Slate-800
  if (estadoTipo === "COMPRAR YA") { r = 220; g = 38; b = 38; }      // Rojo vibrante
  if (estadoTipo === "POR REVISAR") { r = 217; g = 119; b = 6; }     // Naranja descriptivo
  if (estadoTipo === "STOCK OK") { r = 22; g = 163; b = 74; }        // Verde balanceado

  // Título e identificadores con color del estado
  doc.setFont("Helvetica", "bold")
  doc.setFontSize(16)
  doc.setTextColor(r, g, b)
  doc.text(`INFORME DE ABASTECIMIENTO ARES - ${tituloCategoria.toUpperCase()}`, 14, 15)
  
  doc.setFontSize(9)
  doc.setFont("Helvetica", "normal")
  doc.setTextColor(100, 116, 139) // Slate-500 para metadatos
  doc.text(`Fecha de emisión: ${fechaStr} - 09:00 AM`, 14, 22)
  doc.text(`Total de registros en este bloque: ${productos.length}`, 14, 27)
  
  // Línea divisoria principal con el color del estado
  doc.setDrawColor(r, g, b)
  doc.setLineWidth(0.4)
  doc.line(14, 30, 282, 30)

  let yPos = 38
  
  // Encabezados de tabla
  doc.setFont("Helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(15, 23, 42) // Slate-900 para cabeceras
  doc.text("Código", 14, yPos)
  doc.text("Descripción", 42, yPos)
  doc.text("L. Time", 125, yPos)
  doc.text("Stock Fís.", 142, yPos)
  doc.text("En Tránsito", 162, yPos)
  doc.text("Promedio", 185, yPos)
  doc.text("Cobertura", 208, yPos)
  doc.text("Mes Quiebre", 228, yPos)
  doc.text("Fecha OC", 248, yPos)
  doc.text("Pto. Pedido", 265, yPos)
  
  doc.setDrawColor(226, 232, 240) // Gris suave para filas
  doc.setLineWidth(0.2)
  doc.line(14, yPos + 2, 282, yPos + 2)
  yPos += 7

  if (productos.length === 0) {
    doc.setFont("Helvetica", "normal")
    doc.setTextColor(148, 163, 184)
    doc.text("No se registran SKUs dentro de esta categoría de inventario.", 14, yPos)
  } else {
    productos.forEach((p) => {
      // Salto de página automático
      if (yPos > 185) { 
        doc.addPage("l", "mm", "a4")
        yPos = 20
        doc.setFont("Helvetica", "bold")
        doc.setTextColor(15, 23, 42)
        doc.text("Código", 14, yPos)
        doc.text("Descripción", 42, yPos)
        doc.text("L. Time", 125, yPos)
        doc.text("Stock Fís.", 142, yPos)
        doc.text("En Tránsito", 162, yPos)
        doc.text("Promedio", 185, yPos)
        doc.text("Cobertura", 208, yPos)
        doc.text("Mes Quiebre", 228, yPos)
        doc.text("Fecha OC", 248, yPos)
        doc.text("Pto. Pedido", 265, yPos)
        doc.line(14, yPos + 2, 282, yPos + 2)
        yPos += 7
      }
      
      // Contenido de Fila estándar
      doc.setFont("Helvetica", "normal")
      doc.setTextColor(51, 65, 85)
      
      // Código e ítems críticos resaltados
      if (estadoTipo === "COMPRAR YA") doc.setFont("Helvetica", "bold")
      doc.text(String(p.code), 14, yPos)
      doc.setFont("Helvetica", "normal")

      const descCorta = p.description.length > 45 ? p.description.substring(0, 43) + "..." : p.description
      doc.text(descCorta, 42, yPos)
      
      doc.text(`${p.lead_time}d`, 125, yPos)
      doc.text(p.stockFisico.toLocaleString(), 142, yPos)
      doc.text(p.enTránsito > 0 ? `+${p.enTránsito.toLocaleString()}` : "---", 162, yPos)
      
      // Promedio: Muestra la predicción final (consumoIA) respetando manual tal cual tu tabla
      doc.text(p.consumoIA > 0 ? `${Math.round(p.consumoIA).toLocaleString()} u/m` : "0", 185, yPos)
      
      // Aplicar color específico a las celdas de estatus de alerta para máxima legibilidad
      doc.setFont("Helvetica", "bold")
      doc.setTextColor(r, g, b)
      doc.text(p.coberturaMeses > 99 ? "∞" : `${p.coberturaMeses.toFixed(1)} m`, 208, yPos)
      doc.text(String(p.mesQuiebre), 228, yPos)
      doc.text(String(p.fechaLimiteOCStr), 248, yPos)
      
      // Volver a color estándar para el punto ROP
      doc.setFont("Helvetica", "normal")
      doc.setTextColor(51, 65, 85)
      doc.text(p.puntoRop > 0 ? Math.round(p.puntoRop).toLocaleString() : "---", 265, yPos)
      
      yPos += 6
    })
  }

  // Conversión binaria limpia para Deno
  const pdfOutput = doc.output("arraybuffer")
  let base64Pdf = ""
  const bytes = new Uint8Array(pdfOutput)
  for (let i = 0; i < bytes.byteLength; i++) {
    base64Pdf += String.fromCharCode(bytes[i])
  }
  return btoa(base64Pdf)
}

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)

    // Descarga idéntica de colecciones maestros
    const { data: dbProducts } = await supabase.from("products").select("id, code, description, family, lead_time, stock, active, custom_average_consumption")
    const { data: dbArrivals } = await supabase.from("arrivals").select("*")
    
    let todosLosMovimientos: any[] = []
    let desde = 0, hasta = 999, tieneMas = true
    while (tieneMas) {
      const { data: chunk } = await supabase.from("movements").select("*").range(desde, hasta)
      if (chunk && chunk.length > 0) {
        todosLosMovimientos = [...todosLosMovimientos, ...chunk]
        if (chunk.length < 1000) tieneMas = false; else { desde += 1000; hasta += 1000; }
      } else { tieneMas = false }
    }

    const fechaActual = new Date()
    const AÑO_ACTUAL = fechaActual.getFullYear()
    const MES_ACTUAL_JS = fechaActual.getMonth()
    const DOCUMENTOS_SALIDA = ["NS", "22", "23", "93", "TD"]
    const fechaFormat = fechaActual.toLocaleDateString('es-ES')

    // Estructura idéntica de meses del Front
    const mesesHeaders = []
    for (let i = 0; i < 12; i++) {
      const fechaFutura = new Date(AÑO_ACTUAL, MES_ACTUAL_JS + i, 1)
      mesesHeaders.push({ 
        id: `${fechaFutura.getFullYear()}-${fechaFutura.getMonth()}`, 
        nombre: ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"][fechaFutura.getMonth()], 
        mesNum: fechaFutura.getMonth(), 
        año: fechaFutura.getFullYear() 
      })
    }

    // Filtrar solo los activos, tal como lo hace dataProcesada por defecto en el Front
    const productosAnalizados = (dbProducts || []).filter((p: any) => p.active !== false).map((p: any) => {
      const stockFisico = Number(p.stock || 0)
      const leadTimeDias = parseInt(p.lead_time, 10) || 0
      const leadTimeMeses = leadTimeDias / 30

      const historialDelSku = todosLosMovimientos.filter((m: any) => m.product_id === p.id)
      const arribosDelSku = dbArrivals ? dbArrivals.filter((a: any) => a.product_id === p.id && a.status === "PENDIENTE") : []
      
      const salidasValidas = historialDelSku.filter((m: any) => {
        const tipoDoc = String(m.type || "").trim().toUpperCase()
        const codTrans = String(m.transaction_code || "").trim().toUpperCase()
        return DOCUMENTOS_SALIDA.includes(tipoDoc) || DOCUMENTOS_SALIDA.includes(codTrans)
      })
      
      const historialPorMes: { [key: string]: number } = {}
      salidasValidas.forEach((m: any) => {
        const fObj = m.date ? new Date(m.date) : new Date(m.created_at)
        const llave = `${fObj.getFullYear()}-${fObj.getMonth()}`
        historialPorMes[llave] = (historialPorMes[llave] || 0) + Math.abs(Number(m.quantity || 0))
      })

      const cantidadesMensuales = Object.values(historialPorMes)
      const totalMesesPeriodo = cantidadesMensuales.length > 0 ? cantidadesMensuales.length : 1
      const unidadesTotalesSalida = cantidadesMensuales.reduce((s, v) => s + v, 0)
      const promedioHistoricoCrudo = unidadesTotalesSalida / totalMesesPeriodo
      
      // Replicando lógicas exactas del useMemo
      const promedioMensualReal = Number(p.custom_average_consumption) > 0 
        ? Number(p.custom_average_consumption) 
        : promedioHistoricoCrudo

      const varianza = cantidadesMensuales.length > 1 
        ? cantidadesMensuales.reduce((s, v) => s + Math.pow(v - promedioHistoricoCrudo, 2), 0) / (cantidadesMensuales.length - 1) 
        : 0
      const desviaciónEstandar = Math.sqrt(varianza)
      
      const demandaConIncremento = promedioHistoricoCrudo * 1.30
      let factorTendenciaAlcista5 = 1.28 * desviaciónEstandar
      const colchonMaximoPermitido = demandaConIncremento * 0.25
      if (factorTendenciaAlcista5 > colchonMaximoPermitido) {
        factorTendenciaAlcista5 = colchonMaximoPermitido
      }

      // 🚀 REGLA ESTRICTA DE PREDICCIÓN FINAL DEL FRONTEND
      const demandaPredichaFinal = Number(p.custom_average_consumption) > 0 
        ? Number(p.custom_average_consumption) 
        : (promedioHistoricoCrudo > 0 ? demandaConIncremento + factorTendenciaAlcista5 : 0)

      const totalArribos = arribosDelSku.reduce((s: number, a: any) => s + Number(a.quantity || 0), 0)
      const inventarioVirtual = stockFisico + totalArribos
      const coberturaMeses = demandaPredichaFinal > 0 ? inventarioVirtual / demandaPredichaFinal : 0
      const puntoRopCalculado = demandaPredichaFinal > 0 ? (demandaPredichaFinal * leadTimeMeses) * 1.15 : 0

      let stockSimulado = stockFisico
      let mesQuiebreCalculado = "ESTABLE"
      let yaQuebro = false
      let fechaQuiebre = new Date(AÑO_ACTUAL, MES_ACTUAL_JS + 11, 28)
      
      mesesHeaders.forEach((m) => {
        const arribosEsteMes = arribosDelSku.filter((a: any) => {
          const fechaEta = a.eta_date ? new Date(a.eta_date) : null
          return fechaEta && fechaEta.getMonth() === m.mesNum && fechaEta.getFullYear() === m.año
        })
        const entradasOC = arribosEsteMes.reduce((s: number, curr: any) => s + Number(curr.quantity || 0), 0)

        const llaveMesActual = `${m.año}-${m.mesNum}`
        const consumosEfectivosReales = historialPorMes[llaveMesActual] || 0
        
        const demandaEfectivaEsteMes = (m.mesNum === MES_ACTUAL_JS && m.año === AÑO_ACTUAL) 
          ? Math.max(consumosEfectivosReales, demandaPredichaFinal) 
          : demandaPredichaFinal

        stockSimulado = stockSimulado + entradasOC - demandaEfectivaEsteMes
        if (stockSimulado <= 0 && !yaQuebro) {
          mesQuiebreCalculado = `${m.nombre} '${String(m.año).slice(-2)}`
          fechaQuiebre = new Date(m.año, m.mesNum, 1)
          yaQuebro = true
        } else if (stockSimulado > 0 && yaQuebro) {
          yaQuebro = false
          mesQuiebreCalculado = "ESTABLE"
        }
      })

      const quiebreRealDetectado = mesQuiebreCalculado !== "ESTABLE"
      const fechaLimiteOC = new Date(fechaQuiebre)
      fechaLimiteOC.setDate(fechaLimiteOC.getDate() - leadTimeDias - 30)

      // 🎯 CONDICIÓN ESPEJO PARA CLAVAR LOS ITEMS EXACTOS
      let estadoAbastecimiento = "STOCK OK"
      if (demandaPredichaFinal === 0 && stockFisico === 0) {
        estadoAbastecimiento = "SIN MOVIMIENTO"
      } else if (demandaPredichaFinal > 0 && quiebreRealDetectado && fechaLimiteOC <= fechaActual) {
        estadoAbastecimiento = "COMPRAR YA"
      } else if (demandaPredichaFinal > 0 && (coberturaMeses <= (leadTimeMeses + 1.0) || quiebreRealDetectado)) {
        estadoAbastecimiento = "POR REVISAR"
      }

      return { 
        code: p.code ? String(p.code).trim() : "SIN CÓDIGO", 
        description: p.description ? String(p.description).trim() : "SIN DESCRIPCIÓN", 
        lead_time: leadTimeDias,
        stockFisico,
        enTránsito: totalArribos,
        promedioReal: promedioMensualReal,
        consumoIA: demandaPredichaFinal,
        coberturaMeses,
        mesQuiebre: quiebreRealDetectado ? mesQuiebreCalculado : "OK",
        fechaLimiteOCStr: quiebreRealDetectado ? fechaLimiteOC.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : "---",
        puntoRop: quiebreRealDetectado ? puntoRopCalculado : 0,
        estado: estadoAbastecimiento
      }
    })

    const comprarYa = productosAnalizados.filter(p => p.estado === "COMPRAR YA")
    const porRevisar = productosAnalizados.filter(p => p.estado === "POR REVISAR")
    const stockOk = productosAnalizados.filter(p => p.estado === "STOCK OK" || p.estado === "SIN MOVIMIENTO")

    // Generar PDFs asignando el tipo de estado para inyectarle color estilizado nativo
    const base64ComprarYa = generarPDFCategoria("COMPRAR YA - URGENCIA CRÍTICA", comprarYa, fechaFormat, "COMPRAR YA")
    const base64PorRevisar = generarPDFCategoria("POR REVISAR - PREVENTIVO", porRevisar, fechaFormat, "POR REVISAR")
    const base64StockOk = generarPDFCategoria("STOCK OK ", stockOk, fechaFormat, "STOCK OK")

    const prefijoFecha = fechaActual.toISOString().slice(0, 10)

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; color: #334155; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 24px; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #0f172a; margin-bottom: 4px;">📋 Reporte de Alertas de Abastecimiento de Importaciones</h2>
        <p style="font-size: 11px; color: #94a3b8; margin: 0; text-transform: uppercase;">Sincronización Avanzada con Predicciones</p>
        <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 16px 0;" />
        
        <div style="margin-bottom: 20px;">
          <div style="background: #fef2f2; border: 1px solid #fee2e2; padding: 12px; border-radius: 8px; margin-bottom: 8px;">
            <strong style="color: #991b1b;"> COMPRAR YA:</strong> Se detectaron <strong>${comprarYa.length}</strong> productos en riesgo inmediato o cobertura insuficiente.
          </div>
          <div style="background: #fffbeb; border: 1px solid #fef3c7; padding: 12px; border-radius: 8px; margin-bottom: 8px;">
            <strong style="color: #92400e;">POR REVISAR:</strong> <strong>${porRevisar.length}</strong> productos en observation preventiva.
          </div>
          <div style="background: #f0fdf4; border: 1px solid #d1fae5; padding: 12px; border-radius: 8px;">
            <strong style="color: #065f46;">STOCK OK / ESTABLE:</strong> <strong>${stockOk.length}</strong> productos en estado estable/sin movimiento.
          </div>
        </div>

        <p style="font-size: 13px; color: #475569; line-height: 1.5;">Hola Equipo, se adjunta los <strong>3 documentos PDF</strong> para la gestión del abastecimiento, y evitar quiebres de stock.</p>
      </div>
    `

    // Realizar la petición HTTP hacia Resend controlando estrictamente la respuesta
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "Ares Alertas <onboarding@resend.dev>",
        to: ["jordihz.18@outlook.es"],
        subject: `REPORTE DE ABASTECIMIENTO DE IMPORTACIONES: ${comprarYa.length} Items Críticos`,
        html: emailHtml,
        attachments: [
          { content: base64ComprarYa, filename: `1_Reporte_COMPRAR_YA_${prefijoFecha}.pdf` },
          { content: base64PorRevisar, filename: `2_Reporte_POR_REVISAR_${prefijoFecha}.pdf` },
          { content: base64StockOk, filename: `3_Reporte_STOCK_OK_${prefijoFecha}.pdf` }
        ]
      }),
    })

    // Si Resend rechaza la petición, atrapamos el error textualmente para los logs de Supabase
    if (!resendResponse.ok) {
      const errorDetalle = await resendResponse.text()
      throw new Error(`Resend rechazó el envío: ${errorDetalle}`)
    }

    return new Response(JSON.stringify({ ok: true, procesados: productosAnalizados.length, comprarYa: comprarYa.length }), { headers: { "Content-Type": "application/json" } })
  } catch (error) {
    // Retornamos el error con status 500 para que se visualice inmediatamente en los logs rojos de Edge Functions
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
})