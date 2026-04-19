import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { isp, issueCategory, ispPhoneTree } from "./schema";
import { ISP_DATA } from "../data/isps";
import { PHONE_TREE_DATA } from "../data/phone-trees";

async function seed() {
  const connectionString = process.env.DATABASE_URL!;
  const pool = new Pool({
    connectionString,
    ...(connectionString && !connectionString.includes("@localhost")
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
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
        supportPhone: ispData.supportPhone,
      })
      .onConflictDoNothing()
      .returning({ id: isp.id });

    // If ISP already existed, look it up by slug and update supportPhone
    let ispId: string;
    if (insertedIsp) {
      ispId = insertedIsp.id;
    } else {
      const existing = await db
        .select({ id: isp.id })
        .from(isp)
        .where(eq(isp.slug, ispData.slug));
      ispId = existing[0].id;
      // Update supportPhone and logoUrl for existing ISPs
      await db
        .update(isp)
        .set({ supportPhone: ispData.supportPhone, logoUrl: ispData.logoUrl })
        .where(eq(isp.slug, ispData.slug));
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

  // Seed phone tree data
  let phoneTreeCount = 0;
  for (const [slug, treeData] of Object.entries(PHONE_TREE_DATA)) {
    // Look up the ISP ID by slug
    const ispRecord = await db
      .select({ id: isp.id })
      .from(isp)
      .where(eq(isp.slug, slug));

    if (ispRecord.length === 0) {
      console.warn(`Warning: ISP with slug "${slug}" not found, skipping phone tree`);
      continue;
    }

    const ispId = ispRecord[0].id;

    // Check if a phone tree already exists for this ISP
    const existing = await db
      .select({ id: ispPhoneTree.id, version: ispPhoneTree.version })
      .from(ispPhoneTree)
      .where(eq(ispPhoneTree.ispId, ispId));

    if (existing.length > 0) {
      // Update existing tree and increment version
      await db
        .update(ispPhoneTree)
        .set({
          tree: treeData,
          version: existing[0].version + 1,
          updatedAt: new Date(),
        })
        .where(eq(ispPhoneTree.id, existing[0].id));
    } else {
      // Insert new phone tree
      await db.insert(ispPhoneTree).values({
        ispId,
        tree: treeData,
        version: 1,
      });
    }

    phoneTreeCount++;
  }

  console.log(`Seeded ${ISP_DATA.length} ISPs, ${totalCategories} categories, and ${phoneTreeCount} phone trees`);

  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
