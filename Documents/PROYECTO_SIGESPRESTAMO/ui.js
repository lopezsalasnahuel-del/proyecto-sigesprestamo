// ui.js - Manejador de Alertas Bonitas

export function mostrarExito(mensaje) {
    Swal.fire({
        title: '¡Excelente!',
        text: mensaje,
        icon: 'success',
        confirmButtonColor: '#28a745', // Verde
        confirmButtonText: 'Aceptar'
    });
}

export function mostrarError(mensaje) {
    Swal.fire({
        title: 'Error',
        text: mensaje,
        icon: 'error',
        confirmButtonColor: '#dc3545', // Rojo
        confirmButtonText: 'Entendido'
    });
}

export function mostrarInfo(mensaje) {
    Swal.fire({
        title: 'Atención',
        text: mensaje,
        icon: 'info',
        confirmButtonColor: '#17a2b8' // Azul
    });
}

// Esta es clave: Reemplaza al confirm() nativo
export async function confirmarAccion(titulo, texto) {
    const resultado = await Swal.fire({
        title: titulo,
        text: texto,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Sí, confirmar',
        cancelButtonText: 'Cancelar'
    });

    return resultado.isConfirmed; // Devuelve true o false
}

// Una alerta pequeña que desaparece sola (Toast)
export function mostrarToast(mensaje) {
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer)
            toast.addEventListener('mouseleave', Swal.resumeTimer)
        }
    });

    Toast.fire({
        icon: 'success',
        title: mensaje
    });
}