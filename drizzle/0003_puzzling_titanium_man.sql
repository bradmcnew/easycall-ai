CREATE TABLE "isp_phone_tree" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"isp_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"tree" jsonb NOT NULL,
	"notes" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "isp_phone_tree" ADD CONSTRAINT "isp_phone_tree_isp_id_isp_id_fk" FOREIGN KEY ("isp_id") REFERENCES "public"."isp"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "isp_phone_tree_isp_idx" ON "isp_phone_tree" USING btree ("isp_id");