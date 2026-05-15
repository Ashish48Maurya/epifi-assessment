const PERMISSIONS = ["read", "write"];

module.exports = (sequelize, Model, DataTypes) => {
    class NoteShare extends Model {

    }

    NoteShare.init(
        {
            noteId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
            userId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
            permission: { type: DataTypes.ENUM(...PERMISSIONS), allowNull: false, defaultValue: "read" },
        },
        { sequelize, modelName: "NoteShare", tableName: "note_shares" }
    );

    NoteShare.PERMISSIONS = PERMISSIONS;
    return NoteShare;
};
