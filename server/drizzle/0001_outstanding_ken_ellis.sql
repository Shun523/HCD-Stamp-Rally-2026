ALTER TABLE "deliveries" ADD COLUMN "ack_timed_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "is_sample" boolean DEFAULT true NOT NULL;