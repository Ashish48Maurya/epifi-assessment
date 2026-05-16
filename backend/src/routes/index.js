const express = require("express");
const authRoutes = require("./auth.routes");
const notesRoutes = require("./notes.routes");

const router = express.Router();
router.use("/auth", authRoutes);
router.use("/notes", notesRoutes);

module.exports = router;
