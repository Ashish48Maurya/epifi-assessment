const { Op } = require("sequelize");
const { Note, User, NoteShare, sequelize } = require("../models");
const { sendMail } = require("../utils/mailer");
const { emitToUser } = require("../socket");

const BIN_DAYS = Note.BIN_RETENTION_DAYS;
const MAX_ASSIGN_EMAILS = 50;
const binCutoff = () => new Date(Date.now() - BIN_DAYS * 24 * 60 * 60 * 1000);

const NOTE_WITH_PEOPLE_INCLUDE = [
    { model: User, as: "owner", attributes: ["id", "name", "email"] },
    {
        model: NoteShare,
        as: "shares",
        attributes: ["userId", "createdAt"],
        include: [{ model: User, attributes: ["id", "name", "email"] }],
    },
];

function shapeNote(noteInstance, meId, sharedSet) {
    const json = noteInstance.toJSON();
    const sharedWith = (json.shares || []).map((ns) => ({
        id: ns.User?.id,
        name: ns.User?.name,
        email: ns.User?.email,
        sharedAt: ns.createdAt,
    }));
    delete json.shares;
    const role =
        noteInstance.userId === meId
            ? "owner"
            : sharedSet?.has(noteInstance.id) || sharedWith.some((u) => u.id === meId)
                ? "shared"
                : null;
    return { ...json, role, sharedWith };
}

async function loadNoteWithAccess(noteId, userId) {
    const note = await Note.findByPk(noteId);
    if (!note) return { note: null, role: null };
    if (note.userId === userId) return { note, role: "owner" };
    const share = await NoteShare.findOne({ where: { noteId: note.id, userId } });
    if (share) return { note, role: "shared" };
    return { note, role: null };
}

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    return { page, limit, offset: (page - 1) * limit };
}

async function create(req, res) {
    try {
        const { title, type, note, images, lists } = req.body || {};
        const created = await Note.create({
            userId: req.user.id,
            title: title ?? null,
            type: type || "text",
            note: note ?? null,
            images: images ?? null,
            lists: lists ?? null,
        });
        return res.status(201).json({ message: "Note created", note: created });
    } catch (err) {
        if (err.name === "SequelizeValidationError") {
            return res.status(400).json({ message: err.errors?.[0]?.message || "Validation failed" });
        }
        console.error("notes.create error:", err);
        return res.status(500).json({ message: "Failed to create note" });
    }
}

async function list(req, res) {
    try {
        const me = req.user.id;
        const { page, limit, offset } = parsePagination(req.query);
        const q = (req.query.q || "").trim();

        const sharedRows = await NoteShare.findAll({
            where: { userId: me },
            attributes: ["noteId"],
        });
        const sharedNoteIds = sharedRows.map((s) => s.noteId);
        const sharedSet = new Set(sharedNoteIds);

        const access = sharedNoteIds.length
            ? { [Op.or]: [{ userId: me }, { id: { [Op.in]: sharedNoteIds } }] }
            : { userId: me };

        const where = q
            ? {
                [Op.and]: [
                    access,
                    {
                        [Op.or]: [
                            { title: { [Op.iLike]: `%${q}%` } },
                            { note: { [Op.iLike]: `%${q}%` } },
                        ],
                    },
                ],
            }
            : access;

        const { count, rows } = await Note.findAndCountAll({
            where,
            include: NOTE_WITH_PEOPLE_INCLUDE,
            order: [["updatedAt", "DESC"]],
            limit,
            offset,
            distinct: true,
            subQuery: false,
        });

        const data = rows.map((n) => shapeNote(n, me, sharedSet));

        return res.json({
            message: q ? `Found ${count} note(s) matching "${q}"` : `Fetched ${count} note(s)`,
            rows: data,
            pagination: { page, limit, count, totalPages: Math.max(1, Math.ceil(count / limit)) },
            ...(q ? { q } : {}),
        });
    } catch (err) {
        console.error("notes.list error:", err);
        return res.status(500).json({ message: "Failed to list notes" });
    }
}

async function listBin(req, res) {
    try {
        const { page, limit, offset } = parsePagination(req.query);
        const { count, rows } = await Note.findAndCountAll({
            where: { userId: req.user.id, deletedAt: { [Op.gte]: binCutoff() } },
            paranoid: false,
            order: [["deletedAt", "DESC"]],
            limit,
            offset,
        });

        const data = rows.map((n) => {
            const expiresAt = new Date(n.deletedAt.getTime() + BIN_DAYS * 24 * 60 * 60 * 1000);
            return { ...n.toJSON(), expiresAt };
        });
        return res.json({
            message: `Bin contains ${count} note(s) (kept for ${BIN_DAYS} days)`,
            rows: data,
            pagination: { page, limit, count, totalPages: Math.max(1, Math.ceil(count / limit)) },
            retentionDays: BIN_DAYS,
        });
    } catch (err) {
        console.error("notes.listBin error:", err);
        return res.status(500).json({ message: "Failed to list bin" });
    }
}

async function getOne(req, res) {
    try {
        const me = req.user.id;
        const note = await Note.findByPk(req.params.id, { include: NOTE_WITH_PEOPLE_INCLUDE });
        if (!note) return res.status(404).json({ message: "Note not found" });

        let role = null;
        if (note.userId === me) role = "owner";
        else if ((note.shares || []).some((ns) => ns.userId === me)) role = "shared";
        if (!role) return res.status(403).json({ message: "Forbidden" });

        return res.json({ message: "Note fetched", note: shapeNote(note, me), role });
    } catch (err) {
        console.error("notes.getOne error:", err);
        return res.status(500).json({ message: "Failed to fetch note" });
    }
}

async function update(req, res) {
    try {
        const { note, role } = await loadNoteWithAccess(req.params.id, req.user.id);
        if (!note) return res.status(404).json({ message: "Note not found" });
        if (!role) return res.status(403).json({ message: "Forbidden" });

        const { title, type, note: body, images, lists } = req.body || {};
        if (title !== undefined) note.title = title;
        if (type !== undefined) note.type = type;
        if (body !== undefined) note.note = body;
        if (images !== undefined) note.images = images;
        if (lists !== undefined) note.lists = lists;
        await note.save();

        const editorId = req.user.id;
        const recipients = new Set();
        if (note.userId !== editorId) recipients.add(note.userId);
        const shares = await NoteShare.findAll({ where: { noteId: note.id }, attributes: ["userId"] });
        for (const s of shares) if (s.userId !== editorId) recipients.add(s.userId);
        const payload = { note: note.toJSON(), updatedBy: editorId };
        for (const uid of recipients) emitToUser(uid, "note:updated", payload);

        return res.json({ message: "Note updated", note });
    } catch (err) {
        if (err.name === "SequelizeValidationError") {
            return res.status(400).json({ message: err.errors?.[0]?.message || "Validation failed" });
        }
        console.error("notes.update error:", err);
        return res.status(500).json({ message: "Failed to update note" });
    }
}

async function remove(req, res) {
    try {
        const me = req.user.id;
        const { note, role } = await loadNoteWithAccess(req.params.id, me);
        if (!note) return res.status(404).json({ message: "Note not found" });

        if (role === "owner") {
            const shares = await NoteShare.findAll({ where: { noteId: note.id }, attributes: ["userId"] });
            const sharedUserIds = shares.map((s) => s.userId);

            await sequelize.transaction(async (t) => {
                await NoteShare.destroy({ where: { noteId: note.id }, transaction: t });
                await note.destroy({ transaction: t });
            });

            for (const uid of sharedUserIds) emitToUser(uid, "note:unshared", { noteId: note.id });

            const expiresAt = new Date(Date.now() + BIN_DAYS * 24 * 60 * 60 * 1000);
            return res.json({
                message: `Moved to bin. Will be permanently deleted on ${expiresAt.toISOString()}. Removed from shared users' lists.`,
                expiresAt,
            });
        }

        if (role === "shared") {
            await NoteShare.destroy({ where: { noteId: note.id, userId: me } });
            emitToUser(me, "note:unshared", { noteId: note.id });
            return res.json({ message: "Removed from your shared notes" });
        }

        return res.status(403).json({ message: "Forbidden" });
    } catch (err) {
        console.error("notes.remove error:", err);
        return res.status(500).json({ message: "Failed to delete note" });
    }
}

async function restore(req, res) {
    try {
        const note = await Note.findByPk(req.params.id, { paranoid: false });
        if (!note) return res.status(404).json({ message: "Note not found" });
        if (note.userId !== req.user.id) return res.status(403).json({ message: "Only the owner can restore" });
        if (!note.deletedAt) return res.status(400).json({ message: "Note is not in the bin" });
        if (note.deletedAt < binCutoff()) {
            return res.status(410).json({ message: "Note has expired and is no longer recoverable" });
        }
        await note.restore();
        return res.json({
            message: "Note restored from bin. Note: previous shares were removed and must be re-assigned.",
            note,
        });
    } catch (err) {
        console.error("notes.restore error:", err);
        return res.status(500).json({ message: "Failed to restore note" });
    }
}

async function permanentlyDelete(req, res) {
    try {
        const note = await Note.findByPk(req.params.id, { paranoid: false });
        if (!note) return res.status(404).json({ message: "Note not found" });
        if (note.userId !== req.user.id) return res.status(403).json({ message: "Only the owner can permanently delete" });
        await sequelize.transaction(async (t) => {
            await NoteShare.destroy({ where: { noteId: note.id }, transaction: t });
            await note.destroy({ force: true, transaction: t });
        });
        return res.json({ message: "Note permanently deleted" });
    } catch (err) {
        console.error("notes.permanentlyDelete error:", err);
        return res.status(500).json({ message: "Failed to permanently delete note" });
    }
}

async function assign(req, res) {
    try {
        const { email, emails, noteId } = req.body || {};
        if (!noteId) return res.status(400).json({ message: "noteId is required" });

        const list = Array.isArray(emails) ? emails : email ? [email] : [];
        const targets = [...new Set(list.map((e) => (typeof e === "string" ? e.trim() : "")).filter(Boolean))];
        if (targets.length === 0) {
            return res.status(400).json({ message: "Provide at least one email in `emails` (array) or `email` (string)" });
        }
        if (targets.length > MAX_ASSIGN_EMAILS) {
            return res.status(400).json({
                message: `Too many recipients in one request. Limit is ${MAX_ASSIGN_EMAILS}; you sent ${targets.length}.`,
            });
        }

        const note = await Note.findByPk(noteId);
        if (!note) return res.status(404).json({ message: "Note not found" });
        if (note.userId !== req.user.id) {
            return res.status(403).json({ message: "Only the owner can share this note" });
        }

        const owner = await User.findByPk(req.user.id, { attributes: ["id", "name", "email"] });
        const title = note.title || `Note #${note.id}`;

        const results = await Promise.all(
            targets.map(async (e) => {
                try {
                    if (e === owner.email) return { email: e, status: "skipped_self" };

                    const target = await User.findOne({ where: { email: e } });
                    if (!target) return { email: e, status: "user_not_found" };

                    const [, created] = await NoteShare.findOrCreate({
                        where: { noteId: note.id, userId: target.id },
                        defaults: { noteId: note.id, userId: target.id },
                    });

                    emitToUser(target.id, "note:shared", {
                        note: note.toJSON(),
                        sharedBy: { id: owner.id, name: owner.name, email: owner.email },
                        isNew: created,
                    });

                    sendMail({
                        to: target.email,
                        subject: `${owner.name} shared a note with you: "${title}"`,
                        text:
                            `Hi ${target.name},\n\n` +
                            `${owner.name} (${owner.email}) ${created ? "shared" : "re-shared"} a note with you: "${title}".\n` +
                            `You have full read and write access.\n\n` +
                            `— Epifi Notes`,
                    }).catch((err) => console.error("assign mail error:", err));

                    return { email: e, status: created ? "shared" : "already_shared" };
                } catch (err) {
                    console.error(`assign error for ${e}:`, err);
                    return { email: e, status: "error", error: err.message };
                }
            })
        );

        const sharedCount = results.filter((r) => r.status === "shared").length;
        return res.status(200).json({
            message: `Shared with ${sharedCount} of ${targets.length} user(s). See results for details.`,
            results,
        });
    } catch (err) {
        console.error("notes.assign error:", err);
        return res.status(500).json({ message: "Failed to share note" });
    }
}

async function purgeExpiredBin() {
    return Note.destroy({
        where: { deletedAt: { [Op.lt]: binCutoff() } },
        force: true,
        paranoid: false,
    });
}

module.exports = {
    create, list, listBin, getOne, update, remove, restore, permanentlyDelete, assign, purgeExpiredBin,
};
