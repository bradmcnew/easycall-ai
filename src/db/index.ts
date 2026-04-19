import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ...(process.env.DATABASE_URL &&
  !process.env.DATABASE_URL.startsWith("postgresql://localhost") &&
  !process.env.DATABASE_URL.includes("@localhost")
    ? { ssl: { rejectUnauthorized: false } }
    : {}),
});

export const db = drizzle(pool, { schema });
