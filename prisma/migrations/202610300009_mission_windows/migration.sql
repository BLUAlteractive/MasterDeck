CREATE FUNCTION progress_window(g jsonb, at timestamptz) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$ DECLARE dt date; BEGIN
 IF g->>'window'='LIFETIME' THEN RETURN 'lifetime'; END IF;
 IF g->>'startsAt' IS NULL OR g->>'endsAt' IS NULL OR at<(g->>'startsAt')::timestamptz OR at>=(g->>'endsAt')::timestamptz THEN RETURN NULL; END IF;
 IF g->>'window'='SEASON' THEN RETURN 'season:'||((extract(epoch FROM (g->>'startsAt')::timestamptz)*1000)::bigint)::text; END IF;
 IF g->>'window'='DAILY' THEN RETURN 'daily:'||to_char(at AT TIME ZONE 'UTC','YYYY-MM-DD'); END IF;
 IF g->>'window'='WEEKLY' THEN dt:=date_trunc('week',at AT TIME ZONE 'UTC')::date;RETURN 'weekly:'||to_char(dt,'YYYY-MM-DD');END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION progress_consumption_window() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE expected text; BEGIN
 SELECT progress_window(g."definition",e."occurredAt") INTO expected FROM "ProgressGoal" g CROSS JOIN "ProgressEvent" e WHERE g."id"=NEW."goalId" AND e."id"=NEW."eventId";
 IF expected IS NULL OR expected<>NEW."windowKey" THEN RAISE EXCEPTION 'invalid progress window';END IF;RETURN NEW;
END $$;
CREATE TRIGGER progress_consumption_window BEFORE INSERT ON "ProgressConsumption" FOR EACH ROW EXECUTE FUNCTION progress_consumption_window();
