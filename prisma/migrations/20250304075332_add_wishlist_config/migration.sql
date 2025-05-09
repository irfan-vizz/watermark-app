-- CreateTable
CREATE TABLE "WishlistConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productIds" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "WishlistConfig_shop_key" ON "WishlistConfig"("shop");
