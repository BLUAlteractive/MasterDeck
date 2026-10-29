BEGIN;
-- CreateTable
CREATE TABLE "CardFavorite" (
    "userId" UUID NOT NULL,
    "instanceId" UUID NOT NULL,
    "favorite" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CardFavorite_pkey" PRIMARY KEY ("userId","instanceId")
);

-- AddForeignKey
ALTER TABLE "CardFavorite" ADD CONSTRAINT "CardFavorite_instanceId_userId_fkey" FOREIGN KEY ("instanceId", "userId") REFERENCES "CardInstance"("id", "ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT;


COMMIT;
