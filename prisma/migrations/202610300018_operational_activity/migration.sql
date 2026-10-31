-- CreateTable
CREATE TABLE "CollectorActivity" (
    "userId" UUID NOT NULL,
    "lastCollectionAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectorActivity_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "CollectorActivity" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
CREATE FUNCTION collector_activity_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND (NEW."userId"<>OLD."userId" OR NEW."lastCollectionAt"<OLD."lastCollectionAt") THEN RAISE EXCEPTION 'COLLECTOR_ACTIVITY_MONOTONE';END IF;
 IF NEW."lastCollectionAt">clock_timestamp()+interval '1 second' THEN RAISE EXCEPTION 'COLLECTOR_SERVER_TIME';END IF;RETURN NEW;
END $$;
CREATE TRIGGER collector_activity_guard BEFORE INSERT OR UPDATE ON "CollectorActivity" FOR EACH ROW EXECUTE FUNCTION collector_activity_guard();
