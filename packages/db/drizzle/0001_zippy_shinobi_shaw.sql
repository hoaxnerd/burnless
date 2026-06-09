CREATE TYPE "public"."share_class_type" AS ENUM('common', 'preferred');--> statement-breakpoint
ALTER TABLE "share_classes" ADD COLUMN "class_type" "share_class_type" DEFAULT 'preferred' NOT NULL;--> statement-breakpoint
-- FAIL-4b one-time backfill: classify pre-existing rows by their legacy name.
-- New rows default to 'preferred'; rows whose name reads common/ordinary become
-- 'common' (mirrors the old /common/i regex this enum replaces).
UPDATE "share_classes" SET "class_type" = 'common' WHERE "name" ~* 'common|ordinary';