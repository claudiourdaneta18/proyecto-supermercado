const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middlewares/authMiddlewares');

const isSuperAdmin = (req) => {
    return req.user && req.user.rol && req.user.rol.toLowerCase().includes('super');
};

// 1. OBTENER DATOS FISCALES DEL EMISOR (GET /api/seniat/emisor)
router.get('/seniat/emisor', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM configuracion_emisor WHERE id_emisor = 1');
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Configuración de emisor no encontrada.' });
        }
        res.json({ success: true, emisor: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al consultar emisor fiscal: ' + err.message });
    }
});

// 2. ACTUALIZAR DATOS FISCALES DEL EMISOR (PUT /api/seniat/emisor)
router.put('/seniat/emisor', verifyToken, async (req, res) => {
    const { razon_social, rif, direccion_fiscal, telefono, email, resolucion_seniat, pie_pagina_factura, auth_code } = req.body;
    const MASTER_SECRET = process.env.MASTER_SECRET || 'JirethMaster2026*';
    const isAuthorized = isSuperAdmin(req) || auth_code === MASTER_SECRET;

    if (!isAuthorized) {
        return res.status(403).json({
            success: false,
            message: '⚠️ Clave de autorización del Super Admin incorrecta o no proporcionada.'
        });
    }

    if (!razon_social || !rif || !direccion_fiscal || !telefono) {
        return res.status(400).json({ success: false, message: 'Razón Social, RIF, Dirección Fiscal y Teléfono son obligatorios.' });
    }

    try {
        await db.query(
            `UPDATE configuracion_emisor SET 
             razon_social = ?, rif = ?, direccion_fiscal = ?, telefono = ?, email = ?, resolucion_seniat = ?, pie_pagina_factura = ?
             WHERE id_emisor = 1`,
            [razon_social, rif, direccion_fiscal, telefono, email || null, resolucion_seniat || 'Providencia SNAT/2011/00071', pie_pagina_factura || null]
        );
        res.json({ success: true, message: '✅ Datos del emisor fiscal SENIAT actualizados exitosamente.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al actualizar datos fiscales: ' + err.message });
    }
});

// 3. PROCESAR VENTA / EMITIR FACTURA FISCAL SENIAT (POST /api/seniat/facturar)
router.post('/seniat/facturar', verifyToken, async (req, res) => {
    const { id_cliente, items, metodo_pago, referencia, tasa_bcv } = req.body;
    if (!id_cliente || !items || !Array.isArray(items) || items.length === 0 || !tasa_bcv) {
        return res.status(400).json({
            success: false,
            message: 'Se requiere id_cliente, lista de productos (items) y la tasa BCV del día.'
        });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [clienteRows] = await connection.query('SELECT * FROM clientes WHERE id_cliente = ?', [id_cliente]);
        if (clienteRows.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Cliente no encontrado.' });
        }

        const [emisorRows] = await connection.query('SELECT * FROM configuracion_emisor WHERE id_emisor = 1 FOR UPDATE');
        const emisor = emisorRows[0];

        const numFacturaInt = emisor.proximo_numero_factura;
        const numControlInt = emisor.proximo_numero_control;
        const numFacturaStr = `FAC-${String(numFacturaInt).padStart(8, '0')}`;
        const numControlStr = `00-${String(numControlInt).padStart(8, '0')}`;

        let subtotalUSD = 0;
        let montoExentoUSD = 0;
        let baseG_USD = 0;
        let ivaG_USD = 0;
        let baseR_USD = 0;
        let ivaR_USD = 0;
        let baseA_USD = 0;
        let ivaA_USD = 0;

        const itemsProcesados = [];

        for (const item of items) {
            const [prodRows] = await connection.query('SELECT * FROM productos WHERE id_producto = ?', [item.id_producto]);
            if (prodRows.length === 0) {
                throw new Error(`El producto con ID ${item.id_producto} no existe.`);
            }

            const prod = prodRows[0];
            if (prod.stock < item.cantidad) {
                throw new Error(`Stock insuficiente para "${prod.nombre}". Disponible: ${prod.stock}`);
            }

            const cantidad = parseInt(item.cantidad);
            const precioUSD = parseFloat(prod.precio_usd);
            const subtotalItem = cantidad * precioUSD;
            subtotalUSD += subtotalItem;

            let montoIvaItem = 0;
            const alicuota = prod.alicuota_iva || 'G';

            if (alicuota === 'E') {
                montoExentoUSD += subtotalItem;
            } else if (alicuota === 'G') {
                const porc = parseFloat(prod.porcentaje_iva || 16);
                montoIvaItem = subtotalItem * (porc / 100);
                baseG_USD += subtotalItem;
                ivaG_USD += montoIvaItem;
            } else if (alicuota === 'R') {
                const porc = parseFloat(prod.porcentaje_iva || 8);
                montoIvaItem = subtotalItem * (porc / 100);
                baseR_USD += subtotalItem;
                ivaR_USD += montoIvaItem;
            } else if (alicuota === 'A') {
                const porc = parseFloat(prod.porcentaje_iva || 31);
                montoIvaItem = subtotalItem * (porc / 100);
                baseA_USD += subtotalItem;
                ivaA_USD += montoIvaItem;
            }

            await connection.query('UPDATE productos SET stock = stock - ? WHERE id_producto = ?', [cantidad, prod.id_producto]);

            itemsProcesados.push({
                id_producto: prod.id_producto,
                cantidad,
                precio_unitario_usd: precioUSD,
                alicuota_iva: alicuota,
                porcentaje_iva: prod.porcentaje_iva || 16,
                subtotal_usd: subtotalItem,
                monto_iva_item_usd: montoIvaItem
            });
        }

        const totalIvaUSD = ivaG_USD + ivaR_USD + ivaA_USD;
        let montoIGTF_USD = 0;
        const metodoLower = (metodo_pago || '').toLowerCase();
        if (metodoLower.includes('zelle') || metodoLower.includes('efectivo usd') || metodoLower.includes('divisa')) {
            const baseConIva = subtotalUSD + totalIvaUSD;
            montoIGTF_USD = baseConIva * 0.03;
        }

        const totalGeneralUSD = subtotalUSD + totalIvaUSD + montoIGTF_USD;
        const tasa = parseFloat(tasa_bcv);
        const montoExentoVES = montoExentoUSD * tasa;
        const baseG_VES = baseG_USD * tasa;
        const ivaG_VES = ivaG_USD * tasa;
        const baseR_VES = baseR_USD * tasa;
        const ivaR_VES = ivaR_USD * tasa;
        const baseA_VES = baseA_USD * tasa;
        const ivaA_VES = ivaA_USD * tasa;
        const totalIvaVES = totalIvaUSD * tasa;
        const montoIGTF_VES = montoIGTF_USD * tasa;
        const totalGeneralVES = totalGeneralUSD * tasa;

        const [ventaResult] = await connection.query(
            `INSERT INTO ventas 
             (numero_factura, numero_control, id_cliente, tasa_bcv_aplicada,
              monto_subtotal_usd, monto_exento_usd, base_imponible_g_usd, monto_iva_g_usd,
              base_imponible_r_usd, monto_iva_r_usd, base_imponible_a_usd, monto_iva_a_usd,
              monto_iva_usd, monto_igtf_usd, monto_total_usd,
              monto_exento_ves, base_imponible_g_ves, monto_iva_g_ves,
              base_imponible_r_ves, monto_iva_r_ves, base_imponible_a_ves, monto_iva_a_ves,
              monto_iva_ves, monto_igtf_ves, monto_total_ves,
              estado_pago, estado_entrega, metodo_pago_principal, referencia_pago)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pagado', 'procesando', ?, ?)`,
            [
                numFacturaStr, numControlStr, id_cliente, tasa,
                subtotalUSD, montoExentoUSD, baseG_USD, ivaG_USD,
                baseR_USD, ivaR_USD, baseA_USD, ivaA_USD,
                totalIvaUSD, montoIGTF_USD, totalGeneralUSD,
                montoExentoVES, baseG_VES, ivaG_VES,
                baseR_VES, ivaR_VES, baseA_VES, ivaA_VES,
                totalIvaVES, montoIGTF_VES, totalGeneralVES,
                metodo_pago || 'Efectivo', referencia || null
            ]
        );

        const idVenta = ventaResult.insertId;

        for (const item of itemsProcesados) {
            await connection.query(
                `INSERT INTO detalle_ventas 
                 (id_venta, id_producto, cantidad, precio_unitario_usd, alicuota_iva, porcentaje_iva, subtotal_usd, monto_iva_item_usd)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [idVenta, item.id_producto, item.cantidad, item.precio_unitario_usd, item.alicuota_iva, item.porcentaje_iva, item.subtotal_usd, item.monto_iva_item_usd]
            );
        }

        await connection.query(
            'UPDATE configuracion_emisor SET proximo_numero_factura = proximo_numero_factura + 1, proximo_numero_control = proximo_numero_control + 1 WHERE id_emisor = 1'
        );

        await connection.commit();
        connection.release();

        res.status(201).json({
            success: true,
            message: '✅ Factura Fiscal SENIAT generada exitosamente.',
            id_venta: idVenta,
            numero_factura: numFacturaStr,
            numero_control: numControlStr,
            total_usd: totalGeneralUSD,
            total_ves: totalGeneralVES
        });
    } catch (err) {
        await connection.rollback();
        connection.release();
        res.status(500).json({ success: false, message: 'Error al emitir factura fiscal: ' + err.message });
    }
});

// 4. OBTENER DETALLE DE FACTURA FISCAL (GET /api/seniat/factura/:id)
router.get('/seniat/factura/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        const [emisorRows] = await db.query('SELECT * FROM configuracion_emisor WHERE id_emisor = 1');
        const [ventaRows] = await db.query(
            `SELECT v.*, c.tipo_documento, c.cedula_rif, c.nombre_razon_social, c.direccion, c.telefono, c.email 
             FROM ventas v 
             INNER JOIN clientes c ON v.id_cliente = c.id_cliente 
             WHERE v.id_venta = ?`, 
            [id]
        );

        if (ventaRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Factura no encontrada.' });
        }

        const [itemsRows] = await db.query(
            `SELECT d.*, p.nombre AS producto_nombre, p.codigo_barras 
             FROM detalle_ventas d 
             INNER JOIN productos p ON d.id_producto = p.id_producto 
             WHERE d.id_venta = ?`, 
            [id]
        );

        res.json({
            success: true,
            emisor: emisorRows[0],
            factura: ventaRows[0],
            items: itemsRows
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al consultar factura fiscal: ' + err.message });
    }
});

// 5. GENERAR LIBRO DE VENTAS FISCAL SENIAT (GET /api/seniat/libro-ventas)
router.get('/seniat/libro-ventas', verifyToken, async (req, res) => {
    const { mes, anio } = req.query;
    const fechaMes = mes ? parseInt(mes) : new Date().getMonth() + 1;
    const fechaAnio = anio ? parseInt(anio) : new Date().getFullYear();

    try {
        const [emisorRows] = await db.query('SELECT * FROM configuracion_emisor WHERE id_emisor = 1');
        const [ventasRows] = await db.query(
            `SELECT 
                v.id_venta,
                DATE_FORMAT(v.creado_en, '%d/%m/%Y') AS fecha,
                v.numero_factura,
                v.numero_control,
                CONCAT(c.tipo_documento, '-', c.cedula_rif) AS rif_cedula_cliente,
                c.nombre_razon_social AS cliente_nombre,
                v.tasa_bcv_aplicada,
                v.monto_total_ves,
                v.monto_exento_ves,
                v.base_imponible_g_ves,
                v.monto_iva_g_ves,
                v.base_imponible_r_ves,
                v.monto_iva_r_ves,
                v.base_imponible_a_ves,
                v.monto_iva_a_ves,
                v.monto_iva_ves,
                v.monto_igtf_ves,
                v.monto_total_usd,
                v.monto_igtf_usd
             FROM ventas v
             INNER JOIN clientes c ON v.id_cliente = c.id_cliente
             WHERE MONTH(v.creado_en) = ? AND YEAR(v.creado_en) = ? AND v.estado_pago = 'pagado'
             ORDER BY v.id_venta ASC`,
            [fechaMes, fechaAnio]
        );

        let totalVentasConIvaVES = 0;
        let totalExentoVES = 0;
        let totalBaseG_VES = 0;
        let totalIvaG_VES = 0;
        let totalBaseR_VES = 0;
        let totalIvaR_VES = 0;
        let totalBaseA_VES = 0;
        let totalIvaA_VES = 0;
        let totalIvaVES = 0;
        let totalIGTF_VES = 0;

        ventasRows.forEach(v => {
            totalVentasConIvaVES += parseFloat(v.monto_total_ves || 0);
            totalExentoVES += parseFloat(v.monto_exento_ves || 0);
            totalBaseG_VES += parseFloat(v.base_imponible_g_ves || 0);
            totalIvaG_VES += parseFloat(v.monto_iva_g_ves || 0);
            totalBaseR_VES += parseFloat(v.base_imponible_r_ves || 0);
            totalIvaR_VES += parseFloat(v.monto_iva_r_ves || 0);
            totalBaseA_VES += parseFloat(v.base_imponible_a_ves || 0);
            totalIvaA_VES += parseFloat(v.monto_iva_a_ves || 0);
            totalIvaVES += parseFloat(v.monto_iva_ves || 0);
            totalIGTF_VES += parseFloat(v.monto_igtf_ves || 0);
        });

        res.json({
            success: true,
            periodo: { mes: fechaMes, anio: fechaAnio },
            emisor: emisorRows[0],
            ventas: ventasRows,
            resumen: {
                total_ventas_con_iva_ves: totalVentasConIvaVES,
                total_exento_ves: totalExentoVES,
                total_base_g_ves: totalBaseG_VES,
                total_iva_g_ves: totalIvaG_VES,
                total_base_r_ves: totalBaseR_VES,
                total_iva_r_ves: totalIvaR_VES,
                total_base_a_ves: totalBaseA_VES,
                total_iva_a_ves: totalIvaA_VES,
                total_iva_ves: totalIvaVES,
                total_igtf_ves: totalIGTF_VES
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al generar el Libro de Ventas SENIAT: ' + err.message });
    }
});


// ==========================================
// 6. OBTENER CONFIGURACIÓN GENERAL DEL SISTEMA (GET /api/config)
// ==========================================
router.get('/config', verifyToken, async (req, res) => {
    try {
        // Obtener tasa BCV más reciente guardada en tasas_cambio
        const [tasaRows] = await db.query(
            `SELECT tasa_bcv, fecha FROM tasas_cambio ORDER BY fecha DESC LIMIT 1`
        );
        // Obtener stock_minimo global de configuracion_emisor (columna extra si existe, o usamos un valor por defecto)
        const [emisorRows] = await db.query('SELECT stock_minimo_alerta FROM configuracion_emisor WHERE id_emisor = 1');

        res.json({
            success: true,
            tasa_bcv: tasaRows.length > 0 ? parseFloat(tasaRows[0].tasa_bcv) : null,
            tasa_fecha: tasaRows.length > 0 ? tasaRows[0].fecha : null,
            stock_minimo: emisorRows.length > 0 && emisorRows[0].stock_minimo_alerta != null
                ? emisorRows[0].stock_minimo_alerta
                : 5
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al leer configuración: ' + err.message });
    }
});

// ==========================================
// 7. GUARDAR TASA BCV (PUT /api/config/tasa-bcv)
// ==========================================
router.put('/config/tasa-bcv', verifyToken, async (req, res) => {
    const { tasa_bcv } = req.body;
    const MASTER_SECRET = process.env.MASTER_SECRET || 'JirethMaster2026*';
    const isAuthorized = isSuperAdmin(req) || req.body.auth_code === MASTER_SECRET;

    if (!isAuthorized) {
        return res.status(403).json({ success: false, message: '⚠️ Se requiere autorización del Super Admin.' });
    }
    if (!tasa_bcv || isNaN(parseFloat(tasa_bcv)) || parseFloat(tasa_bcv) <= 0) {
        return res.status(400).json({ success: false, message: 'La tasa BCV debe ser un número positivo.' });
    }

    try {
        const hoy = new Date().toISOString().split('T')[0];
        const tasaVal = parseFloat(tasa_bcv);
        const idAdmin = req.user ? req.user.id : null;

        // INSERT o UPDATE si ya existe una tasa para hoy
        await db.query(
            `INSERT INTO tasas_cambio (fecha, tasa_bcv, registrado_por)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE tasa_bcv = VALUES(tasa_bcv), registrado_por = VALUES(registrado_por)`,
            [hoy, tasaVal, idAdmin]
        );

        res.json({ success: true, message: `✅ Tasa BCV actualizada a Bs. ${tasaVal.toFixed(4)} para el día ${hoy}.`, tasa_bcv: tasaVal });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al guardar tasa BCV: ' + err.message });
    }
});

// ==========================================
// 8. GUARDAR UMBRAL DE STOCK MÍNIMO (PUT /api/config/stock-minimo)
// ==========================================
router.put('/config/stock-minimo', verifyToken, async (req, res) => {
    const { stock_minimo } = req.body;
    const MASTER_SECRET = process.env.MASTER_SECRET || 'JirethMaster2026*';
    const isAuthorized = isSuperAdmin(req) || req.body.auth_code === MASTER_SECRET;

    if (!isAuthorized) {
        return res.status(403).json({ success: false, message: '⚠️ Se requiere autorización del Super Admin.' });
    }
    const valor = parseInt(stock_minimo);
    if (isNaN(valor) || valor < 1) {
        return res.status(400).json({ success: false, message: 'El umbral de stock mínimo debe ser un número entero positivo.' });
    }

    try {
        // Guardar en columna stock_minimo_alerta de configuracion_emisor
        await db.query(
            'UPDATE configuracion_emisor SET stock_minimo_alerta = ? WHERE id_emisor = 1',
            [valor]
        );
        res.json({ success: true, message: `✅ Umbral de stock mínimo actualizado a ${valor} unidades.`, stock_minimo: valor });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al guardar umbral de stock: ' + err.message });
    }
});

module.exports = router;
