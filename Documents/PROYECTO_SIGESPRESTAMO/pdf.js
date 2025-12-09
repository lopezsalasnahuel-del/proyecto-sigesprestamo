// pdf.js - Generador de Recibos

export function generarReciboPDF(datos) {
    // Accedemos a la librería global
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // 1. Encabezado
    doc.setFillColor(13, 110, 253); // Azul tipo Bootstrap
    doc.rect(0, 0, 210, 20, 'F'); // Barra superior azul
    
    doc.setTextColor(255, 255, 255); // Texto blanco
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("SIGES - COMPROBANTE DE PAGO", 105, 13, { align: "center" });

    // 2. Información del Recibo
    doc.setTextColor(0, 0, 0); // Texto negro
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    let y = 40; // Posición vertical inicial
    const x = 20; // Margen izquierdo
    const lineHeight = 10;

    // Fecha y Hora
    doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, x, y);
    y += lineHeight;

    // ID de Transacción (usamos una parte del ID del préstamo para que parezca un ticket)
    doc.text(`Referencia: #${datos.idPrestamo.substring(0, 8).toUpperCase()}`, x, y);
    y += 15; // Espacio extra

    // 3. Detalles del Cliente y Pago
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("DETALLES DEL PAGO", x, y);
    doc.line(x, y + 2, 190, y + 2); // Línea divisoria
    y += 15;

    doc.setFont("helvetica", "normal");
    
    // Cliente
    doc.text("Cliente:", x, y);
    doc.setFont("helvetica", "bold");
    doc.text(datos.cliente, x + 30, y);
    doc.setFont("helvetica", "normal");
    y += lineHeight;

    // DNI
    doc.text("DNI:", x, y);
    doc.text(datos.dni, x + 30, y);
    y += lineHeight;

    // Concepto
    doc.text("Concepto:", x, y);
    doc.text(`Cuota N° ${datos.cuotaNumero}`, x + 30, y);
    y += lineHeight;

    // Monto (Grande y destacado)
    y += 10;
    doc.setFontSize(14);
    doc.text("TOTAL PAGADO:", x, y);
    doc.setFontSize(18);
    doc.setTextColor(25, 135, 84); // Verde dinero
    doc.text(`$${parseFloat(datos.monto).toFixed(2)}`, x + 50, y);

    // 4. Pie de página
    doc.setTextColor(150, 150, 150); // Gris
    doc.setFontSize(8);
    doc.text("Gracias por cumplir con su compromiso.", 105, 280, { align: "center" });
    doc.text("Documento generado electrónicamente por SIGES.", 105, 285, { align: "center" });

    // 5. Descargar
    doc.save(`Recibo_Cuota${datos.cuotaNumero}_${datos.cliente}.pdf`);
}