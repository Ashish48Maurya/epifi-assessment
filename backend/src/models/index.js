const { Model, DataTypes } = require("sequelize");
const { sequelize, Sequelize } = require("../db/db");

const modelFactories = {
    User: require("./User"),
    Note: require("./Note"),
    NoteShare: require("./NoteShare"),
};

const models = {};
for (const [name, factory] of Object.entries(modelFactories)) {
    models[name] = factory(sequelize, Model, DataTypes);
}

for (const model of Object.values(models)) {
    if (typeof model.associate === "function") {
        model.associate(models);
    }
}

module.exports = {
    sequelize,
    Sequelize,
    ...models,
};
