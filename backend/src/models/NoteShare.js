module.exports = (sequelize, Model, DataTypes) => {
    class NoteShare extends Model {
        static associate(models) {
            NoteShare.belongsTo(models.Note, { foreignKey: "noteId", as: "note", onDelete: "CASCADE" });
            NoteShare.belongsTo(models.User, { foreignKey: "userId", as: "user", onDelete: "CASCADE" });
        }
    }

    NoteShare.init(
        {
            noteId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
            userId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
        },
        { sequelize, modelName: "NoteShare", tableName: "note_shares" }
    );

 