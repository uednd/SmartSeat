-- AlterEnum
ALTER TYPE "AuthMode" ADD VALUE 'LOCAL';

-- AlterEnum
ALTER TYPE "AuthProvider" ADD VALUE 'LOCAL';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "local_sub" TEXT;
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_local_sub_key" ON "users"("local_sub");
