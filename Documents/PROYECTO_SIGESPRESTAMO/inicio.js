import { db } from "./firebaseconfig.js";
// Quitamos getCountFromServer que no estabas usando para evitar errores
import { collection, getDocs, query, where } from "firebase/firestore"; 

export function inicializarLogicaInicio() {
    console.log("Dashboard Iniciado - V2");
    cargarEstadisticas();
}

async function cargarEstadisticas() {
    try {
        console.log("1. Cargando Clientes...");
        const snapClientes = await getDocs(collection(db, "clientes"));
        const totalClientes = snapClientes.size;
        
        // Verificamos que el elemento exista antes de escribir para evitar errores
        if(document.getElementById("dashTotalClientes")) {
            document.getElementById("dashTotalClientes").innerText = totalClientes;
        }

        console.log("2. Cargando Préstamos Activos...");
        const qPrestamos = query(collection(db, "prestamos"), where("estado", "==", "activo"));
        const snapPrestamos = await getDocs(qPrestamos);
        const totalPrestamos = snapPrestamos.size;

        if(document.getElementById("dashTotalPrestamos")) {
            document.getElementById("dashTotalPrestamos").innerText = totalPrestamos;
        }

        console.log("3. Calculando Caja...");
        const hoy = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
        const qCaja = query(collection(db, "transacciones"), where("fechaCorta", "==", hoy));
        const snapCaja = await getDocs(qCaja);
        
        let ingresos = 0;
        let egresos = 0;
        snapCaja.forEach(doc => {
            const t = doc.data();
            if (t.tipo === "INGRESO") ingresos += t.monto;
            if (t.tipo === "EGRESO") egresos += t.monto;
        });
        const balance = ingresos - egresos;
        
        if(document.getElementById("dashBalanceHoy")) {
            document.getElementById("dashBalanceHoy").innerText = `$${balance}`;
        }

        console.log("4. Calculando Mora (Estimación)...");
        // SOLUCIÓN: Hacemos lo mismo que en mora.js (Filtro en cliente)
        let contadorMora = 0;
        
        // Fecha de hoy (Medianoche)
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        
        const promises = [];
        
        // Recorremos los préstamos activos que ya bajamos en el paso 2
        snapPrestamos.forEach(doc => {
            // AQUI ESTA EL CAMBIO: Solo pedimos 'pendiente' a Firebase.
            // Quitamos el filtro de fecha de la consulta para evitar error de índice.
            const qCuotas = query(
                collection(db, "prestamos", doc.id, "cuotas"), 
                where("estado", "==", "pendiente")
            );
            promises.push(getDocs(qCuotas));
        });

        // Esperamos todas las respuestas
        const resultadosCuotas = await Promise.all(promises);
        
        // Contamos manualmente en JS
        resultadosCuotas.forEach(snap => {
            snap.forEach(docCuota => {
                const data = docCuota.data();
                // Filtro de fecha en JavaScript (Infalible)
                const fechaVencimiento = new Date(data.vencimiento);
                
                if (fechaVencimiento < startOfToday) {
                    contadorMora++;
                }
            });
        });

        if(document.getElementById("dashTotalMora")) {
            document.getElementById("dashTotalMora").innerText = contadorMora;
        }
        
        console.log("Dashboard cargado correctamente.");

    } catch (error) {
        console.error("Error cargando dashboard:", error);
        // Poner guiones si falla algo visualmente
        if(document.getElementById("dashTotalClientes")) document.getElementById("dashTotalClientes").innerText = "-";
    }
}