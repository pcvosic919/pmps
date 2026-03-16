import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "../drizzle/schema.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Construct absolute path to the local sqlite database in the server folder
const dbPath = path.resolve(__dirname, "sqlite.db");
const client = createClient({ url: `file:${dbPath}` });

export const db = drizzle(client, { schema });
