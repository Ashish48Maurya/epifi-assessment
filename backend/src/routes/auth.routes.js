const express = require("express");
const { register, login, logout, developerInfo } = require("../controllers/auth.controller");
const { requireAuth } = require("../middleware/auth");
const { User } = require("../models");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/about", developerInfo);

router.get("/me", requireAuth, async (req, res) => {
    const user = await User.findByPk(req.user.id, {
        attributes: ["id", "name", "email", "createdAt"],
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Current user fetched", user });
});

module.exports = router;
