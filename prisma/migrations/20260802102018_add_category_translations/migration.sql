/*
  Warnings:

  - A unique constraint covering the columns `[guestAccessTokenHash]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Registration" DROP CONSTRAINT "Registration_activityId_fkey";

-- DropForeignKey
ALTER TABLE "Registration" DROP CONSTRAINT "Registration_userId_fkey";

-- DropIndex
DROP INDEX "Order_paidAt_idx";

-- DropIndex
DROP INDEX "Registration_registeredAt_idx";

-- DropIndex
DROP INDEX "Registration_userId_activityId_key";

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "maxTicketsPerOrder" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0.07;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "guestAccessTokenHash" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Order_guestAccessTokenHash_key" ON "Order"("guestAccessTokenHash");

-- CreateIndex
CREATE INDEX "Registration_createdAt_idx" ON "Registration"("createdAt");

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
