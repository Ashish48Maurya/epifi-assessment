const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const { sequelize } = require("./db/db");
require("./models");
const apiRouter = require("./routes");

const PORT = Number(process.env.PORT) || 8000;
const PURGE_INTERVAL_MS = 60 * 60 * 1000; // every hour

const app = express();

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));

app.use("/v1/api", apiRouter);

app.get("/health", async (req, res) => {
    try {
        await sequelize.authenticate();
        res.status(200).json({ status: "ok", db: "connected" });
    } catch (err) {
        res.status(503).json({ status: "degraded", db: "disconnected" });
    }
});

async function startServer() {
    try {
        await sequelize.authenticate();
        console.log("Database connection has been established successfully.");
        console.log("Loaded models:", Object.keys(sequelize.models));

        await sequelize.sync();

        const server = app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });

        const shutdown = async (signal) => {
            console.log(`\n${signal} received. Shutting down gracefully...`);
            clearInterval(purgeTimer);
            server.close(async () => {
                try {
                    await sequelize.close();
                    console.log("DB connection closed. Bye.");
                    process.exit(0);
                } catch (e) {
                    console.error("Error while closing DB:", e);
                    process.exit(1);
                }
            });
        };

        process.on("SIGINT", () => shutdown("SIGINT"));
        process.on("SIGTERM", () => shutdown("SIGTERM"));
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}

startServer();
