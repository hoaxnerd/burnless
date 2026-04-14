ALTER TABLE "companies" RENAME COLUMN "stripe_customer_id" TO "billing_customer_id";
ALTER TABLE "companies" RENAME COLUMN "stripe_subscription_id" TO "billing_subscription_id";
ALTER TABLE "companies" RENAME COLUMN "stripe_plan" TO "billing_plan";
