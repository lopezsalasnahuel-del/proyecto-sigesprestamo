// 1. IMPORTACIONES CORRECTAS
// Importamos la conexión desde TU archivo de configuración
import { auth, db } from "./firebaseconfig.js";
import { mostrarExito, mostrarError, confirmarAccion } from "./ui.js";

// Importamos las herramientas de la librería oficial
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { inicializarLogicaInicio } from "./inicio.js";
import { inicializarLogicaClientes } from "./clientes.js";
import { inicializarLogicaPrestamos } from "./prestamos.js";
import { inicializarLogicaCaja } from "./caja.js";
import { inicializarLogicaUsuarios } from "./usuarios.js";
import { inicializarLogicaMora } from "./mora.js";
import { inicializarLogicaConfig } from "./configuracion.js";
import { inicializarLogicaReferentes } from "./referentes.js";

const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const loginScreen = document.getElementById("loginScreen");
const appContainer = document.getElementById("appContainer");
const loadingScreen = document.getElementById("loadingScreen");
window.USER_ROLE = 'guest';

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // A. Si Firebase dice que ya estás logueado:
        console.log("Sesión recuperada para:", user.email);
        
        // No mostramos el login, mostramos carga mientras verificamos rol
        loginScreen.style.display = "none";
        loadingScreen.style.display = "block";

        // Reutilizamos tu función para chequear rol y abrir la app
        await verificarUsuarioYEntrar(user);
        
    } else {
        // B. Si no hay usuario:
        console.log("No hay sesión activa.");
        window.USER_ROLE = 'guest';
        loadingScreen.style.display = "none";
        appContainer.style.display = "none"; // Ocultar app
        loginScreen.style.display = "flex";    // Mostrar login
    }
});


btnLogin.addEventListener("click", async () => {
    const provider = new GoogleAuthProvider();

    try {
        loginScreen.style.display = "none";
        loadingScreen.style.display = "block";

        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        console.log("Logueado como:", user.email);

        await verificarUsuarioYEntrar(user);

    } catch (error) {
        console.error("Error al entrar:", error);
        // CAMBIO: Alerta bonita
        mostrarError("No se pudo iniciar sesión: " + error.message);
        
        loadingScreen.style.display = "none";
        loginScreen.style.display = "flex";
    }
});

// Función para verificar rol y mostrar la app
async function verificarUsuarioYEntrar(usuarioLogueado) {
    const email = usuarioLogueado.email;

    try {
        // Buscamos el documento del usuario en Firestore
        const docRef = doc(db, "usuarios", email);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const datos = docSnap.data();
            const rol = datos.rol; // 'admin', 'empleado', etc.

            console.log(`Rol detectado: ${rol}`);

            window.USER_ROLE = rol; 

            document.getElementById("userEmailDisplay").innerText = email;
            document.getElementById("userRoleDisplay").innerText = rol.toUpperCase();

            // Mostramos la App
            loadingScreen.style.display = "none";
            appContainer.style.display = "block"; 

            // Lógica de visualización según Rol
            if (rol === 'admin') { 
                console.log("!!! ADMIN DETECTADO: HABILITANDO MENÚS !!!"); 
                document.querySelectorAll('.admin-feature').forEach(el => {
                    el.style.display = 'block'; 
                    el.style.visibility = 'visible';
                }); 
            } else {
                document.querySelectorAll('.admin-feature').forEach(el => {
                    el.style.display = 'none';
                });
            }
            
            cargarPagina('inicio');

        } else {
            // Usuario no existe en la DB
            console.warn("Usuario no registrado intentó acceder:", email);
            
            // CAMBIO: Alerta bonita de error
            mostrarError("No tienes permiso para acceder. Tu usuario no está registrado.");
            
            await signOut(auth); // Cerramos sesión
            
            loadingScreen.style.display = "none";
            loginScreen.style.display = "flex"; // Usar flex para centrar si tu CSS lo requiere
        }

    } catch (error) {
        console.error("Error consultando DB:", error);
        
        // CAMBIO: Alerta bonita de error técnico
        mostrarError("Error de conexión con la base de datos: " + error.message);
        
        loadingScreen.style.display = "none";
        loginScreen.style.display = "flex";
    }
}


if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
        // Preguntar antes de salir
        const salir = await confirmarAccion("¿Cerrar Sesión?", "Tendrás que volver a ingresar con Google.");
        
        if(salir) {
            await signOut(auth);
            appContainer.style.display = "none";
            loginScreen.style.display = "block";
            
            // Un pequeño toast de despedida
            const { mostrarToast } = await import("./ui.js"); // Import dinámico o usa el de arriba
            // O simplemente nada, ya que cambia la pantalla.
        }
    });
}

// --- PARTE C: NAVEGACIÓN DEL MENÚ (Cargar Páginas) ---

// Hacemos la función global para que funcione el onclick="..." del HTML
window.cargarPagina = async function(pagina) {
    const contentArea = document.getElementById("contentArea");
    contentArea.innerHTML = '<div class="text-center mt-5"><div class="spinner-border text-primary"></div></div>';

    try {
        switch (pagina) {
            case 'inicio': // REEMPLAZA el caso 'inicio' que tenías simple
                const htmlInicio = await (await fetch('inicio.html')).text();
                contentArea.innerHTML = htmlInicio;
                inicializarLogicaInicio();
                break;

            case 'clientes':
                const htmlCli = await (await fetch('clientes.html')).text();
                contentArea.innerHTML = htmlCli;
                // Importante: Si inicializar es async, usamos await
                await inicializarLogicaClientes(); 
                break;

            case 'prestamos':
                const htmlPrest = await (await fetch('prestamos.html')).text();
                contentArea.innerHTML = htmlPrest;
                // Importante: Usamos await para asegurar que window.verDetallePrestamo esté listo
                await inicializarLogicaPrestamos(); 
                break;

            case 'caja':
                const htmlCaja = await (await fetch('caja.html')).text();
                contentArea.innerHTML = htmlCaja;
                inicializarLogicaCaja();
                break;
                
            case 'usuarios':
                const htmlUser = await (await fetch('usuarios.html')).text();
                contentArea.innerHTML = htmlUser;
                // Pasamos el email del usuario actual (si existe el elemento)
                const userEmail = document.getElementById('userEmailDisplay') ? document.getElementById('userEmailDisplay').innerText : '';
                inicializarLogicaUsuarios(userEmail);
                break;

            case 'mora':
                const htmlMora = await (await fetch('mora.html')).text();
                contentArea.innerHTML = htmlMora;
                inicializarLogicaMora();
                break;

            case 'configuracion':
                const htmlConf = await (await fetch('configuracion.html')).text();
                contentArea.innerHTML = htmlConf;
                inicializarLogicaConfig();
                break;

            case 'referentes':
                const htmlRef = await (await fetch('referentes.html')).text();
                contentArea.innerHTML = htmlRef;
                inicializarLogicaReferentes();
                break;  

            default:
                contentArea.innerHTML = "<h1>Página no encontrada</h1>";
        }
    } catch (error) {
        console.error("Error cargando página:", error);
        contentArea.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    }
};

// ==========================================
// FUNCIÓN PUENTE: DE MORA A COBRANZA
// ==========================================
window.irACobrar = async function(idPrestamo) {
    // 1. Cargar la pantalla de Préstamos (inyecta el HTML correcto)
    await cargarPagina('prestamos');
    if (window.verDetallePrestamo) {
        window.verDetallePrestamo(idPrestamo);
    } else {
        alert("Error: No se pudo cargar el módulo de préstamos.");
    }
};