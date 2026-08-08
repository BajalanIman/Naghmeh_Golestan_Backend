/*
  Warnings:

  - You are about to drop the column `availability` on the `JoinUsApplication` table. All the data in the column will be lost.
  - You are about to drop the column `consentAt` on the `JoinUsApplication` table. All the data in the column will be lost.
  - You are about to drop the column `cvUrl` on the `JoinUsApplication` table. All the data in the column will be lost.
  - You are about to drop the column `firstName` on the `JoinUsApplication` table. All the data in the column will be lost.
  - You are about to drop the column `lastName` on the `JoinUsApplication` table. All the data in the column will be lost.
  - You are about to drop the column `linkedInUrl` on the `JoinUsApplication` table. All the data in the column will be lost.
  - You are about to drop the column `motivation` on the `JoinUsApplication` table. All the data in the column will be lost.
  - You are about to drop the column `organization` on the `JoinUsApplication` table. All the data in the column will be lost.
  - You are about to drop the column `portfolioUrl` on the `JoinUsApplication` table. All the data in the column will be lost.
  - You are about to drop the column `position` on the `JoinUsApplication` table. All the data in the column will be lost.
  - You are about to drop the column `skills` on the `JoinUsApplication` table. All the data in the column will be lost.
  - Added the required column `aboutYourself` to the `JoinUsApplication` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contributionArea` to the `JoinUsApplication` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fullName` to the `JoinUsApplication` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ideaMessage` to the `JoinUsApplication` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "JoinUsApplication" DROP COLUMN "availability",
DROP COLUMN "consentAt",
DROP COLUMN "cvUrl",
DROP COLUMN "firstName",
DROP COLUMN "lastName",
DROP COLUMN "linkedInUrl",
DROP COLUMN "motivation",
DROP COLUMN "organization",
DROP COLUMN "portfolioUrl",
DROP COLUMN "position",
DROP COLUMN "skills",
ADD COLUMN     "aboutYourself" TEXT NOT NULL,
ADD COLUMN     "cityCountry" TEXT,
ADD COLUMN     "contributionArea" TEXT NOT NULL,
ADD COLUMN     "fullName" TEXT NOT NULL,
ADD COLUMN     "ideaMessage" TEXT NOT NULL,
ADD COLUMN     "language" "Language" NOT NULL DEFAULT 'EN';

-- CreateIndex
CREATE INDEX "JoinUsApplication_contributionArea_idx" ON "JoinUsApplication"("contributionArea");
