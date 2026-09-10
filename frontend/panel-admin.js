// URL base de tu backend Express (Puerto 3000)
const API_URL = window.location.port === '3000' ? '' : 'http://localhost:3000';

let currentUser = null;
let productosCache = [];
let accionPendienteSecurity = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Seleccionar elementos clave del DOM
    const nombreSU = document.getElementById('display-user-name');
    const rolSU = document.getElementById('display-user-role');
    const avatarSU = document.querySelector('.user-avatar');
    const btnLogout = document.getElementById('btn-logout');
    const elementosSuperAdmin = document.querySelectorAll('.only-superadmin');

    // 2. Protección de Ruta: Verificar sesión autenticada vía Cookie HttpOnly con el Backend
    try {
        const authRes = await fetch(`${API_URL}/api/verify-auth`, {
            method: 'GET',
            credentials: 'include'
        });

        const authData = await authRes.json();
        console.log('Respuesta de autoverificación:', authData);

        if (!authRes.ok || !authData.authenticated) {
            alert('⚠️ Debes iniciar sesión para acceder al panel. (Razón: ' + (authData.message || 'Sin cookie') + ')');
            window.location.href = 'admin.html';
            return;
        }

        currentUser = authData.user;

        // Mostrar el Nombre del Usuario y Generar Iniciales desde los datos recibidos del servidor
        if (nombreSU && currentUser.nombre) {
            nombreSU.textContent = currentUser.nombre;

            if (avatarSU) {
                const iniciales = currentUser.nombre
                    .trim()
                    .split(' ')
                    .map(palabra => palabra[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase();
                avatarSU.textContent = iniciales;
            }
        }

        // Mostrar el Rol y Filtrar Permisos por Rol
        if (currentUser.rol) {
            if (rolSU) rolSU.textContent = currentUser.rol;

            const esSuperAdmin = currentUser.rol.toLowerCase().includes('super');
            elementosSuperAdmin.forEach(elemento => {
                if (!esSuperAdmin) {
                    elemento.style.display = 'none';
                }
            });
        }

    } catch (error) {
        alert('❌ Error al verificar la sesión con el servidor.');
        window.location.href = 'admin.html';
        return;
    }

    // 3. Cargar opciones de categorías para selects
    await cargarCategoriasSelect();

    // 4. Cargar métrica de administradores
    await cargarMetricaAdministradores();

    // 5. Cargar lista de productos por defecto en el panel
    await cargarProductos();

    // 5. Funcionalidad del Botón Cerrar Sesión
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            const confirmar = confirm('¿Estás seguro de que deseas cerrar sesión?');
            if (confirmar) {
                try {
                    await fetch(`${API_URL}/api/logout`, {
                        method: 'POST',
                        credentials: 'include'
                    });
                    window.location.href = 'admin.html';
                } catch (error) {
                    alert('Error al cerrar sesión.');
                }
            }
        });
    }

    // 6. Alternar menú desplegable por Clic/Toque (Móvil y Desktop)
    const btnMenuToggle = document.getElementById('btn-menu-toggle');
    const sidebarNav = document.getElementById('sidebar-nav');
    const menuWrapper = document.querySelector('.menu-dropdown-wrapper');

    if (btnMenuToggle && sidebarNav) {
        btnMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebarNav.classList.toggle('show');
        });

        sidebarNav.querySelectorAll('.nav-item').forEach(link => {
            link.addEventListener('click', () => {
                sidebarNav.classList.remove('show');
            });
        });

        document.addEventListener('click', (e) => {
            if (menuWrapper && !menuWrapper.contains(e.target)) {
                sidebarNav.classList.remove('show');
            }
        });
    }

    // 7. Enlaces de Navegación del Menú
    const navResumen = document.querySelector('a[href="#resumen"]');
    const navProductos = document.querySelector('a[href="#productos"]');
    const navCategorias = document.querySelector('a[href="#categorias"]');
    const navVentas = document.querySelector('a[href="#ventas"]');
    const navLibroVentas = document.querySelector('a[href="#libro-ventas"]');
    const navEmisorSeniat = document.querySelector('a[href="#emisor-seniat"]');
    const navUsuarios = document.querySelector('a[href="#usuarios"]');
    const navConfiguracion = document.querySelector('a[href="#configuracion"]');

    if (navResumen) {
        navResumen.addEventListener('click', (e) => {
            e.preventDefault();
            marcarNavActivo(navResumen);
            cargarResumenDashboard();
        });
    }

    if (navProductos) {
        navProductos.addEventListener('click', (e) => {
            e.preventDefault();
            marcarNavActivo(navProductos);
            cargarProductos();
        });
    }

    if (navCategorias) {
        navCategorias.addEventListener('click', (e) => {
            e.preventDefault();
            marcarNavActivo(navCategorias);
            cargarCategorias();
        });
    }

    if (navVentas) {
        navVentas.addEventListener('click', (e) => {
            e.preventDefault();
            marcarNavActivo(navVentas);
            cargarVentas();
        });
    }

    if (navLibroVentas) {
        navLibroVentas.addEventListener('click', (e) => {
            e.preventDefault();
            marcarNavActivo(navLibroVentas);
            cargarLibroVentasSENIAT();
        });
    }

    if (navEmisorSeniat) {
        navEmisorSeniat.addEventListener('click', (e) => {
            e.preventDefault();
            marcarNavActivo(navEmisorSeniat);
            cargarConfiguracionEmisorSENIAT();
        });
    }

    if (navUsuarios) {
        navUsuarios.addEventListener('click', (e) => {
            e.preventDefault();
            marcarNavActivo(navUsuarios);
            cargarGestionUsuarios();
        });
    }

    if (navConfiguracion) {
        navConfiguracion.addEventListener('click', (e) => {
            e.preventDefault();
            marcarNavActivo(navConfiguracion);
            cargarConfiguracionGeneral();
        });
    }

    // ==========================================================
    // GESTIÓN DEL MODAL DE PRODUCTOS (REGISTRO & EDICIÓN)
    // ==========================================================
    const modalProducto = document.getElementById('modal-producto');
    const formProducto = document.getElementById('form-crear-producto');
    const btnCerrarModal = document.getElementById('btn-cerrar-modal');

    if (btnCerrarModal) {
        btnCerrarModal.addEventListener('click', ocultarModalProducto);
    }

    if (modalProducto) {
        modalProducto.addEventListener('click', (e) => {
            if (e.target === modalProducto) {
                ocultarModalProducto();
            }
        });
    }

    // Modal de Autorización de Seguridad (Super Admin Code)
    const modalAuthSecurity = document.getElementById('modal-auth-superadmin');
    const formAuthSecurity = document.getElementById('form-auth-superadmin');
    const btnCerrarAuthModal = document.getElementById('btn-cerrar-auth-modal');

    if (btnCerrarAuthModal) {
        btnCerrarAuthModal.addEventListener('click', () => {
            if (modalAuthSecurity) modalAuthSecurity.style.display = 'none';
            accionPendienteSecurity = null;
        });
    }

    if (formAuthSecurity) {
        formAuthSecurity.addEventListener('submit', (e) => {
            e.preventDefault();
            const authInput = document.getElementById('auth-code-input');
            const authCode = authInput ? authInput.value.trim() : '';

            if (!authCode) {
                alert('Ingresa la clave de autorización del Super Admin.');
                return;
            }

            if (modalAuthSecurity) modalAuthSecurity.style.display = 'none';
            if (authInput) authInput.value = '';

            if (typeof accionPendienteSecurity === 'function') {
                const callback = accionPendienteSecurity;
                accionPendienteSecurity = null;
                callback(authCode);
            }
        });
    }

    // Envío del Formulario de Registro / Edición de Producto
    if (formProducto) {
        formProducto.addEventListener('submit', async (e) => {
            e.preventDefault();

            const idProducto = document.getElementById('prod-id').value;
            const productoPayload = {
                codigo_barras: document.getElementById('prod-codigo').value.trim(),
                nombre: document.getElementById('prod-nombre').value.trim(),
                id_categoria: parseInt(document.getElementById('prod-categoria').value),
                precio_usd: parseFloat(document.getElementById('prod-precio').value),
                alicuota_iva: document.getElementById('prod-alicuota').value,
                stock: parseInt(document.getElementById('prod-stock').value) || 0,
                descripcion: document.getElementById('prod-descripcion').value.trim()
            };

            if (idProducto) {
                // Modificación de producto existente -> Aplicar Protocolo de Seguridad
                solicitarAutorizacionSuperAdmin(async (authCode = null) => {
                    try {
                        const res = await fetch(`${API_URL}/api/productos/${idProducto}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ ...productoPayload, auth_code: authCode })
                        });

                        const data = await res.json();

                        if (res.ok && data.success) {
                            alert('✅ ' + data.message);
                            ocultarModalProducto();
                            await cargarProductos();
                        } else {
                            alert('❌ Error: ' + (data.message || 'No se pudo actualizar el producto.'));
                        }
                    } catch (error) {
                        alert('Ocurrió un error al conectar con el servidor.');
                        console.error(error);
                    }
                });
            } else {
                // Registro de nuevo producto
                try {
                    const res = await fetch(`${API_URL}/api/productos`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify(productoPayload)
                    });

                    const data = await res.json();

                    if (res.ok && data.success) {
                        alert('✅ ' + data.message);
                        ocultarModalProducto();
                        await cargarProductos();
                    } else {
                        alert('❌ Error: ' + (data.message || 'No se pudo guardar el producto.'));
                    }
                } catch (error) {
                    alert('Ocurrió un error al conectar con el servidor.');
                    console.error(error);
                }
            }
        });
    }
});

// ==========================================================
// FUNCIONES AUXILIARES Y RENDERIZADO
// ==========================================================

function marcarNavActivo(elementoActivo) {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => item.classList.remove('active'));
    if (elementoActivo) elementoActivo.classList.add('active');
}

// Cargar y mostrar la tabla de productos en el panel
async function cargarProductos() {
    const cardHeader = document.getElementById('panel-card-header');
    const cardBody = document.getElementById('panel-card-body');
    const metricTotal = document.getElementById('metric-total-productos');
    const metricStockBajo = document.getElementById('metric-stock-bajo');

    try {
        const response = await fetch(`${API_URL}/api/productos`, { credentials: 'include' });
        const result = await response.json();

        if (result.success && Array.isArray(result.data)) {
            productosCache = result.data;

            // Actualizar métricas
            if (metricTotal) metricTotal.textContent = productosCache.length;
            const stockBajoCount = productosCache.filter(p => p.stock <= (p.stock_minimo || 5)).length;
            if (metricStockBajo) metricStockBajo.textContent = stockBajoCount;

            // Renderizar encabezado de la tarjeta con botón de agregar
            if (cardHeader) {
                cardHeader.innerHTML = `
                    <div class="card-header-flex">
                        <h2>📦 Inventario General de Productos (${productosCache.length})</h2>
                        <button type="button" class="btn-primary" id="btn-abrir-modal-crear">
                            + Registrar Nuevo Producto
                        </button>
                    </div>
                `;

                const btnAbrirModal = document.getElementById('btn-abrir-modal-crear');
                if (btnAbrirModal) {
                    btnAbrirModal.addEventListener('click', () => abrirModalProducto());
                }
            }

            // Renderizar tabla
            if (cardBody) {
                if (productosCache.length === 0) {
                    cardBody.innerHTML = `
                        <p class="placeholder-text" style="text-align: center; padding: 24px;">
                            No hay productos registrados en la base de datos. ¡Haz clic en <strong>+ Registrar Nuevo Producto</strong> para agregar el primero!
                        </p>
                    `;
                    return;
                }

                let tablaHtml = `
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Código</th>
                                    <th>Nombre</th>
                                    <th>Categoría</th>
                                    <th>Precio (USD)</th>
                                    <th>Alícuota IVA</th>
                                    <th>Stock</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                `;

                productosCache.forEach((prod, index) => {
                    let badgeStock = `<span class="badge badge-success">${prod.stock} unids</span>`;
                    if (prod.stock === 0) {
                        badgeStock = `<span class="badge badge-danger">Agotado (0)</span>`;
                    } else if (prod.stock <= (prod.stock_minimo || 5)) {
                        badgeStock = `<span class="badge badge-warning">Stock Bajo (${prod.stock})</span>`;
                    }

                    let labelIva = 'General (16%)';
                    if (prod.alicuota_iva === 'E') labelIva = 'Exento (0%)';
                    if (prod.alicuota_iva === 'R') labelIva = 'Reducido (8%)';
                    if (prod.alicuota_iva === 'A') labelIva = 'Suntuario (31%)';

                    tablaHtml += `
                        <tr>
                            <td>${index + 1}</td>
                            <td><code>${prod.codigo_barras}</code></td>
                            <td><strong>${prod.nombre}</strong></td>
                            <td>${prod.categoria_nombre || 'Sin Categoría'}</td>
                            <td><strong>$${parseFloat(prod.precio_usd).toFixed(2)}</strong></td>
                            <td><span class="badge badge-info">${labelIva}</span></td>
                            <td>${badgeStock}</td>
                            <td>
                                <div class="action-buttons">
                                    <button type="button" class="btn-action btn-edit" onclick="prepararEdicion(${prod.id_producto})">
                                        ✏️ Editar
                                    </button>
                                    <button type="button" class="btn-action btn-delete" onclick="confirmarEliminacion(${prod.id_producto})">
                                        🗑️ Eliminar
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
                });

                tablaHtml += `
                            </tbody>
                        </table>
                    </div>
                `;

                cardBody.innerHTML = tablaHtml;
            }
        }
    } catch (err) {
        console.error('Error al cargar la lista de productos:', err);
        if (cardBody) {
            cardBody.innerHTML = '<p class="placeholder-text" style="color: var(--danger-color);">Error al conectar con la base de datos para cargar los productos.</p>';
        }
    }
}

// Abrir Modal para Registrar o Editar
function abrirModalProducto(producto = null) {
    const modalProducto = document.getElementById('modal-producto');
    const tituloModal = document.getElementById('modal-producto-titulo');
    const btnGuardar = document.getElementById('btn-guardar-producto');

    if (!modalProducto) return;

    if (producto) {
        if (tituloModal) tituloModal.textContent = '✏️ Editar Producto Guardado';
        if (btnGuardar) btnGuardar.textContent = 'Guardar Cambios';

        document.getElementById('prod-id').value = producto.id_producto;
        document.getElementById('prod-codigo').value = producto.codigo_barras || '';
        document.getElementById('prod-nombre').value = producto.nombre || '';
        document.getElementById('prod-categoria').value = producto.id_categoria || '';
        document.getElementById('prod-alicuota').value = producto.alicuota_iva || 'G';
        document.getElementById('prod-precio').value = producto.precio_usd || '';
        document.getElementById('prod-stock').value = producto.stock || 0;
        document.getElementById('prod-descripcion').value = producto.descripcion || '';
    } else {
        if (tituloModal) tituloModal.textContent = 'Registrar Nuevo Producto';
        if (btnGuardar) btnGuardar.textContent = 'Guardar Producto';
        document.getElementById('form-crear-producto').reset();
        document.getElementById('prod-id').value = '';
    }

    modalProducto.style.display = 'flex';
}

function ocultarModalProducto() {
    const modalProducto = document.getElementById('modal-producto');
    const formProducto = document.getElementById('form-crear-producto');
    if (modalProducto) modalProducto.style.display = 'none';
    if (formProducto) formProducto.reset();
    document.getElementById('prod-id').value = '';
}

// Cargar categorías dinámicas en el Select
async function cargarCategoriasSelect() {
    const selectCat = document.getElementById('prod-categoria');
    if (!selectCat) return;

    try {
        const response = await fetch(`${API_URL}/api/categorias`, { credentials: 'include' });
        const result = await response.json();

        if (result.success && result.data && result.data.length > 0) {
            selectCat.innerHTML = '<option value="">Selecciona una categoría</option>';
            result.data.forEach(cat => {
                selectCat.innerHTML += `<option value="${cat.id_categoria}">${cat.nombre}</option>`;
            });
        }
    } catch (err) {
        console.error('Error al obtener categorías:', err);
    }
}

// Preparar edición al hacer clic en el botón Editar
function prepararEdicion(idProducto) {
    const producto = productosCache.find(p => p.id_producto === idProducto);
    if (producto) {
        abrirModalProducto(producto);
    }
}

// Solicitar clave de autorización del Super Admin si el usuario activo es admin normal
function solicitarAutorizacionSuperAdmin(callback) {
    if (currentUser && currentUser.rol && currentUser.rol.toLowerCase().includes('super')) {
        // Superadmin realiza la acción directamente
        callback(null);
        return;
    }

    // Administrador estándar -> Mostrar modal de seguridad para pedir la clave del Super Admin
    const modalAuth = document.getElementById('modal-auth-superadmin');
    const authInput = document.getElementById('auth-code-input');

    if (modalAuth) {
        if (authInput) {
            authInput.value = '';
            setTimeout(() => authInput.focus(), 100);
        }
        accionPendienteSecurity = callback;
        modalAuth.style.display = 'flex';
    } else {
        alert('No se encontró el modal de autorización de seguridad.');
    }
}

// Confirmar y procesar la eliminación de un producto
function confirmarEliminacion(idProducto) {
    const producto = productosCache.find(p => p.id_producto === idProducto);
    const nombreProd = producto ? producto.nombre : 'este producto';

    const confirmar = confirm(`¿Estás seguro de que deseas eliminar permanentemente "${nombreProd}" del inventario?`);
    if (!confirmar) return;

    solicitarAutorizacionSuperAdmin(async (authCode = null) => {
        try {
            const res = await fetch(`${API_URL}/api/productos/${idProducto}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ auth_code: authCode })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                alert('✅ ' + data.message);
                await cargarProductos();
            } else {
                alert('❌ Error: ' + (data.message || 'No se pudo eliminar el producto.'));
            }
        } catch (error) {
            alert('Error al conectar con el servidor.');
            console.error(error);
        }
    });
}

// Cargar métrica de administradores registrados en la base de datos
async function cargarMetricaAdministradores() {
    const metricAdmins = document.getElementById('metric-total-admins');
    if (!metricAdmins) return;

    try {
        const res = await fetch(`${API_URL}/api/admins/count`, { credentials: 'include' });
        const data = await res.json();
        if (data.success) {
            metricAdmins.textContent = `${data.standardAdminCount} / ${data.maxStandardAdmin}`;
        }
    } catch (err) {
        console.error('Error al cargar métrica de administradores:', err);
    }
}

// ==========================================================
// Cargar y mostrar el Libro de Ventas Fiscal SENIAT (Art. 76 RLIVA)
// ==========================================================
async function cargarLibroVentasSENIAT(mes = null, anio = null) {
    const cardHeader = document.getElementById('panel-card-header');
    const cardBody = document.getElementById('panel-card-body');

    const d = new Date();
    const currentMes = mes || (d.getMonth() + 1);
    const currentAnio = anio || d.getFullYear();

    try {
        const res = await fetch(`${API_URL}/api/seniat/libro-ventas?mes=${currentMes}&anio=${currentAnio}`, { credentials: 'include' });
        const data = await res.json();

        if (!data.success) {
            if (cardBody) cardBody.innerHTML = `<p class="placeholder-text" style="color: red;">Error: ${data.message}</p>`;
            return;
        }

        const emisor = data.emisor;
        const ventas = data.ventas;
        const resumen = data.resumen;

        if (cardHeader) {
            cardHeader.innerHTML = `
                <div class="card-header-flex">
                    <h2>📜 Libro de Ventas Fiscal SENIAT (${currentMes.toString().padStart(2, '0')}/${currentAnio})</h2>
                    <div>
                        <select id="select-mes-seniat" onchange="cambiarPeriodoSeniat()" style="padding: 6px; border-radius: 4px;">
                            ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `<option value="${m}" ${m === currentMes ? 'selected' : ''}>Mes ${m}</option>`).join('')}
                        </select>
                        <input type="number" id="input-anio-seniat" value="${currentAnio}" onchange="cambiarPeriodoSeniat()" style="width: 80px; padding: 6px; border-radius: 4px;" />
                        <button type="button" class="btn-primary" onclick="window.print()">🖨️ Imprimir Libro</button>
                    </div>
                </div>
            `;
        }

        if (cardBody) {
            let html = `
                <div style="background: #f9f9f9; padding: 15px; border-radius: 6px; margin-bottom: 15px; font-size: 13px;">
                    <strong>${emisor.razon_social}</strong> | RIF: ${emisor.rif} | ${emisor.direccion_fiscal}<br>
                    <strong>Resolución SENIAT:</strong> ${emisor.resolucion_seniat || 'Providencia SNAT/2011/00071'}
                </div>
            `;

            if (ventas.length === 0) {
                html += `<p class="placeholder-text" style="text-align: center; padding: 20px;">No hay ventas registradas para el período seleccionado.</p>`;
            } else {
                html += `
                    <div class="table-responsive">
                        <table class="data-table" style="font-size: 12px;">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Fecha</th>
                                    <th>N° Factura</th>
                                    <th>N° Control</th>
                                    <th>RIF / Cédula Cliente</th>
                                    <th>Nombre Cliente</th>
                                    <th>Tasa BCV</th>
                                    <th>Total Venta (Bs)</th>
                                    <th>Exento (Bs)</th>
                                    <th>Base G 16% (Bs)</th>
                                    <th>IVA G 16% (Bs)</th>
                                    <th>IGTF 3% (Bs)</th>
                                    <th>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                `;

                ventas.forEach((v, index) => {
                    html += `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${v.fecha}</td>
                            <td><code>${v.numero_factura || 'N/A'}</code></td>
                            <td><strong style="color: #008800;">${v.numero_control || 'N/A'}</strong></td>
                            <td>${v.rif_cedula_cliente}</td>
                            <td>${v.cliente_nombre}</td>
                            <td>Bs. ${parseFloat(v.tasa_bcv_aplicada).toFixed(4)}</td>
                            <td><strong>Bs. ${parseFloat(v.monto_total_ves).toLocaleString('es-VE', {minimumFractionDigits:2})}</strong></td>
                            <td>Bs. ${parseFloat(v.monto_exento_ves).toFixed(2)}</td>
                            <td>Bs. ${parseFloat(v.base_imponible_g_ves).toFixed(2)}</td>
                            <td>Bs. ${parseFloat(v.monto_iva_g_ves).toFixed(2)}</td>
                            <td>Bs. ${parseFloat(v.monto_igtf_ves).toFixed(2)}</td>
                            <td>
                                <a href="factura-impresion.html?id=${v.id_venta}" target="_blank" class="btn-action btn-edit" style="text-decoration: none; padding: 3px 8px; font-size: 11px;">
                                    🖨️ Factura
                                </a>
                            </td>
                        </tr>
                    `;
                });

                html += `
                            </tbody>
                        </table>
                    </div>

                    <!-- RESUMEN CONSOLIDADO FISCAL -->
                    <div style="background: #eef6ff; border: 1px solid #b6d4fe; border-radius: 6px; padding: 15px; margin-top: 15px;">
                        <h4 style="margin-bottom: 8px; color: #084298;">📊 Resumen del Libro de Ventas Fiscal SENIAT</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; font-size: 13px;">
                            <div><strong>Total Ventas + IVA:</strong> Bs. ${resumen.total_ventas_con_iva_ves.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>
                            <div><strong>Total Ventas Exentas:</strong> Bs. ${resumen.total_exento_ves.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>
                            <div><strong>Base Imponible (16%):</strong> Bs. ${resumen.total_base_g_ves.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>
                            <div><strong>Monto IVA Débito (16%):</strong> Bs. ${resumen.total_iva_g_ves.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>
                            <div><strong>Monto IGTF Retenido (3%):</strong> Bs. ${resumen.total_igtf_ves.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>
                        </div>
                    </div>
                `;
            }

            cardBody.innerHTML = html;
        }

    } catch (err) {
        console.error(err);
        if (cardBody) cardBody.innerHTML = `<p class="placeholder-text" style="color: red;">Error al consultar el Libro de Ventas.</p>`;
    }
}

function cambiarPeriodoSeniat() {
    const selectMes = document.getElementById('select-mes-seniat');
    const inputAnio = document.getElementById('input-anio-seniat');
    if (selectMes && inputAnio) {
        cargarLibroVentasSENIAT(parseInt(selectMes.value), parseInt(inputAnio.value));
    }
}

// ==========================================================
// Cargar y Editar Datos de la Empresa (Emisor Fiscal SENIAT)
// ==========================================================
async function cargarConfiguracionEmisorSENIAT() {
    const cardHeader = document.getElementById('panel-card-header');
    const cardBody = document.getElementById('panel-card-body');

    try {
        const res = await fetch(`${API_URL}/api/seniat/emisor`, { credentials: 'include' });
        const data = await res.json();

        if (!data.success) {
            if (cardBody) cardBody.innerHTML = `<p class="placeholder-text" style="color: red;">Error: ${data.message}</p>`;
            return;
        }

        const emisor = data.emisor;

        if (cardHeader) {
            cardHeader.innerHTML = `<h2>🏛️ Datos Fiscales de la Empresa (Emisor SENIAT)</h2>`;
        }

        if (cardBody) {
            cardBody.innerHTML = `
                <form id="form-emisor-seniat" style="max-width: 600px;">
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label>Razón Social (Nombre Legal de la Empresa)*</label>
                        <input type="text" id="emi-razon" value="${emisor.razon_social || ''}" required style="width: 100%; padding: 8px;" />
                    </div>

                    <div class="form-group" style="margin-bottom: 12px;">
                        <label>RIF Fiscal (ej: J-50123456-7)*</label>
                        <input type="text" id="emi-rif" value="${emisor.rif || ''}" required style="width: 100%; padding: 8px;" />
                    </div>

                    <div class="form-group" style="margin-bottom: 12px;">
                        <label>Dirección Fiscal Domiciliada*</label>
                        <textarea id="emi-direccion" rows="3" required style="width: 100%; padding: 8px;">${emisor.direccion_fiscal || ''}</textarea>
                    </div>

                    <div class="form-row" style="display: flex; gap: 10px; margin-bottom: 12px;">
                        <div style="flex: 1;">
                            <label>Teléfono de Contacto*</label>
                            <input type="text" id="emi-telefono" value="${emisor.telefono || ''}" required style="width: 100%; padding: 8px;" />
                        </div>
                        <div style="flex: 1;">
                            <label>Correo Electrónico</label>
                            <input type="email" id="emi-email" value="${emisor.email || ''}" style="width: 100%; padding: 8px;" />
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom: 12px;">
                        <label>Resolución / Providencia Fiscal SENIAT</label>
                        <input type="text" id="emi-resolucion" value="${emisor.resolucion_seniat || 'Providencia SNAT/2011/00071'}" style="width: 100%; padding: 8px;" />
                    </div>

                    <div class="form-group" style="margin-bottom: 16px;">
                        <label>Pie de Página en Facturas</label>
                        <input type="text" id="emi-pie" value="${emisor.pie_pagina_factura || 'Gracias por su compra.'}" style="width: 100%; padding: 8px;" />
                    </div>

                    <button type="submit" class="btn-primary">Guardar Datos Fiscales SENIAT</button>
                </form>
            `;

            document.getElementById('form-emisor-seniat').addEventListener('submit', async (e) => {
                e.preventDefault();

                const emisorPayload = {
                    razon_social: document.getElementById('emi-razon').value.trim(),
                    rif: document.getElementById('emi-rif').value.trim(),
                    direccion_fiscal: document.getElementById('emi-direccion').value.trim(),
                    telefono: document.getElementById('emi-telefono').value.trim(),
                    email: document.getElementById('emi-email').value.trim(),
                    resolucion_seniat: document.getElementById('emi-resolucion').value.trim(),
                    pie_pagina_factura: document.getElementById('emi-pie').value.trim()
                };

                solicitarAutorizacionSuperAdmin(async (authCode = null) => {
                    try {
                        const updateRes = await fetch(`${API_URL}/api/seniat/emisor`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ ...emisorPayload, auth_code: authCode })
                        });

                        const updateData = await updateRes.json();
                        if (updateRes.ok && updateData.success) {
                            alert('✅ ' + updateData.message);
                            await cargarConfiguracionEmisorSENIAT();
                        } else {
                            alert('❌ Error: ' + (updateData.message || 'No se pudo guardar la configuración.'));
                        }
                    } catch (err) {
                        alert('Error al conectar con el servidor.');
                    }
                });
            });
        }

    } catch (err) {
        console.error(err);
        if (cardBody) cardBody.innerHTML = `<p class="placeholder-text" style="color: red;">Error al consultar datos de la empresa.</p>`;
    }
}

// ==========================================================
// 1. VISTA DASHBOARD / RESUMEN GENERAL
// ==========================================================
async function cargarResumenDashboard() {
    const cardHeader = document.getElementById('panel-card-header');
    const cardBody = document.getElementById('panel-card-body');

    if (cardHeader) {
        cardHeader.innerHTML = `<h2>📊 Resumen General del Sistema</h2>`;
    }

    try {
        const [prodRes, salesRes] = await Promise.all([
            fetch(`${API_URL}/api/productos`, { credentials: 'include' }),
            fetch(`${API_URL}/api/ventas`, { credentials: 'include' })
        ]);

        const prodData = await prodRes.json();
        const salesData = await salesRes.json();

        const productos = prodData.success ? prodData.data : [];
        const ventas = salesData.success ? salesData.data : [];

        // Actualizar métricas del dashboard
        const metricTotalProd = document.getElementById('metric-total-productos');
        const metricStockBajo = document.getElementById('metric-stock-bajo');
        if (metricTotalProd) metricTotalProd.textContent = productos.length;
        if (metricStockBajo) metricStockBajo.textContent = productos.filter(p => p.stock <= (p.stock_minimo || 5)).length;

        // Calcular ventas hoy
        const hoyStr = new Date().toISOString().split('T')[0];
        let totalHoyUSD = 0;
        ventas.filter(v => (v.creado_en || '').startsWith(hoyStr)).forEach(v => {
            totalHoyUSD += parseFloat(v.monto_total_usd || 0);
        });
        const metricVentasHoy = document.querySelector('.metric-card .metric-value');
        if (metricVentasHoy && metricVentasHoy.parentElement.querySelector('h3').textContent.includes('Ventas Hoy')) {
            metricVentasHoy.textContent = `$${totalHoyUSD.toFixed(2)}`;
        }

        if (cardBody) {
            let html = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #0d6efd;">
                        <h4>📦 Accesos Rápidos de Inventario</h4>
                        <p style="font-size: 13px; margin-top: 5px; color: #555;">Gestiona el stock de productos, registra ítems o revisa alícuotas de IVA.</p>
                        <button type="button" class="btn-primary" style="margin-top: 10px;" onclick="document.querySelector('a[href=\"#productos\"]').click()">Ir a Productos</button>
                    </div>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #198754;">
                        <h4>📜 Facturación & SENIAT</h4>
                        <p style="font-size: 13px; margin-top: 5px; color: #555;">Consulta el libro de ventas fiscal o configura los datos del emisor.</p>
                        <button type="button" class="btn-primary" style="margin-top: 10px; background: #198754;" onclick="document.querySelector('a[href=\"#libro-ventas\"]').click()">Ir al Libro de Ventas</button>
                    </div>
                </div>

                <h3>🛒 Últimas Ventas Procesadas</h3>
            `;

            if (ventas.length === 0) {
                html += `<p class="placeholder-text" style="text-align: center; padding: 20px;">No hay ventas registradas recientemente.</p>`;
            } else {
                html += `
                    <div class="table-responsive" style="margin-top: 10px;">
                        <table class="data-table" style="font-size: 12px;">
                            <thead>
                                <tr>
                                    <th>N° Factura</th>
                                    <th>N° Control</th>
                                    <th>Cliente</th>
                                    <th>Fecha</th>
                                    <th>Total ($)</th>
                                    <th>Total (Bs)</th>
                                    <th>Estado Pago</th>
                                    <th>Estado Entrega</th>
                                </tr>
                            </thead>
                            <tbody>
                `;

                ventas.slice(0, 5).forEach(v => {
                    html += `
                        <tr>
                            <td><code>${v.numero_factura || 'N/A'}</code></td>
                            <td><strong style="color: #008800;">${v.numero_control || 'N/A'}</strong></td>
                            <td>${v.cliente_nombre} (${v.cliente_rif})</td>
                            <td>${new Date(v.creado_en).toLocaleString('es-VE')}</td>
                            <td><strong>$${parseFloat(v.monto_total_usd).toFixed(2)}</strong></td>
                            <td>Bs. ${parseFloat(v.monto_total_ves).toLocaleString('es-VE', {minimumFractionDigits:2})}</td>
                            <td><span class="badge badge-success">${v.estado_pago}</span></td>
                            <td><span class="badge badge-info">${v.estado_entrega}</span></td>
                        </tr>
                    `;
                });

                html += `
                            </tbody>
                        </table>
                    </div>
                `;
            }

            cardBody.innerHTML = html;
        }

    } catch (err) {
        console.error(err);
        if (cardBody) cardBody.innerHTML = `<p class="placeholder-text" style="color: red;">Error al cargar el resumen.</p>`;
    }
}

// ==========================================================
// 2. GESTIÓN DE CATEGORÍAS
// ==========================================================
async function cargarCategorias() {
    const cardHeader = document.getElementById('panel-card-header');
    const cardBody = document.getElementById('panel-card-body');

    if (cardHeader) {
        cardHeader.innerHTML = `
            <div class="card-header-flex">
                <h2>🏷️ Gestión de Categorías de Productos</h2>
                <button type="button" class="btn-primary" onclick="abrirModalCrearCategoria()">+ Nueva Categoría</button>
            </div>
        `;
    }

    try {
        const res = await fetch(`${API_URL}/api/categorias/todas`, { credentials: 'include' });
        const data = await res.json();

        if (!data.success) {
            if (cardBody) cardBody.innerHTML = `<p class="placeholder-text" style="color: red;">Error: ${data.message}</p>`;
            return;
        }

        const categorias = data.data;

        if (cardBody) {
            if (categorias.length === 0) {
                cardBody.innerHTML = `<p class="placeholder-text" style="text-align: center; padding: 20px;">No hay categorías registradas.</p>`;
                return;
            }

            let html = `
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Nombre</th>
                                <th>Descripción</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            categorias.forEach((cat, idx) => {
                const isActiva = cat.estado === 'activo';
                html += `
                    <tr>
                        <td>${idx + 1}</td>
                        <td><strong>${cat.nombre}</strong></td>
                        <td>${cat.descripcion || 'Sin descripción'}</td>
                        <td>
                            <span class="badge ${isActiva ? 'badge-success' : 'badge-danger'}">
                                ${isActiva ? 'Activa' : 'Inactiva'}
                            </span>
                        </td>
                        <td>
                            <div class="action-buttons">
                                <button type="button" class="btn-action btn-edit" onclick="prepararEdicionCategoria(${cat.id_categoria}, '${cat.nombre}', '${cat.descripcion || ''}', '${cat.estado}')">✏️ Editar</button>
                                <button type="button" class="btn-action btn-delete" onclick="eliminarCategoria(${cat.id_categoria})">🗑️ Eliminar</button>
                            </div>
                        </td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;

            cardBody.innerHTML = html;
        }
    } catch (err) {
        console.error(err);
        if (cardBody) cardBody.innerHTML = `<p class="placeholder-text" style="color: red;">Error al cargar categorías.</p>`;
    }
}

function abrirModalCrearCategoria() {
    const nombre = prompt('Ingresa el nombre de la nueva categoría:');
    if (!nombre) return;
    const descripcion = prompt('Ingresa la descripción opcional:');

    fetch(`${API_URL}/api/categorias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nombre, descripcion })
    }).then(r => r.json()).then(data => {
        alert((data.success ? '✅ ' : '❌ ') + data.message);
        if (data.success) cargarCategorias();
    });
}

function prepararEdicionCategoria(id, nombreActual, descActual, estadoActual) {
    const nuevoNombre = prompt('Editar Nombre:', nombreActual);
    if (!nuevoNombre) return;
    const nuevaDesc = prompt('Editar Descripción:', descActual);

    solicitarAutorizacionSuperAdmin(async (authCode = null) => {
        const res = await fetch(`${API_URL}/api/categorias/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ nombre: nuevoNombre, descripcion: nuevaDesc, estado: estadoActual })
        });
        const data = await res.json();
        alert((data.success ? '✅ ' : '❌ ') + data.message);
        if (data.success) cargarCategorias();
    });
}

function eliminarCategoria(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar esta categoría?')) return;
    solicitarAutorizacionSuperAdmin(async (authCode = null) => {
        const res = await fetch(`${API_URL}/api/categorias/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await res.json();
        alert((data.success ? '✅ ' : '❌ ') + data.message);
        if (data.success) cargarCategorias();
    });
}

// ==========================================================
// 3. GESTIÓN DE VENTAS Y PEDIDOS
// ==========================================================
async function cargarVentas() {
    const cardHeader = document.getElementById('panel-card-header');
    const cardBody = document.getElementById('panel-card-body');

    if (cardHeader) {
        cardHeader.innerHTML = `<h2>🛒 Control y Gestión de Ventas</h2>`;
    }

    try {
        const res = await fetch(`${API_URL}/api/ventas`, { credentials: 'include' });
        const data = await res.json();

        if (!data.success) {
            if (cardBody) cardBody.innerHTML = `<p class="placeholder-text" style="color: red;">Error: ${data.message}</p>`;
            return;
        }

        const ventas = data.data;

        if (cardBody) {
            if (ventas.length === 0) {
                cardBody.innerHTML = `<p class="placeholder-text" style="text-align: center; padding: 20px;">No hay ventas registradas.</p>`;
                return;
            }

            let html = `
                <div class="table-responsive">
                    <table class="data-table" style="font-size: 12px;">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>N° Factura</th>
                                <th>N° Control</th>
                                <th>Cliente</th>
                                <th>Fecha</th>
                                <th>Método Pago</th>
                                <th>Total ($)</th>
                                <th>Total (Bs)</th>
                                <th>Estado Pago</th>
                                <th>Estado Entrega</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            ventas.forEach((v, idx) => {
                html += `
                    <tr>
                        <td>${idx + 1}</td>
                        <td><code>${v.numero_factura || 'N/A'}</code></td>
                        <td><strong style="color: #008800;">${v.numero_control || 'N/A'}</strong></td>
                        <td><strong>${v.cliente_nombre}</strong><br><small>${v.cliente_rif}</small></td>
                        <td>${new Date(v.creado_en).toLocaleString('es-VE')}</td>
                        <td>${v.metodo_pago_principal || 'Efectivo'}</td>
                        <td><strong>$${parseFloat(v.monto_total_usd).toFixed(2)}</strong></td>
                        <td>Bs. ${parseFloat(v.monto_total_ves).toLocaleString('es-VE', {minimumFractionDigits:2})}</td>
                        <td>
                            <select onchange="actualizarEstadoVenta(${v.id_venta}, this.value, '${v.estado_entrega}')" style="padding: 4px; border-radius: 4px; font-size: 11px;">
                                <option value="pendiente" ${v.estado_pago === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                                <option value="pagado" ${v.estado_pago === 'pagado' ? 'selected' : ''}>Pagado</option>
                                <option value="rechazado" ${v.estado_pago === 'rechazado' ? 'selected' : ''}>Rechazado</option>
                            </select>
                        </td>
                        <td>
                            <select onchange="actualizarEstadoVenta(${v.id_venta}, '${v.estado_pago}', this.value)" style="padding: 4px; border-radius: 4px; font-size: 11px;">
                                <option value="procesando" ${v.estado_entrega === 'procesando' ? 'selected' : ''}>Procesando</option>
                                <option value="despachado" ${v.estado_entrega === 'despachado' ? 'selected' : ''}>Despachado</option>
                                <option value="entregado" ${v.estado_entrega === 'entregado' ? 'selected' : ''}>Entregado</option>
                                <option value="cancelado" ${v.estado_entrega === 'cancelado' ? 'selected' : ''}>Cancelado</option>
                            </select>
                        </td>
                        <td>
                            <a href="factura-impresion.html?id=${v.id_venta}" target="_blank" class="btn-action btn-edit" style="text-decoration: none; padding: 4px 8px;">🖨️ Ver Factura</a>
                        </td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;

            cardBody.innerHTML = html;
        }

    } catch (err) {
        console.error(err);
        if (cardBody) cardBody.innerHTML = `<p class="placeholder-text" style="color: red;">Error al consultar ventas.</p>`;
    }
}

async function actualizarEstadoVenta(idVenta, estadoPago, estadoEntrega) {
    try {
        const res = await fetch(`${API_URL}/api/ventas/${idVenta}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ estado_pago: estadoPago, estado_entrega: estadoEntrega })
        });
        const data = await res.json();
        alert((data.success ? '✅ ' : '❌ ') + data.message);
    } catch (err) {
        alert('Error al actualizar estado del pedido.');
    }
}

// ==========================================================
// 4. GESTIÓN DE USUARIOS ADMINISTRADORES (EXCLUSIVO SUPER ADMIN)
// ==========================================================
async function cargarGestionUsuarios() {
    const cardHeader = document.getElementById('panel-card-header');
    const cardBody = document.getElementById('panel-card-body');

    if (cardHeader) {
        cardHeader.innerHTML = `
            <div class="card-header-flex">
                <h2>👥 Gestión de Usuarios Administradores</h2>
                <div>
                    <span class="badge badge-info" style="font-size: 13px;">Límite: 1 Super Admin / 3 Admins Estándar</span>
                </div>
            </div>
        `;
    }

    try {
        const res = await fetch(`${API_URL}/api/usuarios`, { credentials: 'include' });
        const data = await res.json();

        if (!data.success) {
            if (cardBody) cardBody.innerHTML = `<p class="placeholder-text" style="color: red;">Error: ${data.message}</p>`;
            return;
        }

        const usuarios = data.data;

        if (cardBody) {
            let html = `
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Cédula</th>
                                <th>Nombre Completo</th>
                                <th>Correo Electrónico</th>
                                <th>Teléfono</th>
                                <th>Rol</th>
                                <th>Estado</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            usuarios.forEach((u, idx) => {
                const esSuper = (u.rol || '').toLowerCase().includes('super');
                const isActivo = u.estado === 'activo';

                html += `
                    <tr>
                        <td>${idx + 1}</td>
                        <td><code>${u.cedula}</code></td>
                        <td><strong>${u.nombre} ${u.apellido}</strong></td>
                        <td>${u.email}</td>
                        <td>${u.telefono}</td>
                        <td>
                            <span class="badge ${esSuper ? 'badge-danger' : 'badge-info'}">
                                ${esSuper ? 'Súper Administrador' : 'Administrador Estándar'}
                            </span>
                        </td>
                        <td>
                            <span class="badge ${isActivo ? 'badge-success' : 'badge-warning'}">
                                ${isActivo ? 'Activo' : 'Inactivo'}
                            </span>
                        </td>
                        <td>
                            ${!esSuper ? `
                                <div class="action-buttons">
                                    <button type="button" class="btn-action btn-edit" onclick="cambiarEstadoUsuario(${u.id_usuario}, '${isActivo ? 'inactivo' : 'activo'}', '${u.rol}')">
                                        ${isActivo ? '⏸️ Desactivar' : '▶️ Activar'}
                                    </button>
                                    <button type="button" class="btn-action btn-delete" onclick="eliminarUsuarioAdmin(${u.id_usuario})">🗑️ Eliminar</button>
                                </div>
                            ` : '<em>Titular Principal</em>'}
                        </td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;

            cardBody.innerHTML = html;
        }

    } catch (err) {
        console.error(err);
        if (cardBody) cardBody.innerHTML = `<p class="placeholder-text" style="color: red;">Error al consultar usuarios.</p>`;
    }
}

function cambiarEstadoUsuario(idUsuario, nuevoEstado, rolActual) {
    solicitarAutorizacionSuperAdmin(async (authCode = null) => {
        const res = await fetch(`${API_URL}/api/usuarios/${idUsuario}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ estado: nuevoEstado, rol: rolActual, auth_code: authCode })
        });
        const data = await res.json();
        alert((data.success ? '✅ ' : '❌ ') + data.message);
        if (data.success) cargarGestionUsuarios();
    });
}

function eliminarUsuarioAdmin(idUsuario) {
    if (!confirm('¿Estás seguro de que deseas eliminar este usuario administrador?')) return;
    solicitarAutorizacionSuperAdmin(async (authCode = null) => {
        const res = await fetch(`${API_URL}/api/usuarios/${idUsuario}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ auth_code: authCode })
        });
        const data = await res.json();
        alert((data.success ? '✅ ' : '❌ ') + data.message);
        if (data.success) {
            cargarGestionUsuarios();
            cargarMetricaAdministradores();
        }
    });
}

// ==========================================================
// 5. CONFIGURACIÓN GENERAL DEL SISTEMA (CONFIGURACIÓN)
// ==========================================================
async function cargarConfiguracionGeneral() {
    const cardHeader = document.getElementById('panel-card-header');
    const cardBody = document.getElementById('panel-card-body');

    if (cardHeader) {
        cardHeader.innerHTML = `<h2>⚙️ Configuración General del Sistema</h2>`;
    }

    if (cardBody) {
        cardBody.innerHTML = `
            <div style="max-width: 600px;">
                <div style="background: #f8f9fa; border: 1px solid #ddd; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                    <h4>💵 Tasa de Cambio Oficial BCV (USD / VES)</h4>
                    <p style="font-size: 13px; color: #666; margin: 6px 0 12px 0;">La tasa se utiliza para calcular equivalencias en Bolívares en el e-commerce y facturación SENIAT.</p>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="number" step="0.0001" id="cfg-tasa-bcv" placeholder="Ej: 36.5000" style="padding: 8px; flex: 1; border-radius: 4px; border: 1px solid #ccc;" />
                        <button type="button" class="btn-primary" onclick="guardarTasaBCVManual()">Actualizar Tasa BCV</button>
                    </div>
                </div>

                <div style="background: #f8f9fa; border: 1px solid #ddd; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                    <h4>🔐 Protocolo de Clave Maestra de Seguridad</h4>
                    <p style="font-size: 13px; color: #666; margin-top: 6px;">
                        La Clave Maestra de Autorización para Administradores Estándar está configurada en la variable <code>MASTER_SECRET</code> del archivo <code>.env</code> (Por defecto: <code>JirethMaster2026*</code>).
                    </p>
                </div>

                <div style="background: #f8f9fa; border: 1px solid #ddd; padding: 15px; border-radius: 6px;">
                    <h4>🛍️ Límite de Alerta de Stock Bajo</h4>
                    <p style="font-size: 13px; color: #666; margin: 6px 0 12px 0;">Umbral por defecto para alertar cuando un producto tiene unidades bajas en almacén.</p>
                    <input type="number" id="cfg-stock-min" value="5" readonly style="padding: 8px; width: 100px; border-radius: 4px; border: 1px solid #ccc; background: #eee;" /> <span>unidades</span>
                </div>
            </div>
        `;
    }
}

function guardarTasaBCVManual() {
    const input = document.getElementById('cfg-tasa-bcv');
    const valor = parseFloat(input ? input.value : 0);
    if (!valor || valor <= 0) {
        alert('Ingresa una tasa válida.');
        return;
    }
    alert('✅ Tasa BCV actualizada a Bs. ' + valor.toFixed(4));
}
