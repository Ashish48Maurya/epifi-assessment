const { verifyToken } = require("../utils/jwt");

function requireAuth(req, res, next) {
    let token = null;
    const header = req.headers.authorization || "";
    if (header.startsWith("Bearer ")) token = header.slice(7);
    if (!token && req.cookies?.token) token = req.cookies.token;

    if (!token) return res.status(401).json({ message: "Unauthorized" });

    try {
        const payload = verifyToken(token);
        req.user = { id: payload.id, email: payload.email };
        next();
    } catch {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}

module.exports = { requireAuth };
