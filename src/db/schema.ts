import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ============ BetterAuth Required Tables ============

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  phoneNumber: text("phone_number").unique(),
  phoneNumberVerified: boolean("phone_number_verified").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// ============ Application Tables ============

export const callStatusEnum = pgEnum("call_status", [
  "pending",
  "dialing",
  "navigating",
  "on_hold",
  "agent_detected",
  "transferring",
  "connected",
  "completed",
  "failed",
]);

export const isp = pgTable("isp", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  logoUrl: text("logo_url").notNull(),
  supportPhone: text("support_phone"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const issueCategory = pgTable("issue_category", {
  id: uuid("id").primaryKey().defaultRandom(),
  ispId: uuid("isp_id")
    .notNull()
    .references(() => isp.id),
  slug: text("slug").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [
  uniqueIndex("issue_category_isp_slug_idx").on(table.ispId, table.slug),
]);

export const call = pgTable("call", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  ispId: uuid("isp_id")
    .notNull()
    .references(() => isp.id),
  issueCategoryId: uuid("issue_category_id")
    .notNull()
    .references(() => issueCategory.id),
  userNote: text("user_note"),
  status: callStatusEnum("status").notNull().default("pending"),
  vapiCallId: text("vapi_call_id"),
  vapiControlUrl: text("vapi_control_url"),
  endedReason: text("ended_reason"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const callEventEnum = pgEnum("call_event_type", [
  "created",
  "dialing",
  "connected",
  "ivr_navigation",
  "on_hold",
  "agent_detected",
  "transfer_initiated",
  "user_callback",
  "user_connected",
  "ai_dropped",
  "completed",
  "failed",
  "error",
]);

export const callEvent = pgTable("call_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  callId: uuid("call_id")
    .notNull()
    .references(() => call.id),
  eventType: callEventEnum("event_type").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
