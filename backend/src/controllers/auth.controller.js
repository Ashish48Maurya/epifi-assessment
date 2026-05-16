const bcrypt = require("bcryptjs");
const { User } = require("../models");
const { signToken } = require("../utils/jwt");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 10;
const COOKIE_OPTS = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
};

function publicUser(u) {
    return { id: u.id, name: u.name, email: u.email, createdAt: u.createdAt };
}

async function register(req, res) {
    try {
        const { name, email, password } = req.body || {};
        if (!name || !email || !password) {
            return res.status(400).json({ message: "name, email, and password are required" });
        }
        if (!EMAIL_RE.test(email)) {
            return res.status(400).json({ message: "Invalid email" });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const existing = await User.findOne({ where: { email } });
        if (existing) return res.status(409).json({ message: "Email already registered" });

        const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const user = await User.create({ name, email, password: hash });

        const token = signToken({ id: user.id, email: user.email });
        res.cookie("token", token, COOKIE_OPTS);
        return res.status(201).json({ message: "Registered successfully", user: publicUser(user), token });
    } catch (err) {
        console.error("register error:", err);
        return res.status(500).json({ message: "Failed to register" });
    }
}

async function login(req, res) {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ message: "email and password are required" });
        }

        const user = await User.findOne({ where: { email } });
        if (!user) return res.status(401).json({ message: "Invalid credentials" });

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ message: "Invalid credentials" });

        const token = signToken({ id: user.id, email: user.email });
        res.cookie("token", token, COOKIE_OPTS);
        return res.json({ message: "Logged in successfully", user: publicUser(user), token });
    } catch (err) {
        console.error("login error:", err);
        return res.status(500).json({ message: "Failed to login" });
    }
}

function logout(req, res) {
    res.clearCookie("token", { httpOnly: true, sameSite: "lax" });
    return res.json({ message: "Logged out" });
}

function developerInfo(req, res) {
    return res.json({
        name: "Ashish Maurya",
        email: "maurya.48.ashish@gmail.com",
        my_features: {
            recover_from_bin:
                "Implemented a recycle bin system for deleted notes using Sequelize paranoid mode. Deleted notes are soft-deleted instead of being permanently removed, allowing users to view deleted notes, restore them within a recovery period, or permanently delete them later. This improves data safety and protects against accidental deletions.",

            real_time_note_updates:
                "Implemented real-time note updates using Socket.IO. When a note is edited or shared, changes are instantly reflected across connected clients, providing a collaborative and seamless user experience."
        }
    });
}

module.exports = { register, login, logout, developerInfo };
