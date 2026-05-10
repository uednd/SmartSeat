-- CreateTable
CREATE TABLE "system_messages" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_message_dismisses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_message_dismisses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_message_dismisses_user_id_message_id_key" ON "user_message_dismisses"("user_id", "message_id");

-- CreateIndex
CREATE INDEX "user_message_dismisses_user_id_idx" ON "user_message_dismisses"("user_id");

-- CreateIndex
CREATE INDEX "user_message_dismisses_message_id_idx" ON "user_message_dismisses"("message_id");

-- AddForeignKey
ALTER TABLE "user_message_dismisses" ADD CONSTRAINT "user_message_dismisses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_message_dismisses" ADD CONSTRAINT "user_message_dismisses_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "system_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
