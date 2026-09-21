CREATE TABLE "deliveries" (
	"event_id" varchar(64) PRIMARY KEY NOT NULL,
	"stamp_id" integer NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"delivered_at" timestamp with time zone,
	"acked_at" timestamp with time zone,
	"result" varchar(32) DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"api_key_hash" varchar(128) NOT NULL,
	"spot_id" varchar(32),
	"last_heartbeat_at" timestamp with time zone,
	"status" varchar(16) DEFAULT '断' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spots" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name_ja" text NOT NULL,
	"name_en" text NOT NULL,
	"display_order" integer NOT NULL,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"description_ja" text NOT NULL,
	"description_en" text NOT NULL,
	"location_note_ja" text,
	"location_note_en" text
);
--> statement-breakpoint
CREATE TABLE "stamp_tokens" (
	"token" varchar(64) PRIMARY KEY NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stamps" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"spot_id" varchar(32) NOT NULL,
	"stamped_at" timestamp with time zone NOT NULL,
	"device_stamped_at" timestamp with time zone,
	"device_id" varchar(64) NOT NULL,
	"visit_order" integer NOT NULL,
	CONSTRAINT "stamps_session_id_spot_id_unique" UNIQUE("session_id","spot_id")
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_stamp_id_stamps_id_fk" FOREIGN KEY ("stamp_id") REFERENCES "public"."stamps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stamp_tokens" ADD CONSTRAINT "stamp_tokens_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stamps" ADD CONSTRAINT "stamps_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stamps" ADD CONSTRAINT "stamps_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stamp_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "spots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stamps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;
