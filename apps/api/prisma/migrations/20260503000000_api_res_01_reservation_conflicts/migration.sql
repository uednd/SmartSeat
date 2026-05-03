CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_valid_time_range_check"
CHECK ("start_time" < "end_time");

-- Prisma cannot model partial PostgreSQL range exclusion constraints.
-- The existing DateTime columns are timestamp values, so tsrange matches the
-- current schema while enforcing overlap protection for effective reservations.
ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_active_seat_time_excl"
EXCLUDE USING gist (
    "seat_id" WITH =,
    tsrange("start_time", "end_time", '[)') WITH &&
)
WHERE ("status" IN ('WAITING_CHECKIN', 'CHECKED_IN'));

ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_active_user_time_excl"
EXCLUDE USING gist (
    "user_id" WITH =,
    tsrange("start_time", "end_time", '[)') WITH &&
)
WHERE ("status" IN ('WAITING_CHECKIN', 'CHECKED_IN'));
