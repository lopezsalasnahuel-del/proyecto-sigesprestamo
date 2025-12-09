// 1. Importamos TU base de datos desde tu archivo de configuración
import { db } from "./firebaseconfig.js";
import { mostrarExito, mostrarError, confirmarAccion } from "./ui.js";

// 2. Importamos las herramientas DESDE LA LIBRERÍA OFICIAL
// Nota: Agregué 'collection', 'getDocs', 'deleteDoc', 'updateDoc' que necesitamos para la tabla y editar
import { 
    doc, 
    setDoc, 
    getDoc, 
    collection, 
    getDocs, 
    deleteDoc, 
    updateDoc 
} from "firebase/firestore"; 

// Variable global para cachear los clientes y no gastar lecturas
let clientesCache = [];

export async function inicializarLogicaClientes() {
    console.log("Inicializando lógica de Clientes...");

    // 1. Cargar la tabla al iniciar
    await cargarTablaClientes();

    // 2. Evento del Buscador
    const buscador = document.getElementById("buscadorCliente");
    if(buscador){
        buscador.addEventListener("input", (e) => {
            filtrarTabla(e.target.value);
        });
    }

    // 3. Evento del Formulario (Crear/Editar)
    const form = document.getElementById("formNuevoCliente");
    if (form) {
        form.addEventListener("submit", manejarGuardado);
    }

    // Exponer funciones al HTML globalmente (necesario para los botones onclick)
    window.mostrarFormulario = mostrarFormulario;
    window.mostrarLista = mostrarLista;
    window.editarCliente = editarCliente;
    window.eliminarCliente = eliminarCliente;
}

// ==========================================
// FUNCIONES DE UI (MOSTRAR / OCULTAR)
// ==========================================
function mostrarFormulario(limpiar = true) {
    document.getElementById("seccionLista").style.display = "none";
    document.getElementById("seccionFormulario").style.display = "block";
    
    if(limpiar){
        document.getElementById("formNuevoCliente").reset();
        document.getElementById("tituloFormulario").innerText = "Nuevo Cliente";
        document.getElementById("esEdicion").value = "false";
        document.getElementById("cliDni").disabled = false; // Habilitar DNI si es nuevo
    }
}

function mostrarLista() {
    document.getElementById("seccionFormulario").style.display = "none";
    document.getElementById("seccionLista").style.display = "block";
}

// ==========================================
// CRUD: LEER (READ) - Cargar Tabla
// ==========================================
async function cargarTablaClientes() {
    const tbody = document.getElementById("tablaClientesBody");
    if(!tbody) return; // Seguridad si no cargó el HTML aún
    
    tbody.innerHTML = '<tr><td colspan="6" class="text-center p-3"><div class="spinner-border text-primary"></div></td></tr>';

    try {
        // Usamos 'collection' y 'getDocs' importados correctamente arriba
        const querySnapshot = await getDocs(collection(db, "clientes"));
        clientesCache = []; // Limpiamos cache

        querySnapshot.forEach((doc) => {
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
        // Validación segura para evitar errores si falta algún dato
        const contacto = c.contacto || {};
        const laboral = c.laboral || {};
        
        const fila = `
            <tr>
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
                    <div class="text-truncate" style="max-width: 150px;">${contacto.direccion || '-'}</div>
                </td>
                <td><span class="badge bg-success bg-opacity-10 text-success">Activo</span></td>
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
        (c.dni && c.dni.includes(textoBuscado))
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

        const datosCliente = {
            dni: dni,
            nombreCompleto: document.getElementById("cliNombre").value.trim().toUpperCase(),
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
            // Generamos las keywords para buscar fácil
            keywords: generarKeywords(dni, document.getElementById("cliNombre").value)
        };

        // Referencia al documento
        const docRef = doc(db, "clientes", dni);

        if (!esEdicion) {
            // ... validación de existencia ...
            await setDoc(docRef, datosCliente);
            mostrarExito("Cliente registrado exitosamente"); // <--- CAMBIO
        } else {
            await setDoc(docRef, datosCliente, { merge: true });
            mostrarExito("Cliente actualizado correctamente"); // <--- CAMBIO
        }

        mostrarLista();
        cargarTablaClientes();

    } catch (error) {
        console.error(error);
        mostrarError("No se pudo guardar: " + error.message); // <--- CAMBIO
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ==========================================
// CRUD: EDITAR Y BORRAR
// ==========================================
async function editarCliente(dni) {
    // Buscar en cache primero
    let cliente = clientesCache.find(c => c.dni == dni); // == por si es string/number
    
    // Si no está en caché (raro), buscamos en DB
    if (!cliente) {
        const docSnap = await getDoc(doc(db, "clientes", dni));
        if(docSnap.exists()) cliente = docSnap.data();
    }

    if (!cliente) return alert("Error al cargar datos del cliente");

    mostrarFormulario(false); // false = no limpiar formulario
    
    // Llenar campos
    document.getElementById("tituloFormulario").innerText = "Editar Cliente";
    document.getElementById("esEdicion").value = "true";
    
    document.getElementById("cliDni").value = cliente.dni;
    document.getElementById("cliDni").disabled = true; // Bloquear DNI

    document.getElementById("cliNombre").value = cliente.nombreCompleto || "";
    
    // Usamos ?. por seguridad si falta algún sub-objeto
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
        mostrarExito("Cliente eliminado correctamente."); // Alerta bonita
        cargarTablaClientes();
    } catch (error) {
        mostrarError(error.message);
    }
}

// Auxiliar para búsqueda
function generarKeywords(dni, nombre) {
    const arr = [];
    let curDni = '';
    // Keywords DNI
    if(dni){
        dni.toString().split('').forEach(letra => {
            curDni += letra;
            arr.push(curDni);
        });
    }
    
    // Keywords Nombre
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