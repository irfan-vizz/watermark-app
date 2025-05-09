/*
  Warnings:

  - You are about to alter the column `productIds` on the `WishlistConfig` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WishlistConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productIds" JSONB NOT NULL
);
INSERT INTO "new_WishlistConfig" ("id", "productIds", "shop") SELECT "id", "productIds", "shop" FROM "WishlistConfig";
DROP TABLE "WishlistConfig";
ALTER TABLE "new_WishlistConfig" RENAME TO "WishlistConfig";
CREATE UNIQUE INDEX "WishlistConfig_shop_key" ON "WishlistConfig"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
