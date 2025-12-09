import { db } from "./firebaseconfig.js";
import { collection, getDocs, query, where } from "firebase/firestore"; 

export function inicializarLogicaInicio() {
    console.log("Dashboard Iniciado - V4 (Proyección Mensual Incluida)");
    cargarEstadisticasYGraficos();
}

async function cargarEstadisticasYGraficos() {
    try {
        // ============================================================
        // 1. CARGA DE KPIs (Tarjetas)
        // ============================================================
        
        // --- Clientes ---
        const snapClientes = await getDocs(collection(db, "clientes"));
        if(document.getElementById("dashTotalClientes")) 
            document.getElementById("dashTotalClientes").innerText = snapClientes.size;

        // --- Préstamos Activos ---
        const qPrestamosActivos = query(collection(db, "prestamos"), where("estado", "==", "activo"));
        const snapPrestamosActivos = await getDocs(qPrestamosActivos);
        
        if(document.getElementById("dashTotalPrestamos"))
            document.getElementById("dashTotalPrestamos").innerText = snapPrestamosActivos.size;

        // --- Caja Hoy ---
        const hoy = new Date().toLocaleDateString('en-CA');
        const qCajaHoy = query(collection(db, "transacciones"), where("fechaCorta", "==", hoy));
        const snapCaja = await getDocs(qCajaHoy);
        let balanceHoy = 0;
        snapCaja.forEach(d => {
            const t = d.data();
            balanceHoy += (t.tipo === "INGRESO" ? t.monto : -t.monto);
        });
        if(document.getElementById("dashBalanceHoy"))
            document.getElementById("dashBalanceHoy").innerText = `$${balanceHoy.toFixed(0)}`;

        // ============================================================
        // 2. CÁLCULOS COMPLEJOS (Mora + Proyección + Gráfico Dona)
        // ============================================================
        
        // Variables para Mora y Proyección
        let contadorMora = 0;
        let totalProyeccionMes = 0; // <--- NUEVA VARIABLE

        // Fechas de referencia
        const ahora = new Date();
        const mesActual = ahora.getMonth(); // 0 = Enero
        const anioActual = ahora.getFullYear();
        const startOfToday = new Date(); 
        startOfToday.setHours(0,0,0,0);
        
        // --- PREPARACIÓN GRÁFICO DONA (Activos + Finalizados) ---
        const qTodosPrestamos = query(collection(db, "prestamos"), where("estado", "in", ["activo", "finalizado"]));
        const snapTodos = await getDocs(qTodosPrestamos);

        let totalPrestadoHistorico = 0;
        let totalPendienteActual = 0;

        snapTodos.forEach(doc => {
            const data = doc.data();
            totalPrestadoHistorico += (data.totalADevolver || 0);
            totalPendienteActual += (data.saldoPendiente || 0);
        });

        // --- RECORRIDO DE CUOTAS (Optimizado: Mora + Proyección en un solo viaje) ---
        const promisesCuotas = [];
        
        // Solo miramos cuotas de préstamos ACTIVOS
        snapPrestamosActivos.forEach(doc => {
            const qCuotas = query(collection(db, "prestamos", doc.id, "cuotas"), where("estado", "==", "pendiente"));
            promisesCuotas.push(getDocs(qCuotas));
        });

        const resultadosCuotas = await Promise.all(promisesCuotas);
        
        resultadosCuotas.forEach(snap => {
            snap.forEach(docCuota => {
                const data = docCuota.data();
                const fechaVencimiento = new Date(data.vencimiento);

                // A) Chequeo de Mora (Vencido antes de hoy)
                if (fechaVencimiento < startOfToday) {
                    contadorMora++;
                }

                // B) Chequeo de Proyección (Vence este mes y año)
                if (fechaVencimiento.getMonth() === mesActual && 
                    fechaVencimiento.getFullYear() === anioActual) {
                    totalProyeccionMes += (data.monto || 0);
                }
            });
        });

        // Escribir resultados en el HTML
        if(document.getElementById("dashTotalMora"))
            document.getElementById("dashTotalMora").innerText = contadorMora;

        if(document.getElementById("dashProyeccionMes"))
            document.getElementById("dashProyeccionMes").innerText = `$${totalProyeccionMes.toLocaleString('es-AR', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;


        // ============================================================
        // 3. RENDERIZADO DE GRÁFICOS (CHART.JS)
        // ============================================================

        // --- GRÁFICO A: ESTADO DE CARTERA (DONA) ---
        const totalCobradoReal = totalPrestadoHistorico - totalPendienteActual;
        
        const canvasDona = document.getElementById('chartCartera');
        // Destruir previo para evitar bugs visuales
        if (Chart.getChart(canvasDona)) {
            Chart.getChart(canvasDona).destroy();
        }

        if (canvasDona) {
            new Chart(canvasDona, {
                type: 'doughnut',
                data: {
                    labels: ['Cobrado (Histórico)', 'Por Cobrar (Actual)'],
                    datasets: [{
                        data: [totalCobradoReal, totalPendienteActual],
                        backgroundColor: ['#198754', '#dc3545'], 
                        hoverOffset: 4
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }

        // --- GRÁFICO B: INGRESOS MENSUALES (BARRAS) ---
        const qIngresos = query(collection(db, "transacciones"), where("tipo", "==", "INGRESO"));
        const snapIngresos = await getDocs(qIngresos);

        const ingresosPorMes = {};
        snapIngresos.forEach(doc => {
            const t = doc.data();
            const fechaStr = t.fechaCorta || t.fecha || "Sin Fecha";
            const mes = fechaStr.substring(0, 7); // YYYY-MM
            
            if(!ingresosPorMes[mes]) ingresosPorMes[mes] = 0;
            ingresosPorMes[mes] += t.monto;
        });

        const mesesOrdenados = Object.keys(ingresosPorMes).sort().slice(-6); // Últimos 6 meses
        const montosOrdenados = mesesOrdenados.map(mes => ingresosPorMes[mes]);

        const canvasBarras = document.getElementById('chartIngresos');
        if (Chart.getChart(canvasBarras)) {
            Chart.getChart(canvasBarras).destroy();
        }

        if (canvasBarras) {
            new Chart(canvasBarras, {
                type: 'bar',
                data: {
                    labels: mesesOrdenados,
                    datasets: [{
                        label: 'Ingresos ($)',
                        data: montosOrdenados,
                        backgroundColor: '#0d6efd',
                        borderRadius: 5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

    } catch (error) {
        console.error("Error cargando gráficos:", error);
    }
}