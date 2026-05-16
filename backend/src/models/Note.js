const NOTE_TYPES = ["text", "image", "list"];

module.exports = (sequelize, Model, DataTypes) => {
    class Note extends Model {
        static associate(models) {
            Note.belongsTo(models.User, { as: "owner", foreignKey: "userId", onDelete: "CASCADE" });
            Note.hasMany(models.NoteShare, { as: "shares", foreignKey: "noteId", onDelete: "CASCADE" });
        }
    }

    Note.init(
        {
            id: { type: DataTypes.INTEGER, allowNull: false, autoIncrement: true, primaryKey: true },
            userId: { type: DataTypes.INTEGER, allowNull: false },
            title: { type: DataTypes.STRING(255), allowNull: true },
            type: { type: DataTypes.ENUM(...NOTE_TYPES), allowNull: false, defaultValue: "text" },
            note: { type: DataTypes.TEXT, allowNull: true },
            images: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: true },
            lists: { type: DataTypes.JSONB, allowNull: true },
        },
        {
            sequelize,
            modelName: "Note",
            tableName: "notes",
            paranoid: true,
            validate: {
                payloadMatchesType() {
                    if (this.type === "text" && (!this.note || !String(this.note).trim())) {
                        throw new Error("note is required when type is 'text'.");
                    }
                    if (this.type === "image" && (!Array.isArray(this.images) || this.images.length === 0)) {
                        throw new Error("images must be a non-empty array when type is 'image'.");
                    }
                    if (this.type === "list" && (!Array.isArray(this.lists) || this.lists.length === 0)) {
                        throw new Error("lists must be a non-empty array when type is 'list'.");
                    }
                },
            },
        }
    );

    Note.TYPES = NOTE_TYPES;
    Note.BIN_RETENTION_DAYS = 7;
    return Note;
};
