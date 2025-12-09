import { db } from "./firebaseconfig.js";
import { collection, addDoc, query, where, getDocs, orderBy, doc, setDoc, increment } from "firebase/firestore";

export async function registrarMovimiento(tipo, monto, concepto, usuario = "Sistema", moneda = "ARS") {
    try {
        // Objeto para el Libro Menor (transacciones)
        const movimiento = {
            fecha: new Date().toISOString(),
            fechaCorta: new Date().toISOString().split('T')[0],
            hora: new Date().toLocaleTimeString(),
            tipo: tipo,
            monto: parseFloat(monto),
            moneda: moneda, 
            concepto: concepto,
            // Usamos el usuario que se pasó, si es "Sistema" significa que el llamado no especificó un usuario
            usuario: usuario === "Sistema" ? obtenerUsuarioLogueado() : usuario, 
        };

        // 1. REGISTRO EN LIBRO MENOR (Colección 'transacciones')
        await addDoc(collection(db, "transacciones"), movimiento);

        // 2. ACTUALIZACIÓN EN LIBRO MAYOR (Colección 'saldos')
        const saldoRef = doc(db, "saldos", moneda);
        
        let montoIngreso = 0;
        let montoEgreso = 0;
        let factor = 0;

        if (tipo === "INGRESO") {
            montoIngreso = monto;
            factor = monto; // Se suma al saldo
        } else {
            montoEgreso = monto;
            factor = -monto; // Se resta al saldo
        }
        
        // Usamos setDoc con merge:true para actualizar o crear si no existe
        await setDoc(saldoRef, {
            saldoActual: increment(factor),
            totalIngresos: increment(montoIngreso),
            totalEgresos: increment(montoEgreso),
            ultimaActualizacion: new Date().toISOString(),
        }, { merge: true }); 

        console.log(`💰 Movimiento en Caja: ${tipo} de ${monto} ${moneda}. Saldo actualizado.`);
        
    } catch (error) {
        console.error("Error FATAL al registrar en Caja:", error);
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
    
    // Llamadas corregidas: Cargar movimientos Y cargar resumen global
    cargarMovimientosCaja();
    cargarResumenSaldos();
    
    window.cargarMovimientosCaja = cargarMovimientosCaja;
    window.cargarResumenSaldos = cargarResumenSaldos; // Exportamos la función para el botón de recarga
}

async function cargarMovimientosCaja() {
    // ... (El resto de cargarMovimientosCaja se mantiene igual que tu última versión)
    const inputFecha = document.getElementById("cajaFechaFiltro");
    if (!inputFecha) return;

    const fechaSeleccionada = inputFecha.value;
    const tbody = document.getElementById("tablaCajaBody");
    
    tbody.innerHTML = '<tr><td colspan="5" class="text-center p-3"><div class="spinner-border text-primary"></div></td></tr>';

    try {
        const q = query(
            collection(db, "transacciones"), 
            where("fechaCorta", "==", fechaSeleccionada),
        );

        const querySnapshot = await getDocs(q);
        
        let totalIngresos = 0;
        let totalEgresos = 0;
        
        const lista = [];
        querySnapshot.forEach(doc => {
            lista.push(doc.data());
        });

        lista.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        tbody.innerHTML = "";

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4">Sin movimientos este día.</td></tr>';
        }

        lista.forEach(m => {
            if (m.tipo === "INGRESO") totalIngresos += m.monto;
            if (m.tipo === "EGRESO") totalEgresos += m.monto;

            const colorMonto = m.tipo === "INGRESO" ? "text-success" : "text-danger";
            const icono = m.tipo === "INGRESO" ? '<i class="fas fa-arrow-down text-success"></i>' : '<i class="fas fa-arrow-up text-danger"></i>';
            let simboloMoneda = '$'; 
            if (m.moneda === 'USD') simboloMoneda = 'US$';
            if (m.moneda === 'EUR') simboloMoneda = '€';

            tbody.innerHTML += `
                <tr>
                    <td class="ps-4">${m.hora}</td>
                    <td>${icono} <span class="small fw-bold">${m.tipo}</span></td>
                    <td>${m.concepto}</td>
                    <td><span class="badge bg-light text-dark border">${m.usuario || 'Sistema'}</span></td>
                    <td class="text-end pe-4 fw-bold ${colorMonto}">${simboloMoneda} ${m.monto.toFixed(2)}</td>
                </tr>
            `;
        });

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

// CARGA DEL RESUMEN GLOBAL (Libro Mayor) - Muestra Saldos ARS, USD, EUR
async function cargarResumenSaldos() {
    const contenedor = document.getElementById("resumenSaldosGlobales");
    contenedor.innerHTML = '<div class="col-12"><div class="text-center p-3 text-muted border rounded">Cargando saldos...</div></div>';

    try {
        const snapSaldos = await getDocs(collection(db, "saldos"));
        contenedor.innerHTML = "";
        
        snapSaldos.forEach(docSnap => {
            const moneda = docSnap.id;
            const data = docSnap.data();
            const saldo = data.saldoActual || 0;

            const colorCard = saldo >= 0 ? "bg-primary" : "bg-danger";
            const simbolo = saldo >= 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down';
            
            const fmt = (n) => n.toLocaleString('es-AR', { style: 'currency', currency: moneda });

            contenedor.innerHTML += `
                <div class="col-md-3">
                    <div class="card ${colorCard} text-white shadow-sm border-0 h-100">
                        <div class="card-body">
                            <small class="text-white-50">${moneda} (Total Caja)</small>
                            <h3 class="fw-bold mb-0">${fmt(saldo)}</h3>
                            <small class="text-white-50"><i class="${simbolo}"></i> ${fmt(data.totalIngresos || 0)} Ingresos</small>
                        </div>
                    </div>
                </div>
            `;
        });
        
        if (snapSaldos.empty) {
             contenedor.innerHTML = '<div class="col-12"><div class="alert alert-info text-center">No hay saldos registrados.</div></div>';
        }

    } catch (error) {
        console.error("Error cargando saldos:", error);
    }
}

// --- FUNCIÓN AUXILIAR DE USUARIO ---
function obtenerUsuarioLogueado() {
    const emailDisplay = document.getElementById("userEmailDisplay");
    // Este elemento solo existe si ya cargó la app principal
    return emailDisplay ? emailDisplay.innerText : "Sistema";
}