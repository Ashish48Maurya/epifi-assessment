const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

module.exports = {
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    dialect: "postgres",
    dialectOptions:
        process.env.DB_SSL === "true"
            ? {
                ssl: {
                    require: true,
                    rejectUnauthorized:
                        process.env.DB_SSL_REJECT_UNAUTHORIZED === "true",
                },
            }
            : {},
    define: {
        timestamps: true,
        underscored: true,
    },
};
