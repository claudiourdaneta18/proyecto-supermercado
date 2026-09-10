const API_URL = window.location.port === '3000' ? '' : 'http://localhost:3000';

// Esperar a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', () => {

  // Selección de los botones de las pestañas
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');

  // Selección de las secciones de los formularios
  const loginSection = document.getElementById('login-section');
  const registerSection = document.getElementById('register-section');

  // Selección de los formularios
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  // Evento para mostrar el formulario de Login
  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');

    loginSection.classList.add('active');
    registerSection.classList.remove('active');
  });

  // Evento para mostrar el formulario de Registro
  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');

    registerSection.classList.add('active');
    loginSection.classList.remove('active');
  });

  // ==========================================
  // PETICIÓN HTTP: INICIO DE SESIÓN ADMINISTRADOR (LOGIN)
  // ==========================================
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(loginForm);
    const data = Object.fromEntries(formData.entries());

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Enviar/recibir cookies HttpOnly
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (response.ok && result.success) {
        alert(`✅ ¡Bienvenido, ${result.user.nombre}!`);
        window.location.href = 'panel-admin.html';
      } else {
        alert('❌ Error de acceso: ' + (result.message || 'Credenciales incorrectas'));
      }
    } catch (error) {
      alert('❌ No se pudo conectar con el servidor.');
    }
  });

  // ==========================================
  // PETICIÓN HTTP: REGISTRO DE ADMINISTRADOR
  // ==========================================
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(registerForm);
    const data = Object.fromEntries(formData.entries());

    try {
      // Validar preventivamente el conteo de administradores antes del registro
      const countRes = await fetch(`${API_URL}/api/admins/count`);
      if (countRes.ok) {
        const countData = await countRes.json();
        if (countData.success) {
          if (data.role === 'superadmin' && countData.superAdminCount >= countData.maxSuperAdmin) {
            alert('Solo puede haber un Super Admin y ya existe. Regístrese como administrador normal');
            return;
          }
          if (data.role === 'admin' && countData.standardAdminCount >= countData.maxStandardAdmin) {
            alert('Solo existe el cupo para 3 administradores normales.');
            return;
          }
        }
      }

      const response = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (response.ok && result.success) {
        alert(result.message || '✅ Administrador registrado exitosamente');
        registerForm.reset();
        tabLogin.click();
      } else {
        alert(result.message || '❌ Error al registrar administrador.');
      }
    } catch (error) {
      alert('❌ No se pudo conectar con el servidor.');
    }
  });

});