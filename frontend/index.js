
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
