import "express-async-errors";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import * as trpcExpress from "@trpc/server/adapters/express";
import path from "path";
import mongoose from "mongoose";
import { appRouter } from "./routers";
import { copilotApiRouter } from "./api/v1/routes";
import { createContext } from "./_core/trpc";
import { connectDB } from "./db";
import { notificationEvents } from "./_core/events";
import { verifyNotificationStreamToken } from "./_core/tokens";
import { encryptPayload, decryptPayload } from "../shared/crypto";
import { startBackgroundJobs } from "./_core/jobs";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/v1", copilotApiRouter);

app.use("/api/trpc", (req, res, next) => {
    const API_ENCRYPTION_KEY = process.env.API_ENCRYPTION_KEY;
    if (API_ENCRYPTION_KEY) {
        if (req.body?.encrypted) {
            req.body = decryptPayload(req.body.encrypted, API_ENCRYPTION_KEY);
        }
        
        const originalJson = res.json.bind(res);
        res.json = (body: any) => {
            if (body) {
                const encryptedStr = encryptPayload(body, API_ENCRYPTION_KEY);
                return originalJson({ encrypted: encryptedStr });
            }
            return originalJson(body);
        };
    }
    next();
});

app.use(
    "/api/trpc",
    trpcExpress.createExpressMiddleware({
        router: appRouter,
        createContext,
    })
);

app.get("/api/notifications/stream", (req, res) => {
    const token = req.query.token as string;
    if (!token) {
        res.status(401).end();
        return;
    }

    try {
        const decoded = verifyNotificationStreamToken(token);
        const userId = decoded.sub;

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        const keepAlive = setInterval(() => {
            res.write(": ping\n\n");
        }, 30000);

        const onNotify = (data: any) => {
            if (data.userId === userId) {
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            }
        };

        notificationEvents.on("notify", onNotify);

        req.on("close", () => {
            clearInterval(keepAlive);
            notificationEvents.off("notify", onNotify);
        });
    } catch (_) {
        res.status(401).end();
    }
});

app.get("/api/health", async (_req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            res.status(503).json({ status: "error", message: "Database not ready" });
            return;
        }

        await mongoose.connection.db?.admin().ping();
        res.json({ status: "ok", message: "Database connected successfully" });
    } catch (_err) {
        res.status(500).json({ status: "error", message: "Database connection failed" });
    }
});

const clientDistPath = path.resolve(__dirname, "../../../client/dist");

app.use(express.static(clientDistPath));

app.get("*", (req, res) => {
    if (!req.url.startsWith("/api")) {
        res.sendFile(path.join(clientDistPath, "index.html"));
    } else {
        res.status(404).json({ error: "Not Found" });
    }
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

async function startServer() {
    await connectDB();
    startBackgroundJobs();

    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server started on port ${PORT}`);
    });
}

void startServer().catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
});
