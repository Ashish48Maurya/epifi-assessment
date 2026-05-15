const NOTE_TYPES = ["text", "image", "list"];

module.exports = (sequelize, Model, DataTypes) => {
    class Note extends Model {
        static associate(models) {
            // Owner: every note has exactly one creator.
            Note.belongsTo(models.User, {
                as: "owner",
                foreignKey: { name: "userId", allowNull: false },
                onDelete: "CASCADE",
                onUpdate: "CASCADE",
            });

            // Sharing: a note can be shared with many users via note_shares.
            Note.belongsToMany(models.User, {
                through: models.NoteShare,
                as: "sharedWith",
                foreignKey: "noteId",
                otherKey: "userId",
            });
        }
    }

    Note.init(
        {
            id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
            },
            userId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            title: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
            type: {
                type: DataTypes.ENUM(...NOTE_TYPES),
                allowNull: false,
                defaultValue: "text",
            },
            note: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            images: {
                type: DataTypes.ARRAY(DataTypes.TEXT),
                allowNull: true,
            },
            lists: {
                type: DataTypes.ARRAY(DataTypes.TEXT),
                allowNull: true,
            },
        },
        {
            sequelize,
            modelName: "Note",
            tableName: "notes",
            validate: {
                payloadMatchesType() {
                    if (this.type === "text") {
                        if (!this.note || !String(this.note).trim()) {
                            throw new Error("`note` is required when type is 'text'.");
                        }
                    }
                    if (this.type === "image") {
                        if (!Array.isArray(this.images) || this.images.length === 0) {
                            throw new Error("`images` must be a non-empty array when type is 'image'.");
                        }
                    }
                    if (this.type === "list") {
                        if (!Array.isArray(this.lists) || this.lists.length === 0) {
                            throw new Error("`lists` must be a non-empty array when type is 'list'.");
                        }
                        for (const item of this.lists) {
                            if (typeof item !== "string") {
                                throw new Error("Each list item must be a string.");
                            }
                        }
                    }
                },
            },
        }
    );

    Note.TYPES = NOTE_TYPES;
    return Note;
};
