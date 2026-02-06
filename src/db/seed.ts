import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { isp, issueCategory } from "./schema";
import { ISP_DATA } from "../data/isps";

async function seed() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
  });
  const db = drizzle(pool);

  let totalCategories = 0;

  for (const ispData of ISP_DATA) {
    // Insert ISP (skip on conflict with existing slug)
    const [insertedIsp] = await db
      .insert(isp)
      .values({
        slug: ispData.slug,
        name: ispData.name,
        logoUrl: ispData.logoUrl,
      })
      .onConflictDoNothing()
      .returning({ id: isp.id });

    // If ISP already existed, look it up by slug
    let ispId: string;
    if (insertedIsp) {
      ispId = insertedIsp.id;
    } else {
      const existing = await db
        .select({ id: isp.id })
        .from(isp)
        .where(eq(isp.slug, ispData.slug));
      ispId = existing[0].id;
    }

    // Insert categories for this ISP
    for (let i = 0; i < ispData.categories.length; i++) {
      const cat = ispData.categories[i];
      await db
        .insert(issueCategory)
        .values({
          ispId,
          slug: cat.slug,
          label: cat.label,
          description: cat.description,
          sortOrder: i,
        })
        .onConflictDoNothing();
    }

    totalCategories += ispData.categories.length;
  }

  console.log(`Seeded ${ISP_DATA.length} ISPs and ${totalCategories} categories`);

  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
