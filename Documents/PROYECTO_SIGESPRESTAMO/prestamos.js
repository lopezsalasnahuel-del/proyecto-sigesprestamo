import { db} from "./firebaseconfig.js";
import { doc, getDoc, collection, addDoc, getDocs, query, where, orderBy, updateDoc, increment } from "firebase/firestore";
import { registrarMovimiento } from "./caja.js";
import { mostrarExito, mostrarError, confirmarAccion } from "./ui.js";

// Cache simple
let prestamosCache = [];

export async function inicializarLogicaPrestamos() {
    console.log("Logica Prestamos Iniciada");
    cargarListaPrestamos();

    const btnBuscar = document.getElementById("btnBuscarClienteDni");
    if(btnBuscar) btnBuscar.addEventListener("click", buscarClientePorDni);
    
    const btnSimular = document.getElementById("btnSimular");
    if(btnSimular) btnSimular.addEventListener("click", simularPrestamo);
    
    const btnConfirmar = document.getElementById("btnConfirmarPrestamo");
    if(btnConfirmar) btnConfirmar.addEventListener("click", guardarPrestamoEnBD);

    try {
        const configSnap = await getDoc(doc(db, "configuracion", "general"));
        if(configSnap.exists()) {
            const config = configSnap.data();
            // Solo si estamos en la vista de simulación (si los inputs existen)
            const inputTasa = document.getElementById("presTasa");
            const inputCuotas = document.getElementById("presCuotas");
            
            if(inputTasa) inputTasa.value = config.tasaPorDefecto || 30;
            if(inputCuotas) inputCuotas.value = config.cuotasPorDefecto || 6;
        }
    } catch (e) { console.log("Usando valores base (no hay config)"); }

    window.mostrarFormularioPrestamo = () => {
        ocultarTodo();
        document.getElementById("seccionNuevoPrestamo").style.display = "block";
    };

    window.mostrarListaPrestamos = () => {
        ocultarTodo();
        document.getElementById("seccionListaPrestamos").style.display = "block";
        limpiarFormulario();
        cargarListaPrestamos();
    };

    window.verDetallePrestamo = cargarDetallePrestamo;
    window.cobrarCuota = procesarCobroCuota;
}

function ocultarTodo() {
    document.getElementById("seccionListaPrestamos").style.display = "none";
    document.getElementById("seccionNuevoPrestamo").style.display = "none";
    document.getElementById("seccionDetallePrestamo").style.display = "none";
}

// =========================================================
// 1. LÓGICA DE BÚSQUEDA Y SIMULACIÓN
// =========================================================
async function buscarClientePorDni() {
    const dni = document.getElementById("presDniBusqueda").value.trim();
    const alerta = document.getElementById("infoClienteEncontrado");
    
    if(!dni) return alert("Ingrese un DNI");

    try {
        const docSnap = await getDoc(doc(db, "clientes", dni));
        if (docSnap.exists()) {
            const cliente = docSnap.data();
            alerta.style.display = "block";
            alerta.className = "alert alert-success py-2 mt-2";
            document.getElementById("nombreClientePrestamo").innerText = cliente.nombreCompleto;
            document.getElementById("nombreClientePrestamo").dataset.nombre = cliente.nombreCompleto; 
            document.getElementById("idClienteSeleccionado").value = dni; 
        } else {
            alerta.style.display = "block";
            alerta.className = "alert alert-danger py-2 mt-2";
            document.getElementById("nombreClientePrestamo").innerText = "Cliente no encontrado.";
            document.getElementById("idClienteSeleccionado").value = "";
        }
    } catch (error) { console.error(error); }
}

function simularPrestamo() {
    const monto = parseFloat(document.getElementById("presMonto").value);
    const tasa = parseFloat(document.getElementById("presTasa").value);
    const cuotas = parseInt(document.getElementById("presCuotas").value);
    const frecuencia = document.getElementById("presFrecuencia").value;

    if (!monto || !cuotas) return alert("Complete los datos");

    const totalInteres = monto * (tasa / 100);
    const totalDevolver = monto + totalInteres;
    const valorCuota = totalDevolver / cuotas;

    document.getElementById("resumenTotal").innerText = "$" + totalDevolver.toFixed(2);
    document.getElementById("resumenValorCuota").innerText = "$" + valorCuota.toFixed(2);
    document.getElementById("resumenGanancia").innerText = "+$" + totalInteres.toFixed(2);

    const tbody = document.getElementById("tablaSimulacionBody");
    tbody.innerHTML = "";
    let fecha = new Date();
    
    for (let i = 1; i <= cuotas; i++) {
        fecha = calcularProximaFecha(fecha, frecuencia);
        tbody.innerHTML += `<tr><td>${i}</td><td>${fecha.toLocaleDateString()}</td><td class="fw-bold">$${valorCuota.toFixed(2)}</td></tr>`;
    }

    if(document.getElementById("idClienteSeleccionado").value) {
        document.getElementById("btnConfirmarPrestamo").disabled = false;
    }
}

// =========================================================
// 2. GUARDAR PRÉSTAMO
// =========================================================
async function guardarPrestamoEnBD() {
    const btn = document.getElementById("btnConfirmarPrestamo");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';

    try {
        const dniCliente = document.getElementById("idClienteSeleccionado").value;
        const nombreCliente = document.getElementById("nombreClientePrestamo").dataset.nombre;
        const montoSolicitado = parseFloat(document.getElementById("presMonto").value);
        const tasa = parseFloat(document.getElementById("presTasa").value);
        const cantCuotas = parseInt(document.getElementById("presCuotas").value);
        const frecuencia = document.getElementById("presFrecuencia").value;
        
        const totalDevolver = montoSolicitado * (1 + (tasa/100));
        const valorCuota = totalDevolver / cantCuotas;

        const nuevoPrestamo = {
            idCliente: dniCliente,
            clienteNombre: nombreCliente,
            montoSolicitado: montoSolicitado,
            interesPorcentaje: tasa,
            totalADevolver: parseFloat(totalDevolver.toFixed(2)),
            cantidadCuotas: cantCuotas,
            frecuencia: frecuencia,
            estado: "activo",
            cuotasPagas: 0,
            saldoPendiente: parseFloat(totalDevolver.toFixed(2)),
            fechaOtorgado: new Date().toISOString()
        };

        const prestamoRef = await addDoc(collection(db, "prestamos"), nuevoPrestamo);
        const idPrestamoGenerado = prestamoRef.id;

        let fecha = new Date();
        const batchPromesas = [];

        for (let i = 1; i <= cantCuotas; i++) {
            fecha = calcularProximaFecha(fecha, frecuencia);
            const nuevaCuota = {
                numero: i,
                vencimiento: fecha.toISOString(),
                vencimientoString: fecha.toLocaleDateString(),
                monto: parseFloat(valorCuota.toFixed(2)),
                estado: "pendiente",
                fechaPago: null
            };
            const cuotasRef = collection(db, "prestamos", idPrestamoGenerado, "cuotas");
            batchPromesas.push(addDoc(cuotasRef, nuevaCuota));
        }

        await Promise.all(batchPromesas);

        await registrarMovimiento(
            "EGRESO", 
            montoSolicitado, 
            `Préstamo otorgado a ${nombreCliente} (ID: ${idPrestamoGenerado})`
        );

        mostrarExito("✅ ¡Préstamo otorgado correctamente!");
        window.mostrarListaPrestamos();

    } catch (error) {
        console.error(error);
        // REEMPLAZA EL ALERT DE ERROR:
        mostrarError("Hubo un error al guardar el préstamo: " + error.message); // <--- CAMBIO
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check me-2"></i>Confirmar y Guardar';
    }
}

// =========================================================
// 3. LISTADO GENERAL
// =========================================================
async function cargarListaPrestamos() {
    const tbody = document.getElementById("tablaPrestamosBody");
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center p-3"><div class="spinner-border text-primary"></div></td></tr>';

    try {
        const q = query(collection(db, "prestamos"), orderBy("fechaOtorgado", "desc"));
        const querySnapshot = await getDocs(q);

        tbody.innerHTML = "";
        
        if(querySnapshot.empty){
             tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4">No hay préstamos activos.</td></tr>';
             return;
        }

        querySnapshot.forEach((doc) => {
            const p = doc.data();
            const porcentaje = Math.round((p.cuotasPagas / p.cantidadCuotas) * 100);
            let badgeColor = p.estado === 'finalizado' ? "bg-success" : "bg-primary";
            
            tbody.innerHTML += `
                <tr>
                    <td class="ps-4">
                        <div class="fw-bold">${p.clienteNombre}</div>
                        <div class="small text-muted">${p.idCliente}</div>
                    </td>
                    <td><div class="fw-bold">$${p.montoSolicitado}</div></td>
                    <td><span class="badge bg-light text-dark border">${p.cantidadCuotas} Cuotas (${p.frecuencia})</span></td>
                    <td style="width: 20%;">
                        <div class="d-flex justify-content-between small mb-1">
                            <span>${p.cuotasPagas}/${p.cantidadCuotas}</span>
                            <span>${porcentaje}%</span>
                        </div>
                        <div class="progress" style="height: 5px;">
                            <div class="progress-bar ${badgeColor}" role="progressbar" style="width: ${porcentaje}%"></div>
                        </div>
                    </td>
                    <td><span class="badge ${badgeColor}">${p.estado.toUpperCase()}</span></td>
                    <td class="text-end pe-4">
                        <button class="btn btn-sm btn-outline-primary" onclick="verDetallePrestamo('${doc.id}')">
                            <i class="fas fa-eye me-1"></i>Ver
                        </button>
                    </td>
                </tr>
            `;
        });

    } catch (error) { console.error(error); }
}

// =========================================================
// 4. DETALLE Y COBRANZA (¡NUEVO!)
// =========================================================
async function cargarDetallePrestamo(idPrestamo) {
    ocultarTodo();
    document.getElementById("seccionDetallePrestamo").style.display = "block";
    
    // Guardamos el ID para usarlo al cobrar
    document.getElementById("idPrestamoActivo").value = idPrestamo;

    // 1. Cargar info del Prestamo Padre
    try {
        const prestamoSnap = await getDoc(doc(db, "prestamos", idPrestamo));
        if(!prestamoSnap.exists()) return alert("Préstamo no encontrado");

        const p = prestamoSnap.data();
        document.getElementById("detClienteNombre").innerText = p.clienteNombre;
        document.getElementById("detClienteDni").innerText = `DNI: ${p.idCliente}`;
        document.getElementById("detSaldoPendiente").innerText = `$${p.saldoPendiente.toFixed(2)}`;
        document.getElementById("detProgresoTexto").innerText = `${p.cuotasPagas}/${p.cantidadCuotas} Cuotas Pagas`;
        
        const porcentaje = (p.cuotasPagas / p.cantidadCuotas) * 100;
        document.getElementById("detBarraProgreso").style.width = `${porcentaje}%`;

        // 2. Cargar las Cuotas (Subcolección)
        const cuotasRef = collection(db, "prestamos", idPrestamo, "cuotas");
        // Ordenamos por número de cuota para que salgan en orden 1, 2, 3...
        const q = query(cuotasRef, orderBy("numero", "asc")); 
        const cuotasSnap = await getDocs(q);

        const tbody = document.getElementById("tablaCuotasBody");
        tbody.innerHTML = "";

        cuotasSnap.forEach(docCuota => {
            const c = docCuota.data();
            let estadoHtml = '';
            let accionHtml = '';

            if(c.estado === 'pagada') {
                estadoHtml = `<span class="badge bg-success">PAGADA</span>`;
                accionHtml = `<span class="text-muted small"><i class="fas fa-check-circle"></i> Listo</span>`;
            } else {
                estadoHtml = `<span class="badge bg-warning text-dark">PENDIENTE</span>`;
                accionHtml = `
                    <button class="btn btn-success btn-sm" onclick="cobrarCuota('${docCuota.id}', ${c.monto}, ${c.numero})">
                        <i class="fas fa-hand-holding-usd me-1"></i>Cobrar
                    </button>
                `;
            }
            
            // Fecha de pago o guión
            const fechaPago = c.fechaPago ? new Date(c.fechaPago).toLocaleDateString() : '-';

            tbody.innerHTML += `
                <tr>
                    <td class="ps-4 fw-bold">${c.numero}</td>
                    <td>${c.vencimientoString}</td>
                    <td class="fw-bold text-dark">$${c.monto}</td>
                    <td>${estadoHtml}</td>
                    <td>${fechaPago}</td>
                    <td class="text-end pe-4">${accionHtml}</td>
                </tr>
            `;
        });

    } catch (error) {
        console.error("Error cargando detalle:", error);
        alert("Error cargando detalle: " + error.message);
    }
}

async function procesarCobroCuota(idCuota, monto, numeroCuota) {
    const confirmado = await confirmarAccion(
        `¿Cobrar Cuota #${numeroCuota}?`, 
        `Se registrará un ingreso de $${monto} en la caja.`
    );

    if (!confirmado) return;

    const idPrestamo = document.getElementById("idPrestamoActivo").value;

    try {
        // 1. LEER DATOS ACTUALIZADOS DEL PRÉSTAMO Y DEL CLIENTE
        // Necesitamos saber quién es el cliente HOY, no cuando sacó el préstamo.
        const prestamoRef = doc(db, "prestamos", idPrestamo);
        const prestamoSnap = await getDoc(prestamoRef);
        
        if (!prestamoSnap.exists()) throw new Error("El préstamo no existe.");
        
        const dataPrestamo = prestamoSnap.data();
        const idCliente = dataPrestamo.idCliente; // El DNI no cambia

        // Buscamos el nombre MÁS NUEVO en la colección clientes
        const clienteRef = doc(db, "clientes", idCliente);
        const clienteSnap = await getDoc(clienteRef);
        
        // Si encontramos al cliente, usamos su nombre nuevo. Si no, usamos el que tenía el préstamo.
        const nombreReal = clienteSnap.exists() ? clienteSnap.data().nombreCompleto : dataPrestamo.clienteNombre;

        // 2. Actualizar la CUOTA
        const cuotaRef = doc(db, "prestamos", idPrestamo, "cuotas", idCuota);
        await updateDoc(cuotaRef, {
            estado: "pagada",
            fechaPago: new Date().toISOString()
        });

        // 3. Actualizar el PRÉSTAMO PADRE
        await updateDoc(prestamoRef, {
            saldoPendiente: increment(-monto),
            cuotasPagas: increment(1)
        });

        // 4. Registrar en CAJA (Con el nombre actualizado)
        await registrarMovimiento(
            "INGRESO", 
            monto, 
            `Cobro Cuota #${numeroCuota} - ${nombreReal} (DNI: ${idCliente})`
        );  

        mostrarExito("✅ Cobro registrado correctamente.");
        cargarDetallePrestamo(idPrestamo);

    } catch (error) {
        console.error("Error al cobrar:", error);
        mostrarError("Error al procesar cobro: " + error.message);
    }
}

// UTILS
function calcularProximaFecha(fechaActual, frecuencia) {
    const nuevaFecha = new Date(fechaActual);
    if (frecuencia === "Mensual") nuevaFecha.setMonth(nuevaFecha.getMonth() + 1);
    if (frecuencia === "Quincenal") nuevaFecha.setDate(nuevaFecha.getDate() + 15);
    if (frecuencia === "Semanal") nuevaFecha.setDate(nuevaFecha.getDate() + 7);
    if (frecuencia === "Diario") nuevaFecha.setDate(nuevaFecha.getDate() + 1);
    return nuevaFecha;
}

function limpiarFormulario() {
    // Verificamos que los elementos existan antes de tocarlos para evitar errores
    const form = document.getElementById("formSimularPrestamo");
    if(form) form.reset();
    
    const tabla = document.getElementById("tablaSimulacionBody");
    if(tabla) tabla.innerHTML = "";
    
    const resumen = document.getElementById("resumenTotal");
    if(resumen) resumen.innerText = "$0";
    
    const info = document.getElementById("infoClienteEncontrado");
    if(info) info.style.display = "none";
    
    const btn = document.getElementById("btnConfirmarPrestamo");
    if(btn) btn.disabled = true;
    
    const busqueda = document.getElementById("presDniBusqueda");
    if(busqueda) busqueda.value = "";
}
