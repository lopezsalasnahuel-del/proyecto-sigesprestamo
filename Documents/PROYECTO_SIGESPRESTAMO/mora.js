import { db } from "./firebaseconfig.js";
import {collection, getDocs, query, where } from "firebase/firestore";

export function inicializarLogicaMora() {
    console.log("Logica Mora Iniciada - V3 (Filtrado en Cliente)");
    loadMoraReport();
    window.loadMoraReport = loadMoraReport;
}

async function loadMoraReport() {
    const tbody = document.getElementById("tablaMoraBody");
    const totalMoraEl = document.getElementById("totalMora");
    const totalCuotasEl = document.getElementById("totalCuotasMora");
    
    tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4"><div class="spinner-border text-danger"></div> Buscando deudas...</td></tr>';
    
    // Fecha de hoy para comparar (Inicio del día)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0); 

    try {
        console.log("PASO 1: Buscando préstamos activos...");
        const qPrestamos = query(collection(db, "prestamos"), where("estado", "==", "activo"));
        const prestamosSnap = await getDocs(qPrestamos);
        
        if (prestamosSnap.empty) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-success">No hay préstamos activos.</td></tr>`;
            totalMoraEl.innerText = "$0.00";
            totalCuotasEl.innerText = "0";
            return;
        }

        const promises = [];

        prestamosSnap.forEach(prestamoDoc => {
            const idPrestamo = prestamoDoc.id;
            const cuotasRef = collection(db, "prestamos", idPrestamo, "cuotas");
            
            // --- CAMBIO CLAVE AQUÍ ---
            // Solo pedimos a Firebase las PENDIENTES. No filtramos fecha aquí para evitar error de índice.
            const qCuotas = query(cuotasRef, where("estado", "==", "pendiente"));
            
            promises.push(getDocs(qCuotas).then(cuotasSnap => {
                const results = [];
                
                // --- DEBUG: VER QUÉ TIENE EL PRÉSTAMO ---
                const datosPrestamo = prestamoDoc.data();
                console.log(`🔎 Datos del Préstamo (${idPrestamo}):`, datosPrestamo);
                // ----------------------------------------

                cuotasSnap.forEach(cuotaDoc => {
                    const c = cuotaDoc.data();
                    const fechaVencimiento = new Date(c.vencimiento);

                    if (fechaVencimiento < startOfToday) {
                        // ... cálculo de días ...
                        const diffTime = Math.abs(new Date() - fechaVencimiento);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        // INTENTO DE CAPTURA ROBUSTO
                        // Si no encuentra el DNI, pone "N/A" en lugar de undefined
                        let dniAmostrar = "N/A";
                        
                        if (datosPrestamo.idCliente) dniAmostrar = datosPrestamo.idCliente;
                        else if (datosPrestamo.dni) dniAmostrar = datosPrestamo.dni;
                        else if (datosPrestamo.clienteDni) dniAmostrar = datosPrestamo.clienteDni;

                        results.push({
                            idPrestamo: idPrestamo,
                            clienteNombre: datosPrestamo.clienteNombre || "Sin Nombre",
                            clienteDni: dniAmostrar, // <--- Usamos la variable segura
                            cuota: c,
                            diasAtraso: diffDays,
                            idCuota: cuotaDoc.id
                        });
                    }
                });
                return results;
            }));
        });
        
        console.log("PASO 2: Procesando cuotas...");
        const allResults = await Promise.all(promises);
        
        tbody.innerHTML = "";
        
        const moras = allResults.flat();
        moras.sort((a, b) => b.diasAtraso - a.diasAtraso);
        
        let totalDeuda = 0;
        let cuotasVencidas = 0;
        let htmlRows = "";

        moras.forEach(item => {
            totalDeuda += item.cuota.monto;
            cuotasVencidas++;
            
            // Fíjate en el orden de los <td> ahora:
            // 1. Nombre
            // 2. DNI (antes salía el ID)
            // 3. Monto (antes salía el numero de cuota)
            // 4. Vencimiento
            // 5. Días Atraso
            // 6. Botón (Con función irACobrar)
            
            htmlRows += `
                <tr>
                    <td class="ps-4 fw-bold">${item.clienteNombre}</td>
                    
                    <td><span class="badge bg-light text-dark border">${item.clienteDni}</span></td>
                    
                    <td class="fw-bold text-danger">$${item.cuota.monto.toFixed(2)} (C${item.cuota.numero})</td>
                    
                    <td>${item.cuota.vencimientoString}</td>
                    
                    <td><span class="badge bg-danger">${item.diasAtraso} días</span></td>
                    
                    <td class="text-end pe-4">
                        <!-- CAMBIO IMPORTANTE: Usamos irACobrar en vez de verDetallePrestamo -->
                        <button class="btn btn-sm btn-outline-danger" onclick="irACobrar('${item.idPrestamo}')">
                            <i class="fas fa-hand-holding-usd me-1"></i>Cobrar
                        </button>
                    </td>
                </tr>
            `;
        });

        if (moras.length === 0) {
            htmlRows = `<tr><td colspan="7" class="text-center p-4 text-success">¡No hay cuotas en mora!</td></tr>`;
        }

        tbody.innerHTML = htmlRows;
        totalMoraEl.innerText = `$${totalDeuda.toFixed(2)}`;
        totalCuotasEl.innerText = `${cuotasVencidas} Cuotas Vencidas`;

    } catch (error) {
        console.error("ERROR:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center">Error: ${error.message}</td></tr>`;
    }
}