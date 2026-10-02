-- CreateEnum
CREATE TYPE "SessionSelectionMode" AS ENUM ('ALL', 'SINGLE', 'MULTIPLE');

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "sessionSelectionMode" "SessionSelectionMode" NOT NULL DEFAULT 'ALL';
