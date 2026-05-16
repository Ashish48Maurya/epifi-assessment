const http = require("http");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const { sequelize } = require("./db/db");
require("./models");
const apiRouter = require("./routes");
const { attachSocketServer } = require("./socket");
const { purgeExpiredBin } = require("./controllers/notes.controller");

const PORT = Number(process.env.PORT) || 8000;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

const app = express();

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));

app.use("/v1/api", apiRouter);

// Static OpenAPI document. Lives alongside this file at src/openapi.json.
app.get("/openapi.json", (req, res) => {
    res.sendFile(path.join(__dirname, "openapi.json"));
});

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

        const server = http.createServer(app);
        attachSocketServer(server);

        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT} (HTTP + Socket.IO)`);
        });

        purgeExpiredBin().catch((e) => console.error("purgeExpiredBin (initial):", e));
        const purgeTimer = setInterval(() => {
            purgeExpiredBin().catch((e) => console.error("purgeExpiredBin:", e));
        }, PURGE_INTERVAL_MS);
        purgeTimer.unref();

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
