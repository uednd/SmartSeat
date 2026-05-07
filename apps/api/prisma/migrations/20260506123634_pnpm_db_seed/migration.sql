-- DropForeignKey
ALTER TABLE "devices" DROP CONSTRAINT "devices_seat_id_fkey";

-- DropForeignKey
ALTER TABLE "seats" DROP CONSTRAINT "seats_device_id_fkey";
