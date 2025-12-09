import { db } from "./firebaseconfig.js";
import { mostrarExito, mostrarError, confirmarAccion } from "./ui.js";
import { doc, setDoc, getDocs, getDoc, collection, deleteDoc, query, where } from "firebase/firestore";

let loggedUserEmail = '';
// Variable para guardar los límites temporalmente mientras editamos
let limitesTemporales = {}; 

export function inicializarLogicaUsuarios(userEmail) {
    if (window.USER_ROLE !== 'admin') {
        document.getElementById("contentArea").innerHTML = `<div class="alert alert-danger m-4">Acceso Restringido</div>`;
        return;
    }

    loggedUserEmail = userEmail;
    loadUserTable();
    
    document.getElementById("formNuevoUsuario").addEventListener("submit", handleNewUser);
    
    // Exponer funciones globales
    window.deleteUser = deleteUser;
    window.editUser = editUser;
    window.cancelarEdicion = cancelarEdicion;
    window.verFichaUsuario = verFichaUsuario;
    
    // Funciones de UI límites
    window.toggleCustomCurrency = toggleCustomCurrency;
    window.agregarLimiteALista = agregarLimiteALista;
    window.removerLimite = removerLimite;
}

// --- LÓGICA UI DE LÍMITES ---
function toggleCustomCurrency() {
    const select = document.getElementById("addMonedaSelector");
    const divCustom = document.getElementById("divOtraMoneda");
    divCustom.style.display = select.value === "OTRO" ? "block" : "none";
}

function agregarLimiteALista() {
    const select = document.getElementById("addMonedaSelector");
    const inputCustom = document.getElementById("addMonedaCustom");
    const inputMonto = document.getElementById("addMontoLimite");

    let moneda = select.value;
    if (moneda === "OTRO") {
        moneda = inputCustom.value.trim().toUpperCase();
        if (!moneda) return mostrarError("Escribe el nombre de la moneda.");
    }

    const monto = parseFloat(inputMonto.value);
    if (!monto || monto <= 0) return mostrarError("Ingresa un monto válido.");

    limitesTemporales[moneda] = monto;

    inputMonto.value = "";
    inputCustom.value = "";
    select.value = "ARS";
    toggleCustomCurrency();

    renderizarTablaLimites();
}

function removerLimite(moneda) {
    delete limitesTemporales[moneda];
    renderizarTablaLimites();
}

function renderizarTablaLimites() {
    const tbody = document.getElementById("listaLimitesBody");
    tbody.innerHTML = "";

    for (const [moneda, monto] of Object.entries(limitesTemporales)) {
        tbody.innerHTML += `
            <tr>
                <td class="fw-bold">${moneda}</td>
                <td>$${monto.toLocaleString()}</td>
                <td class="text-center">
                    <button type="button" class="btn btn-xs btn-outline-danger" onclick="removerLimite('${moneda}')">
                        <i class="fas fa-times"></i>
                    </button>
                </td>
            </tr>
        `;
    }
}

// --- CRUD USUARIOS ---
async function handleNewUser(e) {
    e.preventDefault();
    const btn = document.getElementById("btnGuardarUsuario");
    btn.disabled = true;
    
    const email = document.getElementById("userEmail").value.trim().toLowerCase();

    try {
        if (!email.includes('@')) throw new Error("Email inválido.");

        const docRef = doc(db, "usuarios", email);
        
        const userData = {
            nombre: document.getElementById("userNombre").value.trim().toUpperCase(),
            dni: document.getElementById("userDni").value.trim(),
            rol: document.getElementById("userRol").value,
            zona: document.getElementById("userZona").value,
            telefono: document.getElementById("userTelefono").value.trim(),
            direccion: document.getElementById("userDireccion").value.trim(),
            limites: limitesTemporales,
            fechaAlta: new Date().toISOString()
        };

        await setDoc(docRef, userData, { merge: true });
        
        mostrarExito(`Agente guardado correctamente.`);
        cancelarEdicion(); 
        loadUserTable();

    } catch (error) {
        mostrarError(error.message);
    } finally {
        btn.disabled = false;
    }
}

async function loadUserTable() {
    const tbody = document.getElementById("userTableBody");
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Cargando...</td></tr>';

    try {
        const querySnapshot = await getDocs(collection(db, "usuarios"));
        tbody.innerHTML = "";
        
        querySnapshot.forEach(doc => {
            const u = doc.data();
            const email = doc.id;
            const rolBadge = u.rol === 'admin' ? `<span class="badge bg-danger">ADMIN</span>` : `<span class="badge bg-primary">EMPLEADO</span>`;
            
            const monedasStr = u.limites ? Object.keys(u.limites).join(", ") : "Sin límites";

            tbody.innerHTML += `
                <tr>
                    <td class="ps-4">
                        <div class="fw-bold">${u.nombre || 'Sin Nombre'}</div>
                        <div class="small text-muted">${email}</div>
                    </td>
                    <td>${u.telefono || '-'}</td>
                    <td>
                        <span class="badge bg-info text-dark">${u.zona || '-'}</span>
                        <div class="small text-muted mt-1" style="font-size: 0.75rem">Monedas: ${monedasStr}</div>
                    </td>
                    <td>${rolBadge}</td>
                    <td class="text-end pe-4">
                        <button class="btn btn-sm btn-info me-1" onclick="verFichaUsuario('${email}')" title="Ver Ficha"><i class="fas fa-id-card-alt text-white"></i></button>
                        <button class="btn btn-sm btn-outline-primary me-1" onclick="editUser('${email}')"><i class="fas fa-pencil-alt"></i></button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteUser('${email}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });
    } catch (error) { mostrarError(error.message); }
}

async function editUser(email) {
    try {
        const docSnap = await getDoc(doc(db, "usuarios", email));
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById("userEmail").value = email;
            document.getElementById("userEmail").disabled = true;
            document.getElementById("userNombre").value = data.nombre || "";
            document.getElementById("userDni").value = data.dni || "";
            document.getElementById("userRol").value = data.rol || "empleado";
            document.getElementById("userZona").value = data.zona || "Norte";
            document.getElementById("userTelefono").value = data.telefono || "";
            document.getElementById("userDireccion").value = data.direccion || "";
            
            limitesTemporales = data.limites || {};
            renderizarTablaLimites();

            const btn = document.getElementById("btnGuardarUsuario");
            btn.innerHTML = '<i class="fas fa-sync-alt me-2"></i>Actualizar';
            document.querySelector('.card-header').scrollIntoView({ behavior: 'smooth' });
        }
    } catch (error) { mostrarError(error.message); }
}

function cancelarEdicion() {
    document.getElementById("formNuevoUsuario").reset();
    document.getElementById("userEmail").disabled = false;
    document.getElementById("btnGuardarUsuario").innerHTML = '<i class="fas fa-save me-2"></i>Guardar Agente';
    limitesTemporales = {};
    renderizarTablaLimites();
    document.getElementById("divOtraMoneda").style.display = "none";
}

// --- FICHA DE USUARIO (REPORTE) ---
async function verFichaUsuario(email) {
    try {
        document.body.style.cursor = 'wait';
        
        const modalEl = document.getElementById('modalFichaUsuario');
        
        // --- 1. LÓGICA DE CIERRE SEGURO (CORRECCIÓN CRÍTICA) ---
        // Destruir cualquier instancia vieja antes de crear la nueva
        let modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) {
            modalInstance.hide();
            modalInstance.dispose(); // <-- ¡Mata la instancia anterior!
        }
        // --------------------------------------------------------
        
        // 2. OBTENER DATOS AGENTE
        const userSnap = await getDoc(doc(db, "usuarios", email));
        if(!userSnap.exists()) return;
        const userData = userSnap.data();
        const limites = userData.limites || {}; 

        // Fechas
        const ahora = new Date();
        const startOfMonth = new Date(ahora.getFullYear(), ahora.getMonth(), 1); 
        const startOfMonthISO = startOfMonth.toISOString();

        // 3. CONSULTAS A FIREBASE
        // ... (Tu código de consultas y cálculos) ...
        const qOtorgadosMes = query(
            collection(db, "prestamos"),
            where("agenteResponsable", "==", email),
            where("fechaOtorgado", ">=", startOfMonthISO)
        );

        const qActivosAgente = query(
            collection(db, "prestamos"),
            where("agenteResponsable", "==", email),
            where("estado", "==", "activo")
        );

        const [snapOtorgados, snapActivos] = await Promise.all([
            getDocs(qOtorgadosMes),
            getDocs(qActivosAgente)
        ]);

        // 4. CÁLCULOS
        
        // Prestado (Salida)
        let usado = {}; 
        Object.keys(limites).forEach(m => usado[m] = 0);

        snapOtorgados.forEach(doc => {
            const p = doc.data();
            const mon = p.moneda || "ARS";
            if (!usado[mon]) usado[mon] = 0;
            usado[mon] += parseFloat(p.montoSolicitado);
        });

        // A Cobrar (Entrada)
        let aCobrar = {}; 
        Object.keys(limites).forEach(m => aCobrar[m] = 0);

        const promisesCuotas = [];
        
        snapActivos.forEach(docPrestamo => {
            const dataPrestamo = docPrestamo.data();
            const moneda = dataPrestamo.moneda || "ARS";
            
            const qCuotas = query(
                collection(db, "prestamos", docPrestamo.id, "cuotas"),
                where("estado", "==", "pendiente")
            );
            promisesCuotas.push(getDocs(qCuotas).then(snap => ({ snap, moneda })));
        });

        const resultadosCuotas = await Promise.all(promisesCuotas);

        resultadosCuotas.forEach(({ snap, moneda }) => {
            snap.forEach(docCuota => {
                const c = docCuota.data();
                const fechaVenc = new Date(c.vencimiento);
                
                // Si vence este mes y año
                if (fechaVenc.getMonth() === ahora.getMonth() && 
                    fechaVenc.getFullYear() === ahora.getFullYear()) {
                    
                    if (!aCobrar[moneda]) aCobrar[moneda] = 0;
                    aCobrar[moneda] += c.monto;
                }
            });
        });

        // 5. RENDERIZADO
        
        // 1. Títulos
        document.getElementById("tituloFichaUsuario").innerText = `Ficha: ${userData.nombre}`;
        document.getElementById("fichaTotalPrestamos").innerText = snapActivos.size; 
        
        const clientesUnicos = new Set();
        snapActivos.forEach(d => clientesUnicos.add(d.data().idCliente));
        document.getElementById("fichaTotalClientes").innerText = clientesUnicos.size;

        // 2. Tabla
        const tbody = document.getElementById("tablaFichaLimites");
        tbody.innerHTML = "";

        const todasLasMonedas = new Set([...Object.keys(limites), ...Object.keys(usado), ...Object.keys(aCobrar)]);

        todasLasMonedas.forEach(m => {
            const limiteVal = limites[m] || 0;
            const gastoVal = usado[m] || 0;
            const cobrarVal = aCobrar[m] || 0;
            const disponible = limiteVal - gastoVal;
            
            const fmt = (n) => n.toLocaleString('es-AR', { style: 'currency', currency: m });
            const claseDisp = disponible < 0 ? "text-danger fw-bold" : "text-success fw-bold";

            tbody.innerHTML += `
                <tr>
                    <td class="fw-bold">${m}</td>
                    <td>${limiteVal > 0 ? fmt(limiteVal) : '∞'}</td>
                    <td class="text-primary fw-bold">${fmt(gastoVal)}</td>
                    <td class="${claseDisp}">${fmt(disponible)}</td>
                    <td class="bg-warning bg-opacity-10 fw-bold border-start">${fmt(cobrarVal)}</td>
                </tr>
            `;
        });

        // 6. ABRIR MODAL
        // Ya está limpia la memoria, ahora creamos e instanciamos
        modalInstance = new bootstrap.Modal(modalEl); 
        modalInstance.show();

    } catch (error) {
        if(error.message.includes("index")) {
            mostrarError("⚠️ Faltan índices en Firebase. Revisa la consola.");
        } else {
            mostrarError("Error: " + error.message);
        }
    } finally {
        document.body.style.cursor = 'default';
    }
}

async function deleteUser(email) {
    if(email === loggedUserEmail) return mostrarError("No puedes eliminarte a ti mismo.");
    if(await confirmarAccion("¿Eliminar?", `Se eliminará a ${email}.`)) {
        await deleteDoc(doc(db, "usuarios", email));
        loadUserTable();
    }
}