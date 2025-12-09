import { db } from "./firebaseconfig.js";
import { doc, getDoc, collection, addDoc, getDocs, query, where, orderBy, updateDoc, increment } from "firebase/firestore";
import { registrarMovimiento } from "./caja.js"; 
import { mostrarExito, mostrarError, confirmarAccion } from "./ui.js";

// Cache simple
let prestamosCache = [];

export async function inicializarLogicaPrestamos() {
    console.log("Logica Prestamos Iniciada (Con Validación No-Apto)");
    cargarListaPrestamos();
    
    window.abrirModalPagoFlexible = () => new bootstrap.Modal(document.getElementById('modalPagoFlexible')).show();
    window.procesarPagoFlexible = procesarPagoFlexible;
    
    window.abrirModalRefinanciar = prepararModalRefinanciacion;
    window.confirmarRefinanciacion = confirmarRefinanciacion;
    // Cargar config por defecto
    try {
        const configSnap = await getDoc(doc(db, "configuracion", "general"));
        if(configSnap.exists()) {
            const config = configSnap.data();
            const inputTasa = document.getElementById("presTasa");
            const inputCuotas = document.getElementById("presCuotas");
            if(inputTasa) inputTasa.value = config.tasaPorDefecto || 30;
            if(inputCuotas) inputCuotas.value = config.cuotasPorDefecto || 6;
        }
    } catch (e) { console.log("Sin config previa"); }

    // Eventos
    const btnBuscar = document.getElementById("btnBuscarClienteDni");
    if(btnBuscar) btnBuscar.addEventListener("click", buscarClientePorDni);

    const btnSimular = document.getElementById("btnSimular");
    if(btnSimular) btnSimular.addEventListener("click", simularPrestamo);

    const btnConfirmar = document.getElementById("btnConfirmarPrestamo");
    if(btnConfirmar) btnConfirmar.addEventListener("click", guardarPrestamoEnBD);

    // Navegación Global
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
// 1. LÓGICA DE BÚSQUEDA (CON BLOQUEO NO-APTO)
// =========================================================
async function buscarClientePorDni() {
    const dni = document.getElementById("presDniBusqueda").value.trim();
    const alerta = document.getElementById("infoClienteEncontrado");
    
    // Limpiamos estados previos
    document.getElementById("idClienteSeleccionado").value = "";
    document.getElementById("btnConfirmarPrestamo").disabled = true;
    
    if(!dni) return mostrarError("Ingrese un DNI");

    try {
        const docSnap = await getDoc(doc(db, "clientes", dni));
        
        if (docSnap.exists()) {
            const cliente = docSnap.data();
            
            // --- VALIDACIÓN DE ESTADO ---
            if (cliente.estado === 'no_apto') {
                alerta.style.display = "block";
                alerta.className = "alert alert-danger py-2 mt-2 fw-bold";
                
                document.getElementById("nombreClientePrestamo").innerHTML = 
                    `<i class="fas fa-ban me-2"></i>${cliente.nombreCompleto} (CLIENTE NO APTO)`;
                
                // Limpiamos el ID oculto para bloquear el proceso
                document.getElementById("idClienteSeleccionado").value = ""; 
                document.getElementById("nombreClientePrestamo").dataset.nombre = "";
                
                mostrarError("⛔ ALERTA: Este cliente está marcado como NO APTO. No se le pueden otorgar préstamos.");
                return; // Cortamos la ejecución aquí
            }
            // -----------------------------

            // Si es apto, seguimos normal
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
    // Validar que haya cliente seleccionado antes de calcular
    const idCliente = document.getElementById("idClienteSeleccionado").value;
    if (!idCliente) {
        return mostrarError("Debes seleccionar un cliente válido y APTO antes de simular.");
    }

    const monto = parseFloat(document.getElementById("presMonto").value);
    const tasa = parseFloat(document.getElementById("presTasa").value);
    const cuotas = parseInt(document.getElementById("presCuotas").value);
    const frecuencia = document.getElementById("presFrecuencia").value;

    if (!monto || !cuotas) return mostrarError("Complete los datos del préstamo");

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

    // Habilitar botón solo si hay cliente
    document.getElementById("btnConfirmarPrestamo").disabled = false;
}

// =========================================================
// 2. GUARDAR PRÉSTAMO
// =========================================================
async function guardarPrestamoEnBD() {
    const btn = document.getElementById("btnConfirmarPrestamo");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Verificando...';

    try {
        // 1. Datos básicos
        const dniCliente = document.getElementById("idClienteSeleccionado").value;
        if (!dniCliente) throw new Error("Cliente no válido.");
        
        const nombreCliente = document.getElementById("nombreClientePrestamo").dataset.nombre;
        const monto = parseFloat(document.getElementById("presMonto").value);

        // --- INICIO CAMBIO MONEDA DINÁMICA ---
        let moneda = document.getElementById("presMoneda").value;
        
        // Si eligió "OTRO", buscamos el valor en el input de texto
        if (moneda === "OTRO") {
            // Asegúrate de que exista un input con id="presMonedaCustom" en tu HTML
            const inputCustom = document.getElementById("presMonedaCustom");
            moneda = inputCustom ? inputCustom.value.trim().toUpperCase() : "";
            
            if (!moneda) throw new Error("Debes especificar el nombre de la moneda (ej: REALES).");
        }
        // --- FIN CAMBIO MONEDA DINÁMICA ---
        
        // 2. Identificar al Agente Logueado
        const agenteEmail = document.getElementById("userEmailDisplay").innerText;
        
        // 3. VALIDACIÓN DE LÍMITE DE CRÉDITO (CRÍTICO)
        if (window.USER_ROLE !== 'admin') {
            // A. Obtener límites del agente
            const userSnap = await getDoc(doc(db, "usuarios", agenteEmail));
            const userData = userSnap.data();
            
            // Busca dinámicamente en el objeto limites usando la variable 'moneda' ya procesada
            const limiteAsignado = userData.limites ? (userData.limites[moneda] || 0) : 0;

            if (limiteAsignado === 0) throw new Error(`No tienes límite asignado para operar en ${moneda}.`);

            // B. Calcular cuánto prestó ya este mes en esa moneda específica
            const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);
            const startOfMonthISO = startOfMonth.toISOString();

            const qPrestado = query(
                collection(db, "prestamos"),
                where("agenteResponsable", "==", agenteEmail),
                where("moneda", "==", moneda), // Usa la moneda procesada (Sea USD, ARS o REALES)
                where("fechaOtorgado", ">=", startOfMonthISO)
            );
            
            const snapPrestado = await getDocs(qPrestado);
            let gastadoMes = 0;
            snapPrestado.forEach(d => gastadoMes += d.data().montoSolicitado);

            // C. Comparar
            if ((gastadoMes + monto) > limiteAsignado) {
                throw new Error(`⛔ LÍMITE EXCEDIDO.\nTu límite en ${moneda} es ${limiteAsignado}.\nYa prestaste ${gastadoMes}.\nNo puedes dar este crédito de ${monto}.`);
            }
        }

        // 4. Preparar Objeto Préstamo
        const tasa = parseFloat(document.getElementById("presTasa").value);
        const cantCuotas = parseInt(document.getElementById("presCuotas").value);
        const totalDevolver = monto * (1 + (tasa/100));
        
        const nuevoPrestamo = {
            idCliente: dniCliente,
            clienteNombre: nombreCliente,
            montoSolicitado: monto,
            moneda: moneda, // Se guarda lo que haya resultado de la lógica (Dropdown o Custom)
            agenteResponsable: agenteEmail,
            interesPorcentaje: tasa,
            totalADevolver: parseFloat(totalDevolver.toFixed(2)),
            cantidadCuotas: cantCuotas,
            frecuencia: document.getElementById("presFrecuencia").value,
            estado: "activo",
            cuotasPagas: 0,
            saldoPendiente: parseFloat(totalDevolver.toFixed(2)),
            fechaOtorgado: new Date().toISOString()
        };

        // 5. Guardar en BD
        const prestamoRef = await addDoc(collection(db, "prestamos"), nuevoPrestamo);
        
        // Generación de cuotas
        const batchPromesas = [];
        const valorCuota = totalDevolver / cantCuotas;
        let fecha = new Date();
        
        for (let i = 1; i <= cantCuotas; i++) {
            fecha = calcularProximaFecha(fecha, nuevoPrestamo.frecuencia);
            batchPromesas.push(addDoc(collection(db, "prestamos", prestamoRef.id, "cuotas"), {
                numero: i,
                vencimiento: fecha.toISOString(),
                vencimientoString: fecha.toLocaleDateString(),
                monto: parseFloat(valorCuota.toFixed(2)),
                estado: "pendiente",
                fechaPago: null
            }));
        }
        await Promise.all(batchPromesas);

        // 6. Registrar en Caja (Con la moneda correcta)
        await registrarMovimiento(
            "EGRESO", 
            monto, 
            `Préstamo (${moneda}) a ${nombreCliente} (ID: ${prestamoRef.id})`,
            agenteEmail 
        );

        mostrarExito(`✅ Préstamo en ${moneda} otorgado correctamente.`);
        window.mostrarListaPrestamos();

    } catch (error) {
        console.error(error);
        mostrarError(error.message);
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
// 4. DETALLE Y COBRANZA
// =========================================================
async function cargarDetallePrestamo(idPrestamo) {
    ocultarTodo();
    document.getElementById("seccionDetallePrestamo").style.display = "block";
    
    document.getElementById("idPrestamoActivo").value = idPrestamo;

    try {
        const prestamoSnap = await getDoc(doc(db, "prestamos", idPrestamo));
        if(!prestamoSnap.exists()) return mostrarError("Préstamo no encontrado");

        const p = prestamoSnap.data();
        document.getElementById("detClienteNombre").innerText = p.clienteNombre;
        document.getElementById("detClienteDni").innerText = `DNI: ${p.idCliente}`;
        document.getElementById("detSaldoPendiente").innerText = `$${p.saldoPendiente.toFixed(2)}`;
        document.getElementById("detProgresoTexto").innerText = `${p.cuotasPagas}/${p.cantidadCuotas} Cuotas Pagas`;
        
        const porcentaje = (p.cuotasPagas / p.cantidadCuotas) * 100;
        document.getElementById("detBarraProgreso").style.width = `${porcentaje}%`;

        // Cargar Cuotas
        const cuotasRef = collection(db, "prestamos", idPrestamo, "cuotas");
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
        mostrarError("Error cargando detalle: " + error.message);
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
        // 1. LEER DATOS ACTUALIZADOS PARA CAJA
        const prestamoRef = doc(db, "prestamos", idPrestamo);
        const prestamoSnap = await getDoc(prestamoRef);
        
        if (!prestamoSnap.exists()) throw new Error("El préstamo no existe.");
        
        const dataPrestamo = prestamoSnap.data();
        const idCliente = dataPrestamo.idCliente; 

        // Buscamos el nombre ACTUALIZADO en clientes
        const clienteRef = doc(db, "clientes", idCliente);
        const clienteSnap = await getDoc(clienteRef);
        const nombreReal = clienteSnap.exists() ? clienteSnap.data().nombreCompleto : dataPrestamo.clienteNombre;

        // 2. Actualizar CUOTA
        const cuotaRef = doc(db, "prestamos", idPrestamo, "cuotas", idCuota);
        await updateDoc(cuotaRef, {
            estado: "pagada",
            fechaPago: new Date().toISOString()
        });

        // 3. Actualizar PRÉSTAMO
        await updateDoc(prestamoRef, {
            saldoPendiente: increment(-monto),
            cuotasPagas: increment(1)
        });

        // 4. Registrar en CAJA
        await registrarMovimiento(
            "INGRESO", 
            monto, 
            `Cobro Cuota #${numeroCuota} - ${nombreReal} (DNI: ${idCliente})`,
            document.getElementById("userEmailDisplay").innerText
        );  

        // PREGUNTA DE RECIBO
        // Nota: Asumimos que tienes la función en pdf.js y la has importado si la vas a usar
        // Si no la tienes importada arriba, comenta esta parte o agrega el import
        /* 
        const { isConfirmed } = await Swal.fire({ ... }); // (Tu código de PDF iría aquí)
        */
       
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
    document.getElementById("formSimularPrestamo").reset();
    document.getElementById("tablaSimulacionBody").innerHTML = "";
    document.getElementById("resumenTotal").innerText = "$0";
    document.getElementById("infoClienteEncontrado").style.display = "none";
    document.getElementById("btnConfirmarPrestamo").disabled = true;
    document.getElementById("presDniBusqueda").value = "";
}

window.togglePresMoneda = function() {
    const sel = document.getElementById("presMoneda");
    const inp = document.getElementById("presMonedaCustom");
    if(sel.value === "OTRO") {
        inp.style.display = "block";
        inp.focus();
    } else {
        inp.style.display = "none";
    }
}

async function procesarPagoFlexible() {
    const montoPago = parseFloat(document.getElementById("montoFlexible").value);
    const idPrestamo = document.getElementById("idPrestamoActivo").value;

    if (!montoPago || montoPago <= 0) return mostrarError("Ingrese un monto válido.");

    // Cerrar modal
    const modalEl = document.getElementById('modalPagoFlexible');
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();

    try {
        // 1. Obtener Préstamo y Cuotas Pendientes (Ordenadas por número)
        const prestamoRef = doc(db, "prestamos", idPrestamo);
        const prestamoSnap = await getDoc(prestamoRef);
        const dataPrestamo = prestamoSnap.data();

        // Obtener nombre del cliente para la caja
        const cliSnap = await getDoc(doc(db, "clientes", dataPrestamo.idCliente));
        const nombreCliente = cliSnap.exists() ? cliSnap.data().nombreCompleto : dataPrestamo.clienteNombre;

        // --- CONSULTA CLAVE: Usamos el nuevo índice (estado + numero) ---
        const qCuotas = query(
            collection(db, "prestamos", idPrestamo, "cuotas"),
            where("estado", "==", "pendiente"),
            orderBy("numero", "asc") // <--- USA TU NUEVO ÍNDICE (Estado y Número Ascendente)
        );
        const snapCuotas = await getDocs(qCuotas);

        if (snapCuotas.empty) return mostrarError("No hay cuotas pendientes para cobrar.");

        // 2. Algoritmo de Distribución (La Cascada)
        let dineroRestante = montoPago;
        let cuotasPagadasCount = 0;

        // Recorremos las cuotas una por una (el orden ya viene de Firebase: 1, 2, 3...)
        for (const docCuota of snapCuotas.docs) {
            if (dineroRestante <= 0) break; 

            const dataCuota = docCuota.data();
            const deudaCuota = dataCuota.monto; 
            const docRefCuota = doc(db, "prestamos", idPrestamo, "cuotas", docCuota.id);

            if (dineroRestante >= deudaCuota) {
                // A. ALCANZA PARA PAGAR TODA LA CUOTA
                await updateDoc(docRefCuota, {
                    estado: "pagada",
                    monto: deudaCuota, 
                    fechaPago: new Date().toISOString(),
                    nota: "Pago Flexible (Total)"
                });
                dineroRestante -= deudaCuota;
                cuotasPagadasCount++;
            
            } else {
                // B. NO ALCANZA (PAGO PARCIAL)
                const nuevoMonto = deudaCuota - dineroRestante;
                
                await updateDoc(docRefCuota, {
                    monto: parseFloat(nuevoMonto.toFixed(2)), // Reducimos el monto
                    nota: `Pago Parcial (Quedan $${nuevoMonto.toFixed(2)})`
                });
                
                dineroRestante = 0; // Se gastó todo
            }
        }

        // 3. Actualizar Préstamo Padre
        await updateDoc(prestamoRef, {
            saldoPendiente: increment(-montoPago),
            cuotasPagas: increment(cuotasPagadasCount)
        });

        // 4. Caja
        await registrarMovimiento(
            "INGRESO", 
            montoPago, 
            `Pago Flexible - ${nombreCliente} (DNI: ${dataPrestamo.idCliente})`,
            dataPrestamo.agenteResponsable,
            dataPrestamo.moneda || "ARS"
        );

        mostrarExito(`Pago de $${montoPago} distribuido correctamente.`);
        cargarDetallePrestamo(idPrestamo); // Recargar tabla

    } catch (error) {
        console.error("Error en pago flexible:", error);
        mostrarError("Error en pago flexible: " + error.message);
    }
}

// Preparar el modal con los datos actuales
async function prepararModalRefinanciacion() {
    const idPrestamo = document.getElementById("idPrestamoActivo").value;
    const snap = await getDoc(doc(db, "prestamos", idPrestamo));
    const data = snap.data();

    // Mostramos la deuda actual como base del nuevo préstamo
    document.getElementById("refinSaldoBase").value = data.saldoPendiente;
    
    // Cálculo dinámico visual al cambiar tasa/cuotas
    const calcular = () => {
        const saldo = data.saldoPendiente;
        const tasa = parseFloat(document.getElementById("refinTasa").value) || 0;
        const total = saldo * (1 + (tasa/100));
        document.getElementById("refinNuevoTotal").innerText = `$${total.toFixed(2)}`;
    };
    
    document.getElementById("refinTasa").addEventListener("input", calcular);
    calcular(); // Ejecutar una vez al abrir

    new bootstrap.Modal(document.getElementById('modalRefinanciar')).show();
}

async function confirmarRefinanciacion() {
    const idPrestamoViejo = document.getElementById("idPrestamoActivo").value;
    
    // Cerrar modal
    const modalEl = document.getElementById('modalRefinanciar');
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();

    try {
        // 1. Obtener datos viejos
        const prestamoViejoRef = doc(db, "prestamos", idPrestamoViejo);
        const snapViejo = await getDoc(prestamoViejoRef);
        const dataViejo = snapViejo.data();

        // 2. Datos nuevos del formulario
        const nuevaTasa = parseFloat(document.getElementById("refinTasa").value);
        const nuevasCuotas = parseInt(document.getElementById("refinCuotas").value);
        const nuevaFrecuencia = document.getElementById("refinFrecuencia").value;
        
        const saldoCapital = dataViejo.saldoPendiente;
        const nuevoTotal = saldoCapital * (1 + (nuevaTasa/100));
        const valorCuota = nuevoTotal / nuevasCuotas;

        // 3. ACTUALIZAR PRÉSTAMO VIEJO (Cerrarlo)
        await updateDoc(prestamoViejoRef, {
            estado: "refinanciado",
            nota: "Deuda transferida a nuevo préstamo",
            saldoPendiente: 0 // Lo ponemos en 0 porque la deuda pasa al otro
        });
        
        // Opcional: Marcar cuotas viejas como anuladas/refinanciadas (para que no salgan en mora)
        const qCuotasViejas = query(collection(db, "prestamos", idPrestamoViejo, "cuotas"), where("estado", "==", "pendiente"));
        const snapC = await getDocs(qCuotasViejas);
        snapC.forEach(async (d) => {
            await updateDoc(doc(db, "prestamos", idPrestamoViejo, "cuotas", d.id), { estado: "refinanciada" });
        });

        // 4. CREAR PRÉSTAMO NUEVO
        const nuevoPrestamo = {
            ...dataViejo, // Copiamos datos del cliente, agente, moneda
            montoSolicitado: parseFloat(saldoCapital.toFixed(2)), // El monto solicitado ahora es la deuda vieja
            interesPorcentaje: nuevaTasa,
            totalADevolver: parseFloat(nuevoTotal.toFixed(2)),
            cantidadCuotas: nuevasCuotas,
            frecuencia: nuevaFrecuencia,
            estado: "activo",
            cuotasPagas: 0,
            saldoPendiente: parseFloat(nuevoTotal.toFixed(2)),
            fechaOtorgado: new Date().toISOString(),
            nota: `Refinanciación del préstamo ID: ${idPrestamoViejo}`
        };
        // Borramos el ID viejo para que cree uno nuevo
        delete nuevoPrestamo.id; 

        const refNuevo = await addDoc(collection(db, "prestamos"), nuevoPrestamo);

        // 5. Generar Cuotas Nuevas
        let fecha = new Date();
        const batchPromesas = [];
        
        for (let i = 1; i <= nuevasCuotas; i++) {
            fecha = calcularProximaFecha(fecha, nuevaFrecuencia);
            batchPromesas.push(addDoc(collection(db, "prestamos", refNuevo.id, "cuotas"), {
                numero: i,
                vencimiento: fecha.toISOString(),
                vencimientoString: fecha.toLocaleDateString(),
                monto: parseFloat(valorCuota.toFixed(2)),
                estado: "pendiente"
            }));
        }
        await Promise.all(batchPromesas);

        // 6. Registrar evento en Caja (Solo informativo, no mueve plata)
        // Opcional: Si quieres registrar un "pago" simbólico del viejo y "salida" del nuevo, hazlo aquí.
        // Por ahora, solo notificamos.
        
        mostrarExito("Refinanciación exitosa. Se creó un nuevo plan de pagos.");
        
        // Redirigir al nuevo préstamo
        verDetallePrestamo(refNuevo.id);

    } catch (error) {
        console.error(error);
        mostrarError(error.message);
    }
}