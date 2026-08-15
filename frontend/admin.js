// Esperar a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', () => {

  // Selección de los botones de las pestañas
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');

  // Selección de los formularios
  const loginSection = document.getElementById('login-section');
  const registerSection = document.getElementById('register-section');

  // Evento para mostrar el formulario de Login
  tabLogin.addEventListener('click', () => {
    // Activar pestaña de Login
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');

    // Mostrar sección de Login y ocultar Registro
    loginSection.classList.add('active');
    registerSection.classList.remove('active');
  });

  // Evento para mostrar el formulario de Registro
  tabRegister.addEventListener('click', () => {
    // Activar pestaña de Registro
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');

    // Mostrar sección de Registro y ocultar Login
    registerSection.classList.add('active');
    loginSection.classList.remove('active');
  });

});