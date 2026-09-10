CREATE DATABASE IF NOT EXISTS supermercado_jireth 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE supermercado_jireth;

-- ==========================================================
-- 1. USUARIOS ADMINISTRADORES
-- ==========================================================
CREATE TABLE IF NOT EXISTS usuarios_admin (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    cedula VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(50) NOT NULL,
    apellido VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    telefono VARCHAR(20) NOT NULL,
    password VARCHAR(255) NOT NULL,
    rol ENUM('superadmin', 'admin') NOT NULL DEFAULT 'admin',
    estado ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 2. CLIENTES (COMPRADORES DEL E-COMMERCE)
-- ==========================================================
CREATE TABLE IF NOT EXISTS clientes (
    id_cliente INT AUTO_INCREMENT PRIMARY KEY,
    tipo_documento ENUM('V', 'E', 'J', 'G', 'P') NOT NULL DEFAULT 'V',
    cedula_rif VARCHAR(20) NOT NULL UNIQUE,
    nombre_razon_social VARCHAR(150) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    telefono VARCHAR(20) NOT NULL,
    direccion TEXT NOT NULL,
    password VARCHAR(255) NOT NULL,
    estado ENUM('activo', 'inactivo') DEFAULT 'activo',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 3. TASAS OFICIALES BCV (Multimoneda obligatoria)
-- ==========================================================
CREATE TABLE IF NOT EXISTS tasas_cambio (
    id_tasa INT AUTO_INCREMENT PRIMARY KEY,
    fecha DATE NOT NULL UNIQUE,
    tasa_bcv DECIMAL(12, 4) NOT NULL, -- Valor de 1 USD en Bolívares (VES)
    registrado_por INT,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (registrado_por) REFERENCES usuarios_admin(id_usuario) ON DELETE SET NULL
);

-- ==========================================================
-- 4. CATÁLOGO: CATEGORÍAS
-- ==========================================================
CREATE TABLE IF NOT EXISTS categorias (
    id_categoria INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    estado ENUM('activo', 'inactivo') DEFAULT 'activo',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 5. CATÁLOGO: PRODUCTOS (Con alícuota tributaria SENIAT)
-- ==========================================================
CREATE TABLE IF NOT EXISTS productos (
    id_producto INT AUTO_INCREMENT PRIMARY KEY,
    codigo_barras VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    id_categoria INT NOT NULL,
    
    -- Manejo Monetario Base
    precio_usd DECIMAL(10, 2) NOT NULL,
    
    -- Clasificación Fiscal SENIAT (IVA)
    alicuota_iva ENUM('G', 'R', 'A', 'E') NOT NULL DEFAULT 'G', 
    -- 'G' = General (16%)
    -- 'R' = Reducida (8%)
    -- 'A' = Suntuario (31%)
    -- 'E' = Exento (0% - Canasta básica: arroz, harina, leche)
    
    porcentaje_iva DECIMAL(5, 2) NOT NULL DEFAULT 16.00,
    
    -- Inventario
    stock INT NOT NULL DEFAULT 0,
    stock_minimo INT NOT NULL DEFAULT 5,
    
    imagen_url VARCHAR(255),
    estado ENUM('activo', 'inactivo') DEFAULT 'activo',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria) ON DELETE RESTRICT
);

-- ==========================================================
-- 6. CONFIGURACIÓN FISCAL DEL EMISOR (DATOS DE LA EMPRESA SENIAT)
-- ==========================================================
CREATE TABLE IF NOT EXISTS configuracion_emisor (
    id_emisor INT AUTO_INCREMENT PRIMARY KEY,
    razon_social VARCHAR(150) NOT NULL,
    rif VARCHAR(20) NOT NULL,
    direccion_fiscal TEXT NOT NULL,
    telefono VARCHAR(30) NOT NULL,
    email VARCHAR(100),
    resolucion_seniat VARCHAR(100) DEFAULT 'Providencia SNAT/2011/00071',
    proximo_numero_factura INT NOT NULL DEFAULT 1,
    proximo_numero_control INT NOT NULL DEFAULT 1,
    pie_pagina_factura TEXT,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO configuracion_emisor (id_emisor, razon_social, rif, direccion_fiscal, telefono, email, pie_pagina_factura) 
VALUES (1, 'SUPERMERCADO JIRETH, C.A.', 'J-50123456-7', 'Av. Principal, Edificio Jireth, Maracaibo, Zulia', '0414-1234567', 'facturacion@jireth.com', 'Gracias por su compra en Supermercado Jireth. Comprobante Fiscal SENIAT.');

-- ==========================================================
-- 7. ÓRDENES / FACTURACIÓN (VENTAS CON FORMATO SENIAT)
-- ==========================================================
CREATE TABLE IF NOT EXISTS ventas (
    id_venta INT AUTO_INCREMENT PRIMARY KEY,
    numero_factura VARCHAR(50) UNIQUE, -- Número correlativo de factura (ej: FAC-00000001)
    numero_control VARCHAR(50) UNIQUE, -- Número de control fiscal SENIAT (ej: 00-00000001)
    id_cliente INT NOT NULL,
    tasa_bcv_aplicada DECIMAL(12, 4) NOT NULL, -- Tasa oficial BCV congelada al momento de la compra
    
    -- Desglose por Alícuota Fiscal SENIAT (en USD)
    monto_subtotal_usd DECIMAL(10, 2) NOT NULL,
    monto_exento_usd DECIMAL(10, 2) DEFAULT 0.00,
    base_imponible_g_usd DECIMAL(10, 2) DEFAULT 0.00,
    monto_iva_g_usd DECIMAL(10, 2) DEFAULT 0.00,
    base_imponible_r_usd DECIMAL(10, 2) DEFAULT 0.00,
    monto_iva_r_usd DECIMAL(10, 2) DEFAULT 0.00,
    base_imponible_a_usd DECIMAL(10, 2) DEFAULT 0.00,
    monto_iva_a_usd DECIMAL(10, 2) DEFAULT 0.00,
    monto_iva_usd DECIMAL(10, 2) DEFAULT 0.00,
    monto_igtf_usd DECIMAL(10, 2) DEFAULT 0.00, -- IGTF (3% si paga en divisa/efectivo)
    monto_total_usd DECIMAL(10, 2) NOT NULL,
    
    -- Totales y Desglose equivalente en Bolívares (VES)
    monto_exento_ves DECIMAL(14, 2) DEFAULT 0.00,
    base_imponible_g_ves DECIMAL(14, 2) DEFAULT 0.00,
    monto_iva_g_ves DECIMAL(14, 2) DEFAULT 0.00,
    base_imponible_r_ves DECIMAL(14, 2) DEFAULT 0.00,
    monto_iva_r_ves DECIMAL(14, 2) DEFAULT 0.00,
    base_imponible_a_ves DECIMAL(14, 2) DEFAULT 0.00,
    monto_iva_a_ves DECIMAL(14, 2) DEFAULT 0.00,
    monto_iva_ves DECIMAL(14, 2) DEFAULT 0.00,
    monto_igtf_ves DECIMAL(14, 2) DEFAULT 0.00,
    monto_total_ves DECIMAL(14, 2) NOT NULL,
    
    estado_pago ENUM('pendiente', 'pagado', 'rechazado') DEFAULT 'pendiente',
    estado_entrega ENUM('procesando', 'despachado', 'entregado', 'cancelado') DEFAULT 'procesando',
    metodo_pago_principal VARCHAR(50),
    referencia_pago VARCHAR(100),
    
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE RESTRICT
);

-- ==========================================================
-- 8. DETALLE DE VENTAS (PRODUCTOS COMPRADOS)
-- ==========================================================
CREATE TABLE IF NOT EXISTS detalle_ventas (
    id_detalle INT AUTO_INCREMENT PRIMARY KEY,
    id_venta INT NOT NULL,
    id_producto INT NOT NULL,
    cantidad INT NOT NULL,
    precio_unitario_usd DECIMAL(10, 2) NOT NULL,
    alicuota_iva ENUM('G', 'R', 'A', 'E') NOT NULL DEFAULT 'G',
    porcentaje_iva DECIMAL(5, 2) NOT NULL,
    subtotal_usd DECIMAL(10, 2) NOT NULL,
    monto_iva_item_usd DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    
    FOREIGN KEY (id_venta) REFERENCES ventas(id_venta) ON DELETE CASCADE,
    FOREIGN KEY (id_producto) REFERENCES productos(id_producto) ON DELETE RESTRICT
);

-- ==========================================================
-- 9. REGISTRO DE MÉTODOS DE PAGO DISPONIBLES
-- ==========================================================
CREATE TABLE IF NOT EXISTS metodos_pago (
    id_metodo INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL, -- Ejemplo: 'Pago Móvil', 'Transferencia Banesco', 'Zelle', 'Efectivo'
    detalles_cuenta TEXT, -- Datos bancarios (Cédula, Teléfono, Banco, Cuenta)
    moneda ENUM('VES', 'USD') NOT NULL DEFAULT 'VES',
    aplica_igtf BOOLEAN DEFAULT FALSE,
    estado ENUM('activo', 'inactivo') DEFAULT 'activo'
);