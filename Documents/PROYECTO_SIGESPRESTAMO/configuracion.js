import { db } from "./firebaseconfig.js";
import { doc, getDoc, setDoc } from "firebase/firestore";

export function inicializarLogicaConfig() {
    console.log("Configuración Iniciada");
    cargarConfiguracionActual();

    document.getElementById("formConfig").addEventListener("submit", guardarConfiguracion);
}

async function cargarConfiguracionActual() {
    try {
        const docRef = doc(db, "configuracion", "general"); // Usamos un ID fijo 'general'
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById("confTasa").value = data.tasaPorDefecto || 30;
            document.getElementById("confCuotas").value = data.cuotasPorDefecto || 6;
        }
    } catch (error) {
        console.error("Error cargando config:", error);
    }
}

async function guardarConfiguracion(e) {
    e.preventDefault();
    const btn = document.getElementById("btnGuardarConfig");
    btn.disabled = true;
    btn.innerHTML = "Guardando...";

    try {
        const tasa = parseFloat(document.getElementById("confTasa").value);
        const cuotas = parseInt(document.getElementById("confCuotas").value);

        await setDoc(doc(db, "configuracion", "general"), {
            tasaPorDefecto: tasa,
            cuotasPorDefecto: cuotas
        });

        mostrarExito("Configuración guardada correctamente."); // <--- CAMBIO
    } catch (error) {
        console.error(error);
        mostrarError("No se pudo guardar la configuración."); // <--- CAMBIO
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save me-2"></i>Guardar Cambios';
    }
}