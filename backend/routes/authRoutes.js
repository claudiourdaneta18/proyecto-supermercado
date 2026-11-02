const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { verifyToken } = require('../middlewares/authMiddlewares');

// ==========================================
// RUTA: OBTENER CONTEO DE ADMINISTRADORES (GET /api/admins/count)
// ==========================================
router.get('/admins/count', async (req, res) => {
    try {
        const [superAdmins] = await db.query(
            "SELECT COUNT(*) AS total FROM usuarios_admin WHERE rol = 'superadmin' AND estado = 'activo'"
        );
        const [standardAdmins] = await db.query(
            "SELECT COUNT(*) AS total FROM usuarios_admin WHERE rol = 'admin' AND estado = 'activo'"
        );

        res.json({
            success: true,
            superAdminCount: superAdmins[0].total,
            standardAdminCount: standardAdmins[0].total,
            maxSuperAdmin: 1,
            maxStandardAdmin: 3
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al consultar conteo de administradores: ' + error.message
        });
    }
});

// ==========================================
// RUTA: REGISTRO DE ADMINISTRADORES (POST /api/register)
// ==========================================
router.post('/register', async (req, res) => {
    const { cedula, nombre, apellido, telefono, email, password, role, secret_key } = req.body;

    // Validación de la Clave Maestra del .env
    const MASTER_SECRET = process.env.MASTER_SECRET || 'JirethMaster2026*';
    if (secret_key !== MASTER_SECRET) {
        return res.status(403).json({ 
            success: false, 
            message: 'La clave maestra de autorización es incorrecta.' 
        });
    }

    // Validación de campos obligatorios
    if (!cedula || !nombre || !apellido || !telefono || !email || !password) {
        return res.status(400).json({ 
            success: false, 
            message: 'Todos los campos obligatorios deben ser completados.' 
        });
    }

    const targetRole = role === 'superadmin' ? 'superadmin' : 'admin';

    try {
        // 1. Verificación de existencia previa de datos del administrador (Cédula o Correo)
        const [existingUsers] = await db.query(
            'SELECT cedula, email FROM usuarios_admin WHERE cedula = ? OR email = ?',
            [cedula, email]
        );

        if (existingUsers.length > 0) {
            const userExists = existingUsers[0];
            if (userExists.cedula === cedula) {
                return res.status(400).json({
                    success: false,
                    message: '⚠️ Este administrador ya existe. La cédula ingresada ya se encuentra registrada.'
                });
            }
            if (userExists.email === email) {
                return res.status(400).json({
                    success: false,
                    message: '⚠️ Este administrador ya existe. El correo electrónico ingresado ya se encuentra registrado.'
                });
            }
        }

        // 2. Validación de restricciones según el Rol
        if (targetRole === 'superadmin') {
            const [superAdminCount] = await db.query(
                "SELECT COUNT(*) AS total FROM usuarios_admin WHERE rol = 'superadmin' AND estado = 'activo'"
            );
            if (superAdminCount[0].total >= 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Solo puede haber un Super Admin y ya existe. Regístrese como administrador normal'
                });
            }
        } else {
            const [adminCount] = await db.query(
                "SELECT COUNT(*) AS total FROM usuarios_admin WHERE rol = 'admin' AND estado = 'activo'"
            );
            if (adminCount[0].total >= 3) {
                return res.status(400).json({
                    success: false,
                    message: 'Solo existe el cupo para 3 administradores normales.'
                });
            }
        }

        // 3. Encriptar la contraseña con bcrypt
        const hashedPassword = await bcrypt.hash(password, 10);

        // 4. Inserción en la base de datos MySQL
        const [result] = await db.query(
            `INSERT INTO usuarios_admin (cedula, nombre, apellido, email, telefono, password, rol, estado) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'activo')`,
            [cedula, nombre, apellido, email, telefono, hashedPassword, targetRole]
        );

        res.status(201).json({
            success: true,
            message: '✅ Administrador registrado exitosamente.',
            id_usuario: result.insertId
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                success: false, 
                message: '⚠️ Este administrador ya existe. La cédula o el correo electrónico ya se encuentran registrados.' 
            });
        }
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor al registrar usuario: ' + error.message 
        });
    }
});

// ==========================================
// RUTA: LOGIN DE ADMINISTRADORES (POST /api/login)
// ==========================================
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ 
            success: false, 
            message: 'Ingresa email y contraseña.' 
        });
    }

    try {
        const [users] = await db.query(
            'SELECT * FROM usuarios_admin WHERE email = ? AND estado = "activo"', 
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales inválidas.' 
            });
        }

        const user = users[0];
        
        // Comparación de contraseña en texto plano vs HASH guardado en MySQL
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales inválidas.' 
            });
        }

        // Generación de Token JWT
        const token = jwt.sign(
            { id: user.id_usuario, nombre: user.nombre, apellido: user.apellido, rol: user.rol, email: user.email },
            process.env.JWT_SECRET || 'super_secreto_jireth_2026',
            { expiresIn: '8h' }
        );

        // Envío de la Cookie HttpOnly al navegador
        res.cookie('token', token, {
            httpOnly: true,
            secure: false, // false para entorno de desarrollo HTTP local
            sameSite: 'lax',
            path: '/',
            maxAge: 8 * 60 * 60 * 1000
        });

        res.json({
            success: true,
            message: 'Inicio de sesión exitoso.',
            user: {
                id: user.id_usuario,
                nombre: user.nombre,
                email: user.email,
                rol: user.rol
            }
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor: ' + error.message 
        });
    }
});

// ==========================================
// RUTA: VERIFICAR SESIÓN ACTIVA (GET /api/verify-auth)
// ==========================================
router.get('/verify-auth', verifyToken, (req, res) => {
    res.json({
        success: true,
        authenticated: true,
        user: req.user
    });
});

// ==========================================
// RUTA: CERRAR SESIÓN (POST /api/logout)
// ==========================================
router.post('/logout', (req, res) => {
    res.clearCookie('token', { path: '/' });
    res.json({ success: true, message: 'Sesión cerrada correctamente.' });
});

// ==========================================
// RUTAS DE GESTIÓN DE USUARIOS ADMINISTRADORES
// ==========================================
router.get('/usuarios', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id_usuario, cedula, nombre, apellido, email, telefono, rol, estado, creado_en FROM usuarios_admin ORDER BY id_usuario ASC'
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al obtener usuarios: ' + err.message });
    }
});

router.put('/usuarios/:id/estado', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { estado, rol, auth_code } = req.body;

    const MASTER_SECRET = process.env.MASTER_SECRET || 'JirethMaster2026*';
    const isSuper = req.user && req.user.rol && req.user.rol.toLowerCase().includes('super');
    if (!isSuper && auth_code !== MASTER_SECRET) {
        return res.status(403).json({ success: false, message: '⚠️ Se requiere la clave del Super Admin.' });
    }

    try {
        await db.query(
            'UPDATE usuarios_admin SET estado = ?, rol = ? WHERE id_usuario = ?',
            [estado || 'activo', rol || 'admin', id]
        );
        res.json({ success: true, message: 'Estado y permisos de usuario actualizados exitosamente.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al actualizar usuario: ' + err.message });
    }
});

router.delete('/usuarios/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { auth_code } = req.body;

    const MASTER_SECRET = process.env.MASTER_SECRET || 'JirethMaster2026*';
    const isSuper = req.user && req.user.rol && req.user.rol.toLowerCase().includes('super');
    if (!isSuper && auth_code !== MASTER_SECRET) {
        return res.status(403).json({ success: false, message: '⚠️ Se requiere la clave del Super Admin.' });
    }

    try {
        await db.query('DELETE FROM usuarios_admin WHERE id_usuario = ?', [id]);
        res.json({ success: true, message: 'Usuario administrador eliminado exitosamente.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al eliminar usuario: ' + err.message });
    }
});

module.exports = router;