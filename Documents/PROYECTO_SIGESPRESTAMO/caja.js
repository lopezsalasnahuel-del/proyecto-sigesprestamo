import { db } from "./firebaseconfig.js";
import {collection, addDoc, query, where, getDocs, orderBy} from "firebase/firestore";


// ==========================================
// 1. FUNCIÓN UTILITARIA (Registrar)
// ==========================================
export async function registrarMovimiento(tipo, monto, concepto) {
    try {
        // Intentamos capturar el usuario real de la interfaz, si no, "Sistema"
        let usuarioActual = "Sistema";
        const emailDisplay = document.getElementById("userEmailDisplay");
        if (emailDisplay && emailDisplay.innerText) {
            usuarioActual = emailDisplay.innerText;
        }

        const movimiento = {
            fecha: new Date().toISOString(), // Fecha completa con hora para ordenar
            fechaCorta: new Date().toISOString().split('T')[0], // YYYY-MM-DD para agrupar
            hora: new Date().toLocaleTimeString(),
            tipo: tipo, 
            monto: parseFloat(monto),
            concepto: concepto,
            usuario: usuarioActual
        };

        await addDoc(collection(db, "transacciones"), movimiento);
        console.log("💰 Movimiento registrado en caja:", concepto);
    } catch (error) {
        console.error("Error registrando caja:", error);
    }
}

// ==========================================
// 2. LÓGICA DE LA VISTA
// ==========================================
export function inicializarLogicaCaja() {
    console.log("Lógica Caja Iniciada (Con Ordenamiento)");
    
    const inputFecha = document.getElementById("cajaFechaFiltro");
    
    if (!inputFecha) {
        console.error("No se encontró el input de fecha.");
        return; 
    }

    // Poner fecha de hoy si está vacío
    if (!inputFecha.value) {
        inputFecha.value = new Date().toISOString().split('T')[0];
    }
    
    cargarMovimientosCaja();

    window.cargarMovimientosCaja = cargarMovimientosCaja;
}

async function cargarMovimientosCaja() {
    const inputFecha = document.getElementById("cajaFechaFiltro");
    if (!inputFecha) return;

    const fechaSeleccionada = inputFecha.value;
    const tbody = document.getElementById("tablaCajaBody");
    
    tbody.innerHTML = '<tr><td colspan="5" class="text-center p-3"><div class="spinner-border text-primary"></div></td></tr>';

    try {
        // 1. Traemos los datos de Firebase (Sin ordenar aquí para evitar error de índice)
        const q = query(
            collection(db, "transacciones"), 
            where("fechaCorta", "==", fechaSeleccionada),
        );

        const querySnapshot = await getDocs(q);
        
        let totalIngresos = 0;
        let totalEgresos = 0;
        
        // 2. Guardamos en un Array para poder ordenar
        const lista = [];
        querySnapshot.forEach(doc => {
            lista.push(doc.data());
        });

        // 3. ORDENAR EN JAVASCRIPT (De más reciente a más antiguo)
        lista.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        // 4. Dibujar la tabla
        tbody.innerHTML = "";

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4">Sin movimientos este día.</td></tr>';
        }

        lista.forEach(m => {
            // Calcular totales
            if (m.tipo === "INGRESO") totalIngresos += m.monto;
            if (m.tipo === "EGRESO") totalEgresos += m.monto;

            const colorMonto = m.tipo === "INGRESO" ? "text-success" : "text-danger";
            const icono = m.tipo === "INGRESO" ? '<i class="fas fa-arrow-down text-success"></i>' : '<i class="fas fa-arrow-up text-danger"></i>';

            tbody.innerHTML += `
                <tr>
                    <td class="ps-4">${m.hora}</td>
                    <td>${icono} <span class="small fw-bold">${m.tipo}</span></td>
                    <td>${m.concepto}</td>
                    <td><span class="badge bg-light text-dark border">${m.usuario || 'Sistema'}</span></td>
                    <td class="text-end pe-4 fw-bold ${colorMonto}">$${m.monto.toFixed(2)}</td>
                </tr>
            `;
        });

        // Actualizar tarjetas de totales
        document.getElementById("txtTotalIngresos").innerText = `$${totalIngresos.toFixed(2)}`;
        document.getElementById("txtTotalEgresos").innerText = `$${totalEgresos.toFixed(2)}`;
        
        const balance = totalIngresos - totalEgresos;
        const colorBalance = balance >= 0 ? "text-success" : "text-danger";
        document.getElementById("txtBalance").innerHTML = `<span class="${colorBalance}">$${balance.toFixed(2)}</span>`;

    } catch (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center">Error: ${error.message}</td></tr>`;
    }
}