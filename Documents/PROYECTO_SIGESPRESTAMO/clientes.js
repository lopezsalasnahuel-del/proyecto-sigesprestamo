import { db } from "./firebaseconfig.js";
import { mostrarExito, mostrarError, confirmarAccion } from "./ui.js";
import { 
    doc, 
    setDoc, 
    getDoc, 
    collection, 
    getDocs, 
    deleteDoc 
} from "firebase/firestore"; 

// Variable global para cachear los clientes
let clientesCache = [];

export async function inicializarLogicaClientes() {
    console.log("Inicializando lógica de Clientes...");
    await cargarTablaClientes();
    cargarListaReferentes();    
    const buscador = document.getElementById("buscadorCliente");
    if(buscador){
        buscador.addEventListener("input", (e) => {
            filtrarTabla(e.target.value);
        });
    }

    const form = document.getElementById("formNuevoCliente");
    if (form) {
        form.addEventListener("submit", manejarGuardado);
    }

    window.mostrarFormulario = mostrarFormulario;
    window.mostrarLista = mostrarLista;
    window.editarCliente = editarCliente;
    window.eliminarCliente = eliminarCliente;
}

// ==========================================
// FUNCIONES DE UI
// ==========================================
function mostrarFormulario(limpiar = true) {
    document.getElementById("seccionLista").style.display = "none";
    document.getElementById("seccionFormulario").style.display = "block";
    
    if(limpiar){
        document.getElementById("formNuevoCliente").reset();
        document.getElementById("tituloFormulario").innerText = "Nuevo Cliente";
        document.getElementById("esEdicion").value = "false";
        document.getElementById("cliDni").disabled = false;
        
        // Por defecto al crear es activo
        document.getElementById("cliEstado").value = "activo";
        document.getElementById("estadoOriginal").value = "activo";
    }
}

function mostrarLista() {
    document.getElementById("seccionFormulario").style.display = "none";
    document.getElementById("seccionLista").style.display = "block";
}

// ==========================================
// CRUD: LEER (TABLA)
// ==========================================
async function cargarTablaClientes() {
    const tbody = document.getElementById("tablaClientesBody");
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center p-3"><div class="spinner-border text-primary"></div></td></tr>';

    try {
        const querySnapshot = await getDocs(collection(db, "clientes"));
        clientesCache = [];

        querySnapshot.forEach((doc) => {
            // Guardamos la data tal cual viene de Firebase
            clientesCache.push(doc.data());
        });

        renderizarTabla(clientesCache);

    } catch (error) {
        console.error("Error leyendo clientes:", error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-danger text-center">Error al cargar: ${error.message}</td></tr>`;
    }
}

function renderizarTabla(lista) {
    const tbody = document.getElementById("tablaClientesBody");
    tbody.innerHTML = "";

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted p-4">No hay clientes registrados</td></tr>';
        return;
    }

    lista.forEach(c => {
        const contacto = c.contacto || {};
        const laboral = c.laboral || {};

        // --- CORRECCIÓN DE ESTADO ---
        // Verificamos exactamente qué valor tiene
        const estado = c.estado || "activo"; 
        
        let badgeEstado = '<span class="badge bg-success">Activo</span>';
        let claseFila = '';

        if (estado === 'no_apto') {
            badgeEstado = '<span class="badge bg-danger"><i class="fas fa-ban me-1"></i> NO APTO</span>';
            claseFila = 'table-danger opacity-75'; // Fila rojiza para destacar
        }

        const fila = `
            <tr class="${claseFila}">
                <td class="ps-4">
                    <div class="fw-bold text-dark">${c.nombreCompleto}</div>
                    <div class="small text-muted">${contacto.email || '-'}</div>
                </td>
                <td><span class="badge bg-light text-dark border">${c.dni}</span></td>
                <td>
                    <div class="small">${laboral.fuerza || '-'}</div>
                    <div class="small text-muted">${laboral.destino || '-'}</div>
                </td>
                <td class="small">
                    <div><i class="fab fa-whatsapp text-success me-1"></i>${contacto.telefono || '-'}</div>
                </td>
                <td>${badgeEstado}</td>
                <td class="text-end pe-4">
                    <button class="btn btn-sm btn-link text-primary" onclick="editarCliente('${c.dni}')" title="Editar">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button class="btn btn-sm btn-link text-danger" onclick="eliminarCliente('${c.dni}')" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
        tbody.innerHTML += fila;
    });
}

function filtrarTabla(texto) {
    const textoBuscado = texto.toLowerCase();
    const filtrados = clientesCache.filter(c => 
        (c.nombreCompleto && c.nombreCompleto.toLowerCase().includes(textoBuscado)) || 
        (c.dni && c.dni.toString().includes(textoBuscado))
    );
    renderizarTabla(filtrados);
}

// ==========================================
// CRUD: GUARDAR (CREATE / UPDATE)
// ==========================================
async function manejarGuardado(e) {
    e.preventDefault();
    const btn = document.getElementById("btnGuardarCliente");
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Procesando...';

    const esEdicion = document.getElementById("esEdicion").value === "true";
    const dni = document.getElementById("cliDni").value.trim();

    try {
        if(!dni) throw new Error("El DNI es obligatorio");

        // Captura de valores de estado
        const nuevoEstado = document.getElementById("cliEstado").value;
        const estadoAnterior = document.getElementById("estadoOriginal").value;
        
        // DEBUG: Verificamos en consola qué está pasando
        console.log(`Guardando... Rol: ${window.USER_ROLE} | Anterior: ${estadoAnterior} | Nuevo: ${nuevoEstado}`);

        // --- VALIDACIÓN DE SEGURIDAD ---
        if (esEdicion) {
            // Si el cliente ERA 'no_apto' y ahora quieren ponerlo 'activo'
            if (estadoAnterior === 'no_apto' && nuevoEstado === 'activo') {
                if (window.USER_ROLE !== 'admin') {
                    throw new Error("⛔ ACCESO DENEGADO: Solo un Administrador puede rehabilitar un cliente 'No Apto'.");
                }
            }
        }

        const datosCliente = {
            dni: dni,
            nombreCompleto: document.getElementById("cliNombre").value.trim().toUpperCase(),
            estado: nuevoEstado, // <--- Importante: Guardamos el estado explícitamente
            referente: document.getElementById("cliReferente").value, // <--- NUEVO CAMPO
            contacto: {
                telefono: document.getElementById("cliTelefono").value.trim(),
                email: document.getElementById("cliEmail").value.trim(),
                direccion: document.getElementById("cliDireccion").value.trim(),
            },
            laboral: {
                fuerza: document.getElementById("cliFuerza").value,
                grado: document.getElementById("cliGrado").value.trim(),
                destino: document.getElementById("cliDestino").value.trim(),
                categoria: document.getElementById("cliCategoria").value.trim(),
            },
            bancario: {
                banco: document.getElementById("cliBanco").value.trim(),
                cbu: document.getElementById("cliCbu").value.trim(),
                alias: document.getElementById("cliAlias").value.trim(),
            },
            keywords: generarKeywords(dni, document.getElementById("cliNombre").value)
        };

        const docRef = doc(db, "clientes", dni);

        if (!esEdicion) {
            // Crear nuevo
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) throw new Error("El DNI ya existe.");
            
            datosCliente.fechaAlta = new Date().toISOString();
            await setDoc(docRef, datosCliente);
            mostrarExito("Cliente creado correctamente");
        } else {
            // Actualizar existente
            await setDoc(docRef, datosCliente, { merge: true });
            mostrarExito("Cliente actualizado correctamente");
        }

        mostrarLista();
        cargarTablaClientes();

    } catch (error) {
        console.error(error);
        mostrarError(error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ==========================================
// CRUD: EDITAR Y BORRAR
// ==========================================
async function editarCliente(dni) {
    let cliente = clientesCache.find(c => c.dni == dni);
    
    if (!cliente) {
        const docSnap = await getDoc(doc(db, "clientes", dni));
        if(docSnap.exists()) cliente = docSnap.data();
    }

    if (!cliente) return mostrarError("Error al cargar datos del cliente");

    if (document.getElementById("cliReferente")) {
        document.getElementById("cliReferente").value = cliente.referente || "";
    }

    mostrarFormulario(false);
    
    document.getElementById("tituloFormulario").innerText = "Editar Cliente";
    document.getElementById("esEdicion").value = "true";
    
    document.getElementById("cliDni").value = cliente.dni;
    document.getElementById("cliDni").disabled = true;

    document.getElementById("cliNombre").value = cliente.nombreCompleto || "";
    
    const estadoActual = cliente.estado || "activo";
    
    document.getElementById("cliEstado").value = estadoActual;
    document.getElementById("estadoOriginal").value = estadoActual;
    
    console.log(`Editando cliente: ${cliente.nombreCompleto}. Estado detectado: ${estadoActual}`);

    document.getElementById("cliTelefono").value = cliente.contacto?.telefono || "";
    document.getElementById("cliEmail").value = cliente.contacto?.email || "";
    document.getElementById("cliDireccion").value = cliente.contacto?.direccion || "";

    document.getElementById("cliFuerza").value = cliente.laboral?.fuerza || "Policia";
    document.getElementById("cliGrado").value = cliente.laboral?.grado || "";
    document.getElementById("cliDestino").value = cliente.laboral?.destino || "";
    document.getElementById("cliCategoria").value = cliente.laboral?.categoria || "";

    document.getElementById("cliBanco").value = cliente.bancario?.banco || "";
    document.getElementById("cliCbu").value = cliente.bancario?.cbu || "";
    document.getElementById("cliAlias").value = cliente.bancario?.alias || "";
}

async function eliminarCliente(dni) {
    const confirmado = await confirmarAccion(
        "¿Eliminar Cliente?", 
        `Se borrará al cliente DNI ${dni}. Esta acción no se puede deshacer.`
    );

    if(!confirmado) return;

    try {
        await deleteDoc(doc(db, "clientes", dni));
        mostrarExito("Cliente eliminado correctamente.");
        cargarTablaClientes();
    } catch (error) {
        mostrarError(error.message);
    }
}

function generarKeywords(dni, nombre) {
    const arr = [];
    let curDni = '';
    if(dni){
        dni.toString().split('').forEach(letra => {
            curDni += letra;
            arr.push(curDni);
        });
    }
    if(nombre){
        const palabras = nombre.split(' ');
        palabras.forEach(palabra => {
            let curPalabra = '';
            palabra.split('').forEach(letra => {
                curPalabra += letra.toLowerCase();
                arr.push(curPalabra);
            });
        });
    }
    return arr;
}

// Función para llenar las sugerencias con los empleados
// Función Híbrida: Carga Usuarios + Clientes + Referentes Externos
async function cargarListaReferentes() {
    const select = document.getElementById("cliReferente");
    if (!select) return;

    try {
        select.innerHTML = '<option value="">Cargando...</option>';
        
        // 1. Ejecutamos las 3 consultas en paralelo para que sea rápido
        const [snapUsuarios, snapClientes, snapReferentes] = await Promise.all([
            getDocs(collection(db, "usuarios")),   // Prestamistas
            getDocs(collection(db, "clientes")),   // Otros clientes
            getDocs(collection(db, "referentes"))  // Los externos nuevos
        ]);

        select.innerHTML = '<option value="">Seleccione un referente...</option>';

        // 2. Grupo A: PRESTAMISTAS (Usuarios)
        const grupoUsuarios = document.createElement("optgroup");
        grupoUsuarios.label = "--- PRESTAMISTAS / EMPLEADOS ---";
        snapUsuarios.forEach(doc => {
            const d = doc.data();
            const opt = document.createElement("option");
            opt.value = d.nombre; // Guardamos el nombre
            opt.innerText = `${d.nombre} (Zona: ${d.zona || '-'})`;
            grupoUsuarios.appendChild(opt);
        });
        select.appendChild(grupoUsuarios);

        // 3. Grupo B: REFERENTES EXTERNOS
        const grupoRef = document.createElement("optgroup");
        grupoRef.label = "--- REFERENTES EXTERNOS ---";
        snapReferentes.forEach(doc => {
            const d = doc.data();
            const opt = document.createElement("option");
            opt.value = d.nombre;
            opt.innerText = `${d.nombre} (Externo)`;
            grupoRef.appendChild(opt);
        });
        select.appendChild(grupoRef);

        // 4. Grupo C: CLIENTES (Por si un cliente trae a otro)
        const grupoClientes = document.createElement("optgroup");
        grupoClientes.label = "--- CLIENTES EXISTENTES ---";
        snapClientes.forEach(doc => {
            const d = doc.data();
            const opt = document.createElement("option");
            opt.value = d.nombreCompleto;
            opt.innerText = d.nombreCompleto;
            grupoClientes.appendChild(opt);
        });
        select.appendChild(grupoClientes);

    } catch (error) {
        console.error("Error cargando lista mixta:", error);
        select.innerHTML = '<option value="">Error al cargar lista</option>';
    }
}