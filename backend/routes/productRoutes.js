const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middlewares/authMiddlewares');

// ==========================================
// RUTA: OBTENER TODAS LAS CATEGORÍAS (GET /api/categorias)
// ==========================================
router.get('/categorias', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM categorias WHERE estado = "activo" ORDER BY nombre ASC'
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al obtener las categorías: ' + err.message });
    }
});

router.get('/categorias/todas', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM categorias ORDER BY id_categoria DESC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al obtener categorías: ' + err.message });
    }
});

router.post('/categorias', verifyToken, async (req, res) => {
    const { nombre, descripcion } = req.body;
    if (!nombre) {
        return res.status(400).json({ success: false, message: 'El nombre de la categoría es obligatorio.' });
    }
    try {
        const [result] = await db.query(
            'INSERT INTO categorias (nombre, descripcion, estado) VALUES (?, ?, "activo")',
            [nombre.trim(), descripcion ? descripcion.trim() : null]
        );
        res.status(201).json({ success: true, message: 'Categoría registrada exitosamente.', id_categoria: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'La categoría ya existe.' });
        }
        res.status(500).json({ success: false, message: 'Error al registrar categoría: ' + err.message });
    }
});

router.put('/categorias/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, estado } = req.body;
    try {
        await db.query(
            'UPDATE categorias SET nombre = ?, descripcion = ?, estado = ? WHERE id_categoria = ?',
            [nombre, descripcion, estado || 'activo', id]
        );
        res.json({ success: true, message: 'Categoría actualizada exitosamente.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al actualizar categoría: ' + err.message });
    }
});

router.delete('/categorias/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM categorias WHERE id_categoria = ?', [id]);
        res.json({ success: true, message: 'Categoría eliminada exitosamente.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'No se puede eliminar la categoría porque posee productos vinculados.' });
    }
});

// ==========================================
// RUTAS DE VENTAS Y PEDIDOS (GET & PUT /api/ventas)
// ==========================================
router.get('/ventas', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT v.*, c.nombre_razon_social AS cliente_nombre, CONCAT(c.tipo_documento, '-', c.cedula_rif) AS cliente_rif, c.telefono AS cliente_telefono
             FROM ventas v
             INNER JOIN clientes c ON v.id_cliente = c.id_cliente
             ORDER BY v.id_venta DESC`
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al consultar ventas: ' + err.message });
    }
});

router.put('/ventas/:id/estado', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { estado_pago, estado_entrega } = req.body;
    try {
        await db.query(
            'UPDATE ventas SET estado_pago = ?, estado_entrega = ? WHERE id_venta = ?',
            [estado_pago || 'pagado', estado_entrega || 'entregado', id]
        );
        res.json({ success: true, message: 'Estado del pedido actualizado exitosamente.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al actualizar estado del pedido: ' + err.message });
    }
});

// ==========================================
// RUTA: REGISTRAR UN NUEVO PRODUCTO (POST /api/productos)
// ==========================================
router.post('/productos', verifyToken, async (req, res) => {
    const { 
        codigo_barras, 
        nombre, 
        id_categoria, 
        precio_usd, 
        alicuota_iva, 
        stock, 
        descripcion 
    } = req.body;

    // Validación de campos obligatorios
    if (!codigo_barras || !nombre || !id_categoria || precio_usd === undefined) {
        return res.status(400).json({ 
            success: false, 
            message: 'Por favor completa todos los campos obligatorios (*).' 
        });
    }

    try {
        const [result] = await db.query(
            `INSERT INTO productos 
             (codigo_barras, nombre, id_categoria, precio_usd, alicuota_iva, stock, descripcion) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                codigo_barras,
                nombre,
                id_categoria,
                precio_usd,
                alicuota_iva || 'G',
                stock || 0,
                descripcion || null
            ]
        );

        res.status(201).json({ 
            success: true, 
            message: 'Producto registrado exitosamente en el inventario.',
            id_producto: result.insertId 
        });

    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                success: false, 
                message: 'El código de barras ya se encuentra registrado en el sistema.' 
            });
        }
        res.status(500).json({ 
            success: false, 
            message: 'Error al registrar el producto: ' + err.message 
        });
    }
});

// Helper para verificar autorización de edición/eliminación (Super Admin directo o Admin con Clave Maestra)
const verifySuperadminAuth = (req) => {
    if (req.user && req.user.rol && req.user.rol.toLowerCase().includes('super')) {
        return true;
    }
    const authCode = req.body.auth_code || req.headers['x-auth-code'];
    const MASTER_SECRET = process.env.MASTER_SECRET || 'JirethMaster2026*';
    return authCode === MASTER_SECRET;
};

// ==========================================
// RUTA: LISTAR TODOS LOS PRODUCTOS (GET /api/productos)
// ==========================================
router.get('/productos', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT p.*, c.nombre AS categoria_nombre 
             FROM productos p 
             LEFT JOIN categorias c ON p.id_categoria = c.id_categoria 
             ORDER BY p.id_producto DESC`
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            message: 'Error al consultar los productos: ' + err.message 
        });
    }
});

// ==========================================
// RUTA: ACTUALIZAR UN PRODUCTO (PUT /api/productos/:id)
// ==========================================
router.put('/productos/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { 
        codigo_barras, 
        nombre, 
        id_categoria, 
        precio_usd, 
        alicuota_iva, 
        stock, 
        descripcion 
    } = req.body;

    if (!verifySuperadminAuth(req)) {
        return res.status(403).json({
            success: false,
            message: '⚠️ Clave de autorización del Super Admin incorrecta o no proporcionada.'
        });
    }

    if (!codigo_barras || !nombre || !id_categoria || precio_usd === undefined) {
        return res.status(400).json({ 
            success: false, 
            message: 'Por favor completa todos los campos obligatorios (*).' 
        });
    }

    try {
        const [result] = await db.query(
            `UPDATE productos SET 
             codigo_barras = ?, nombre = ?, id_categoria = ?, precio_usd = ?, alicuota_iva = ?, stock = ?, descripcion = ?
             WHERE id_producto = ?`,
            [
                codigo_barras,
                nombre,
                id_categoria,
                precio_usd,
                alicuota_iva || 'G',
                stock || 0,
                descripcion || null,
                id
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
        }

        res.json({ success: true, message: 'Producto actualizado exitosamente.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'El código de barras ya pertenece a otro producto.' });
        }
        res.status(500).json({ success: false, message: 'Error al actualizar producto: ' + err.message });
    }
});

// ==========================================
// RUTA: ELIMINAR UN PRODUCTO (DELETE /api/productos/:id)
// ==========================================
router.delete('/productos/:id', verifyToken, async (req, res) => {
    const { id } = req.params;

    if (!verifySuperadminAuth(req)) {
        return res.status(403).json({
            success: false,
            message: '⚠️ Clave de autorización del Super Admin incorrecta o no proporcionada.'
        });
    }

    try {
        const [result] = await db.query('DELETE FROM productos WHERE id_producto = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
        }
        res.json({ success: true, message: 'Producto eliminado exitosamente del inventario.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al eliminar el producto: ' + err.message });
    }
});

module.exports = router;