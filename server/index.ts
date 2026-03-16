import "express-async-errors";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import * as trpcExpress from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/trpc";
import { db } from "./db";
import { usersTable } from "../drizzle/schema";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// tRPC API
app.use(
    "/api/trpc",
    trpcExpress.createExpressMiddleware({
        router: appRouter,
        createContext,
    })
);

app.get("/api/health", async (_req, res) => {
    try {
        // Health check query
        await db.select().from(usersTable).limit(1);
        res.json({ status: "ok", message: "Database connected successfully" });
    } catch (err) {
        res.status(500).json({ status: "error", message: "Database connection failed" });
    }
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server started on port ${PORT}`);
});
