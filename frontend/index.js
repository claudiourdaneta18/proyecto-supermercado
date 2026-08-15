
const imagen = document.querySelector(".shopping-car");

imagen.addEventListener("click", () => {
    imagen.classList.add("clicked");
    setTimeout(() => {
        imagen.classList.remove("clicked");
    
    }, 300);
});

//para hacer el menu de categorias emergente 
const menuBox = document.querySelector('.menu-box');
const menuBtn = document.getElementById('menu-btn');
const dropdownMenu = document.getElementById('dropdown-menu');

if (menuBox && dropdownMenu) {
    // Abrir cuando el mouse entra al botón o al propio menú
    menuBox.addEventListener('mouseenter', () => {
        dropdownMenu.classList.add('active');
    });

    // Cerrar ("absorber") cuando el mouse sale completamente del área del menú y del botón
    menuBox.addEventListener('mouseleave', () => {
        dropdownMenu.classList.remove('active');
    });

    // Soporte para clic en pantallas táctiles / móviles
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('active');
    });
}

//para el modal de mi cuenta.
document.addEventListener('DOMContentLoaded', () => {

    // 1. Elementos del Modal y Botón "Mi cuenta"
    const btnSesion = document.getElementById('sesion-btn');
    const modalCuenta = document.getElementById('modal-cuenta');
    const btnCerrarModal = document.getElementById('close-modal');

    // 2. Elementos de Pestañas y Formularios
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const loginSection = document.getElementById('login-section');
    const registerSection = document.getElementById('register-section');

    // --- ABRIR Y CERRAR MODAL ---
    btnSesion.addEventListener('click', () => {
        modalCuenta.classList.add('active');
    });

    btnCerrarModal.addEventListener('click', () => {
        modalCuenta.classList.remove('active');
    });

    // Cerrar al hacer clic en el fondo oscuro
    modalCuenta.addEventListener('click', (e) => {
        if (e.target === modalCuenta) {
            modalCuenta.classList.remove('active');
        }
    });

    // --- LÓGICA DE PESTAÑAS (LOGIN / REGISTRO) ---
    tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        loginSection.classList.add('active');
        registerSection.classList.remove('active');
    });

    tabRegister.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        registerSection.classList.add('active');
        loginSection.classList.remove('active');
    });

});