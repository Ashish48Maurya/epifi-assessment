const PERMISSIONS = ["read", "write"];

module.exports = (sequelize, Model, DataTypes) => {
    class NoteShare extends Model {
        static associate(models) {
            NoteShare.belongsTo(models.Note, { foreignKey: "noteId", onDelete: "CASCADE" });
            NoteShare.belongsTo(models.User, { foreignKey: "userId", onDelete: "CASCADE" });
        }
    }

    NoteShare.init(
        {
            noteId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                primaryKey: true,
            },
            userId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                primaryKey: true,
            },
            permission: {
                type: DataTypes.ENUM(...PERMISSIONS),
                allowNull: false,
                defaultValue: "read",
            },
        },
        {
            sequelize,
            modelName: "NoteShare",
            tableName: "note_shares",
            validate: {
                permissionIsValid() {
                    if (!PERMISSIONS.includes(this.permission)) {
                        throw new Error(`Invalid permission: ${this.permission}`);
                    }
                },
            },
        }
    );

    NoteShare.PERMISSIONS = PERMISSIONS;
    return NoteShare;
};
