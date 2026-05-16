const express = require("express");
const { requireAuth } = require("../middleware/auth");
const {
    create, list, listBin, getOne, update, remove, restore, permanentlyDelete, assign,
} = require("../controllers/notes.controller");

const router = express.Router();
router.use(requireAuth);

router.post("/", create); //was_there
router.get("/", list); //was_there
router.get("/search", list);
router.get("/bin", listBin);
router.post("/:id/share", assign); //was_there

router.post("/:id/restore", restore);
router.delete("/:id/permanent", permanentlyDelete);

router.get("/:id", getOne); //was_there
router.put("/:id", update); //was_there
router.delete("/:id", remove); //was_there

module.exports = router;
