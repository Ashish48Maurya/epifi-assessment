module.exports = (sequelize, Model, DataTypes) => {
    class User extends Model {
        static associate(models) {
            User.hasMany(models.Note, { as: "ownedNotes", foreignKey: "userId", onDelete: "CASCADE" });
            User.belongsToMany(models.Note, {
                through: models.NoteShare,
                as: "sharedNotes",
                foreignKey: "userId",
                otherKey: "noteId",
            });
        }
    }

    User.init(
        {
            id: { type: DataTypes.INTEGER, allowNull: false, autoIncrement: true, primaryKey: true },
            name: { type: DataTypes.STRING, allowNull: false },
            email: { type: DataTypes.STRING, allowNull: false, unique: true },
            password: { type: DataTypes.STRING, allowNull: false },
        },
        { sequelize, modelName: "User", tableName: "users" }
    );

    return User;
};
