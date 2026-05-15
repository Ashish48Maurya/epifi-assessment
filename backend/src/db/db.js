const { Sequelize } = require("sequelize");
const dbConfig = require("../config/dbConfig");

const sequelize = new Sequelize(
    dbConfig.database,
    dbConfig.username,
    dbConfig.password,
    {
        host: dbConfig.host,
        port: dbConfig.port,
        dialect: dbConfig.dialect,
        logging: false,
        pool: { max: 10, min: 0, acquire: 300000, idle: 100000 },
        dialectOptions: dbConfig.dialectOptions || {},
        define: dbConfig.define || {},
    }
);

async function connectDB() {
    await sequelize.authenticate();
    return sequelize;
}

module.exports = { sequelize, Sequelize, connectDB };
