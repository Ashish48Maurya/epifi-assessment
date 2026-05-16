const { Server } = require("socket.io");
const cookie = require("cookie");
const { verifyToken } = require("./utils/jwt");

let io = null;

const roomFor = (userId) => `user:${userId}`;

function attachSocketServer(httpServer) {
    io = new Server(httpServer, {
        cors: { origin: true, credentials: true },
    });

    io.use((socket, next) => {
        let token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token && socket.handshake.headers?.cookie) {
            try {
                const parsed = cookie.parse(socket.handshake.headers.cookie);
                token = parsed.token;
            } catch {
            }
        }
        if (!token) return next(new Error("Unauthorized"));

        try {
            const payload = verifyToken(token);
            socket.user = { id: payload.id, email: payload.email };
            next();
        } catch {
            next(new Error("Invalid or expired token"));
        }
    });

    io.on("connection", (socket) => {
        socket.join(roomFor(socket.user.id));
        console.log(`[socket] user ${socket.user.id} connected (${socket.id})`);
        socket.on("disconnect", () => {
            console.log(`[socket] user ${socket.user.id} disconnected (${socket.id})`);
        });
    });

    return io;
}

function getIO() {
    return io;
}

function emitToUser(userId, event, payload) {
    if (!io) return;
    io.to(roomFor(userId)).emit(event, payload);
}

function emitToUsers(userIds, event, payload) {
    if (!io || !Array.isArray(userIds)) return;
    for (const id of userIds) emitToUser(id, event, payload);
}

module.exports = { attachSocketServer, getIO, emitToUser, emitToUsers };