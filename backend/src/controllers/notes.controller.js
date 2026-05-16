const { Op } = require("sequelize");
const { Note, User, NoteShare, sequelize } = require("../models");
const { sendMail } = require("../utils/mailer");

const BIN_DAYS = Note.BIN_RETENTION_DAYS;
const binCutoff = () => new Date(Date.now() - BIN_DAYS * 24 * 60 * 60 * 1000);

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
            order: [["updatedAt", "DESC"]],
            limit,
            offset,
        });

        const sharedSet = new Set(sharedNoteIds);
        const data = rows.map((n) => ({
            ...n.toJSON(),
            role: n.userId === me ? "owner" : sharedSet.has(n.id) ? "shared" : null,
        }));

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
            where: {
                userId: req.user.id,
                deletedAt: { [Op.gte]: binCutoff() },
            },
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
        const { note, role } = await loadNoteWithAccess(req.params.id, req.user.id);
        if (!note) return res.status(404).json({ message: "Note not found" });
        if (!role) return res.status(403).json({ message: "Forbidden" });
        return res.json({ message: "Note fetched", note, role });
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
            await sequelize.transaction(async (t) => {
                await NoteShare.destroy({ where: { noteId: note.id }, transaction: t });
                await note.destroy({ transaction: t });
            });
            const expiresAt = new Date(Date.now() + BIN_DAYS * 24 * 60 * 60 * 1000);
            return res.json({
                message: `Moved to bin. Will be permanently deleted on ${expiresAt.toISOString()}. Removed from shared users' lists.`,
                expiresAt,
            });
        }

        if (role === "shared") {
            await NoteShare.destroy({ where: { noteId: note.id, userId: me } });
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
        const noteId = req.params.id;
        const { emails } = req.body || {};

        if (!noteId || !Array.isArray(emails)) {
            return res.status(400).json({
                message: "noteId and email(s) are required"
            });
        }

        const note = await Note.findByPk(noteId);

        if (!note) {
            return res.status(404).json({
                message: "Note not found"
            });
        }

        if (note.userId !== req.user.id) {
            return res.status(403).json({
                message: "Only the owner can share this note"
            });
        }

        const owner = await User.findByPk(req.user.id, {
            attributes: ["id", "name", "email"]
        });

        const title = note.title || `Note #${note.id}`;

        const results = [];

        for (const e of emails) {
            try {

                if (e === owner.email) {
                    results.push({
                        email: e,
                        status: "skipped_self"
                    });
                    continue;
                }

                const target = await User.findOne({
                    where: { email: e }
                });

                if (!target) {
                    results.push({
                        email: e,
                        status: "user_not_found"
                    });
                    continue;
                }

                const [, created] = await NoteShare.findOrCreate({
                    where: {
                        noteId: note.id,
                        userId: target.id
                    },
                    defaults: {
                        noteId: note.id,
                        userId: target.id
                    },
                });

                try {
                    await sendMail({
                        to: target.email,
                        subject: `${owner.name} shared a note with you: "${title}"`,
                        text:
                            `Hi ${target.name},\n\n` +
                            `${owner.name} (${owner.email}) ${created ? "shared" : "re-shared"} a note with you: "${title}".\n` +
                            `You have full read and write access.\n\n` +
                            `— Epifi Notes`,
                    });
                } catch (mailErr) {
                    console.error("assign mail error:", mailErr);
                }

                results.push({
                    email: e,
                    status: created ? "shared" : "already_shared"
                });

            } catch (err) {
                console.error(`assign error for ${e}:`, err);

                results.push({
                    email: e,
                    status: "error",
                    error: err.message
                });
            }
        }

        const sharedCount = results.filter(
            (r) => r.status === "shared"
        ).length;

        return res.status(200).json({
            message: `Shared with ${sharedCount} of ${emails.length} user(s). See results for details.`,
            results,
        });

    } catch (err) {
        console.error("notes.assign error:", err);

        return res.status(500).json({
            message: "Failed to share note"
        });
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
