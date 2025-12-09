import { db } from "./firebaseconfig.js";
import { doc, setDoc, getDocs, collection, deleteDoc, query, where, updateDoc } from "firebase/firestore";
import { mostrarExito, mostrarError, confirmarAccion } from "./ui.js";

let loggedUserEmail = '';

export function inicializarLogicaUsuarios(userEmail) {

    if (window.USER_ROLE !== 'admin') {
        document.getElementById("contentArea").innerHTML = `
            <div class="alert alert-danger text-center mt-5">
                <h3>⛔ Acceso Denegado</h3>
                <p>No tienes permisos de Administrador para ver esta sección.</p>
            </div>
        `;
        return; 
    }
    
    console.log("Logica Usuarios Iniciada");

    loggedUserEmail = userEmail;

    loadUserTable();
    
    // Evento del formulario de alta
    const form = document.getElementById("formNuevoUsuario");
    if(form) {
        form.addEventListener("submit", handleNewUser);
    }
    
    // Exportar al window para el onclick del HTML
    window.loadUserTable = loadUserTable;
    window.deleteUser = deleteUser;
}

// ==========================================
// CRUD: CREAR / ACTUALIZAR
// ==========================================
async function handleNewUser(e) {
    e.preventDefault();
    
    const form = e.target;
    const btn = document.getElementById("btnGuardarUsuario");
    
    // Feedback visual en el botón
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';
    
    const email = document.getElementById("userEmail").value.trim().toLowerCase();
    const nombre = document.getElementById("userNombre").value.trim();
    const rol = document.getElementById("userRol").value;

    // YA NO NECESITAMOS ESTO (messageDiv) PORQUE USAMOS ALERTAS FLOTANTES
    // const messageDiv = document.getElementById("userMessage");
    // messageDiv.innerHTML = '';

    try {
        if (!email.includes('@')) throw new Error("Formato de email incorrecto.");

        const docRef = doc(db, "usuarios", email);
        
        // 1. Crear el objeto de datos
        const userData = {
            nombre: nombre || email.split('@')[0],
            rol: rol,
            fechaAlta: new Date().toISOString(),
        };

        // 2. Guardar
        await setDoc(docRef, userData);
        
        // CAMBIO: Alerta Bonita de Éxito
        mostrarExito(`Usuario ${email} registrado correctamente como ${rol.toUpperCase()}.`);
        
        form.reset();
        loadUserTable();

    } catch (error) {
        console.error(error);
        // CAMBIO: Alerta Bonita de Error
        mostrarError(error.message);
    } finally {
        // Restaurar botón
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-plus me-2"></i>Añadir';
    }
}

// ==========================================
// CRUD: LEER (LISTAR)
// ==========================================
async function loadUserTable() {
    const tbody = document.getElementById("userTableBody");
    tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4"><div class="spinner-border text-primary"></div></td></tr>';

    try {
        const querySnapshot = await getDocs(collection(db, "usuarios"));
        tbody.innerHTML = "";
        
        if (querySnapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-muted">No hay usuarios registrados.</td></tr>';
            return;
        }

        querySnapshot.forEach(doc => {
            const u = doc.data();
            const email = doc.id;
            
            // Colores según el rol
            const rolBadge = u.rol === 'admin' 
                ? `<span class="badge bg-danger">ADMIN</span>` 
                : `<span class="badge bg-primary">EMPLEADO</span>`;
            
            // Botón de eliminar deshabilitado si es el mismo usuario logueado
            const disableDelete = email === loggedUserEmail;
            const deleteBtn = `<button class="btn btn-sm btn-danger" onclick="deleteUser('${email}')" ${disableDelete ? 'disabled' : ''} title="Eliminar"><i class="fas fa-trash"></i></button>`;

            tbody.innerHTML += `
                <tr>
                    <td class="ps-4 fw-bold">${email}</td>
                    <td>${u.nombre || '-'}</td>
                    <td>${rolBadge}</td>
                    <td>${new Date(u.fechaAlta).toLocaleDateString()}</td>
                    <td class="text-end pe-4">
                        ${deleteBtn}
                    </td>
                </tr>
            `;
        });

    } catch (error) {
        console.error("Error al listar usuarios:", error);
        tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center">Error: ${error.message}</td></tr>`;
    }
}

// ==========================================
// CRUD: ELIMINAR
// ==========================================
async function deleteUser(email) {
    if(email === loggedUserEmail) {
        return mostrarError("No puedes eliminar tu propia cuenta mientras la usas.");
    }

    // 1. Confirmación bonita
    const confirmado = await confirmarAccion(
        "¿Eliminar Usuario?", 
        `Se revocará el acceso al sistema a: ${email}`
    );

    if(!confirmado) return;
    
    try {
        await deleteDoc(doc(db, "usuarios", email));
        mostrarExito("Usuario eliminado correctamente.");
        loadUserTable();
    } catch (error) {
        console.error(error);
        mostrarError("Error al eliminar: " + error.message);
    }
}