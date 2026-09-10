const jwt = require('jsonwebtoken');

// Middleware para verificar que el usuario tenga un Token JWT válido (Cookie o Header)
const verifyToken = (req, res, next) => {
    let token = req.cookies ? req.cookies.token : null;

    if (!token) {
        const authHeader = req.headers['authorization'];
        token = authHeader && authHeader.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Acceso denegado. No se proporcionó un token de autenticación.' 
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secreto_jireth_2026');
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ 
            success: false, 
            message: 'Token inválido o expirado. Inicie sesión nuevamente.' 
        });
    }
};

const verifyRole = (rolesPermitidos = []) => {
    return (req, res, next) => {
        if (!req.user || !rolesPermitidos.includes(req.user.rol)) {
            return res.status(403).json({ 
                success: false, 
                message: 'No tienes los permisos necesarios para realizar esta acción.' 
            });
        }
        next();
    };
};

module.exports = {
    verifyToken,
    verifyRole
};