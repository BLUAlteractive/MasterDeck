-- Disposable reverse only. Production preserves job/screen/card history.
DROP TRIGGER press_card_reservation_guard ON "CardInstance";
DROP TRIGGER screen_reservation_guard ON "OwnedScreen";
ALTER TABLE "OwnedScreen" DROP COLUMN "jobId";
DROP TABLE "PressJobEvent","PressJob";
DROP FUNCTION screen_reservation_guard(),press_job_guard(),press_start_origin(),press_job_reconcile(),press_card_reservation_guard();
CREATE TRIGGER owned_screen_immutable BEFORE UPDATE OR DELETE ON "OwnedScreen" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE OR REPLACE FUNCTION screen_event_reconcile() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE s "OwnedScreen";sid uuid; BEGIN
 IF TG_TABLE_NAME='OwnedScreen' THEN sid:=NEW.id;ELSE sid:=NEW."screenId";END IF;
 SELECT * INTO STRICT s FROM "OwnedScreen" WHERE id=sid;
 IF s."stateVersion"<>(SELECT count(*) FROM "ScreenEvent" WHERE "screenId"=sid) OR s."stateVersion"<>(SELECT COALESCE(max(version),0) FROM "ScreenEvent" WHERE "screenId"=sid) OR NOT EXISTS(SELECT 1 FROM "ScreenEvent" e WHERE e."screenId"=sid AND e.version=1 AND e.action='PURCHASE' AND e."userId"=s."userId" AND e."sourceKey"='screen:'||sid||':purchase' AND e."requestHash"=s."requestHash" AND e."before" IS NULL AND e."after"=jsonb_build_object('status','AVAILABLE','stateVersion',1)) OR EXISTS(SELECT 1 FROM "ScreenEvent" WHERE "screenId"=sid AND "userId"<>s."userId") THEN RAISE EXCEPTION 'SCREEN_EVENT_RECONCILIATION';END IF;RETURN NULL;
END $$;
