-- Multi-lojas por funcionário
CREATE TABLE IF NOT EXISTS "UserShopAssignment" (
  "userId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserShopAssignment_pkey" PRIMARY KEY ("userId", "shopId")
);

CREATE INDEX IF NOT EXISTS "UserShopAssignment_shopId_idx"
  ON "UserShopAssignment"("shopId");

ALTER TABLE "UserShopAssignment"
  ADD CONSTRAINT "UserShopAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserShopAssignment"
  ADD CONSTRAINT "UserShopAssignment_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

