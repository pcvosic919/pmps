import "express-async-errors";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import * as trpcExpress from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/trpc";
import { connectDB } from "./db_mongo";

dotenv.config();

// Connect to Cosmos DB / MongoDB
connectDB().catch(console.error);

const app = express();
app.use(cors());
app.use(express.json());

import jwt from "jsonwebtoken";
import { notificationEvents } from "./_core/events";

// tRPC API
app.use(
    "/api/trpc",
    trpcExpress.createExpressMiddleware({
        router: appRouter,
        createContext,
    })
);

// SSE for Notifications
app.get("/api/notifications/stream", (req, res) => {
    const token = req.query.token as string;
    if (!token) {
        res.status(401).end();
        return;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "pmp-secret-key") as any;
        const userId = decoded.id;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const onNotify = (data: any) => {
            if (data.userId === userId) {
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            }
        };

        notificationEvents.on('notify', onNotify);

        req.on('close', () => {
            notificationEvents.off('notify', onNotify);
        });
    } catch (_) {
        res.status(401).end();
    }
});

app.get("/api/health", async (_req, res) => {
    try {
        // Health check query with Mongoose
        const { UserModel } = await import("./models/User");
        await UserModel.findOne().limit(1);
        res.json({ status: "ok", message: "Database connected successfully" });
    } catch (err) {
        res.status(500).json({ status: "error", message: "Database connection failed" });
    }
});

import path from "path";
const clientDistPath = path.resolve(__dirname, "../../../client/dist");

// Serve client built static files
app.use(express.static(clientDistPath));

// Fallback for Single Page Application (SPA) routing
app.get("*", (req, res) => {
    if (!req.url.startsWith("/api")) {
        res.sendFile(path.join(clientDistPath, "index.html"));
    } else {
        res.status(404).json({ error: "Not Found" });
    }
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server started on port ${PORT}`);
});
