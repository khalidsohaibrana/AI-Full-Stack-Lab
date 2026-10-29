import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const databaseUrl = process.env.AI_MEMORY_DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("Set AI_MEMORY_DATABASE_URL before running database migrations.");
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  for (const fileName of [
    "001_create_memories.sql",
    "002_create_chat_history.sql",
  ]) {
    const migrationPath = fileURLToPath(
      new URL(`../../migrations/${fileName}`, import.meta.url),
    );
    await pool.query(await readFile(migrationPath, "utf8"));
    console.log(`Applied ${fileName}.`);
  }
} finally {
  await pool.end();
}
