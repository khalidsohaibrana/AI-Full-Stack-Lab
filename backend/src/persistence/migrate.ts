import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const databaseUrl = process.env.AI_MEMORY_DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("Set AI_MEMORY_DATABASE_URL before running database migrations.");
}

const migrationPath = fileURLToPath(
  new URL("../../migrations/001_create_memories.sql", import.meta.url),
);
const migration = await readFile(migrationPath, "utf8");
const pool = new Pool({ connectionString: databaseUrl });

try {
  await pool.query(migration);
  console.log("Database migration completed.");
} finally {
  await pool.end();
}
