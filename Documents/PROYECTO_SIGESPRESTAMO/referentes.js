import { db } from "./firebaseconfig.js";
import { collection, addDoc, getDocs, deleteDoc, doc } from "firebase/firestore";
import { mostrarExito, mostrarError, confirmarAccion } from "./ui.js";

export function inicializarLogicaReferentes() {
    console.log("Módulo Referentes Iniciado");
    cargarTablaReferentes();
    
    document.getElementById("formNuevoReferente").addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
            const nombre = document.getElementById("refNombre").value.trim().toUpperCase();
            const dni = document.getElementById("refDni").value.trim();
            const contacto = document.getElementById("refContacto").value.trim();

            await addDoc(collection(db, "referentes"), {
                nombre, dni, contacto, fechaAlta: new Date().toISOString()
            });

            mostrarExito("Referente agregado.");
            e.target.reset();
            cargarTablaReferentes();
        } catch (error) {
            mostrarError(error.message);
        }
    });
}

async function cargarTablaReferentes() {
    const tbody = document.getElementById("tablaReferentesBody");
    tbody.innerHTML = "<tr><td colspan='4' class='text-center'>Cargando...</td></tr>";
    
    try {
        const snap = await getDocs(collection(db, "referentes"));
        tbody.innerHTML = "";
        
        snap.forEach(docSnap => {
            const r = docSnap.data();
            tbody.innerHTML += `
                <tr>
                    <td class="ps-4 fw-bold">${r.nombre}</td>
                    <td>${r.dni || '-'}</td>
                    <td>${r.contacto || '-'}</td>
                    <td class="text-end pe-4">
                        <button class="btn btn-sm btn-danger" onclick="eliminarReferente('${docSnap.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        // Exponer la función de eliminar globalmente
        window.eliminarReferente = async (id) => {
            if(await confirmarAccion("¿Eliminar?", "Se borrará este referente.")) {
                await deleteDoc(doc(db, "referentes", id));
                cargarTablaReferentes();
            }
        };

    } catch (error) { console.error(error); }
}