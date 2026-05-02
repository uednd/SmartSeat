-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AuthMode" AS ENUM ('WECHAT', 'OIDC');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('WECHAT', 'OIDC');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "SeatStatus" AS ENUM ('FREE', 'RESERVED', 'OCCUPIED', 'ENDING_SOON', 'PENDING_RELEASE');

-- CreateEnum
CREATE TYPE "DeviceOnlineStatus" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "SeatAvailability" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "SeatUnavailableReason" AS ENUM ('DEVICE_OFFLINE', 'SENSOR_ERROR', 'ADMIN_MAINTENANCE');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('WAITING_CHECKIN', 'CHECKED_IN', 'FINISHED', 'CANCELLED', 'NO_SHOW', 'USER_RELEASED', 'ADMIN_RELEASED', 'TIMEOUT_FINISHED');

-- CreateEnum
CREATE TYPE "PresenceStatus" AS ENUM ('PRESENT', 'ABSENT', 'UNKNOWN', 'ERROR');

-- CreateEnum
CREATE TYPE "SensorHealthStatus" AS ENUM ('OK', 'UNKNOWN', 'ERROR');

-- CreateEnum
CREATE TYPE "QRTokenStatus" AS ENUM ('UNUSED', 'USED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AnomalyType" AS ENUM ('NO_SHOW', 'UNRESERVED_OCCUPANCY', 'EARLY_LEAVE_SUSPECTED', 'OVERTIME_OCCUPANCY', 'DEVICE_OFFLINE', 'SENSOR_ERROR', 'CHECKIN_FAILED');

-- CreateEnum
CREATE TYPE "AnomalyStatus" AS ENUM ('PENDING', 'HANDLED', 'IGNORED');

-- CreateEnum
CREATE TYPE "AdminActionType" AS ENUM ('RELEASE_SEAT', 'SET_MAINTENANCE', 'RESTORE_AVAILABLE', 'HANDLE_ANOMALY', 'IGNORE_ANOMALY', 'UPDATE_AUTH_CONFIG');

-- CreateTable
CREATE TABLE "users" (
    "user_id" TEXT NOT NULL,
    "auth_provider" "AuthProvider" NOT NULL,
    "openid" TEXT,
    "unionid" TEXT,
    "oidc_sub" TEXT,
    "external_user_no" TEXT,
    "roles" "UserRole"[] DEFAULT ARRAY['STUDENT']::"UserRole"[],
    "anonymous_name" TEXT NOT NULL,
    "leaderboard_enabled" BOOLEAN NOT NULL DEFAULT true,
    "no_show_count_week" INTEGER NOT NULL DEFAULT 0,
    "no_show_count_month" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "auth_configs" (
    "config_id" TEXT NOT NULL,
    "auth_mode" "AuthMode" NOT NULL DEFAULT 'WECHAT',
    "oidc_issuer" TEXT,
    "oidc_client_id" TEXT,
    "oidc_client_secret" TEXT,
    "oidc_redirect_uri" TEXT,
    "admin_mapping_rule" TEXT,
    "wechat_appid" TEXT,
    "wechat_secret" TEXT,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_configs_pkey" PRIMARY KEY ("config_id")
);

-- CreateTable
CREATE TABLE "seats" (
    "seat_id" TEXT NOT NULL,
    "seat_no" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "business_status" "SeatStatus" NOT NULL DEFAULT 'FREE',
    "availability_status" "SeatAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "unavailable_reason" "SeatUnavailableReason",
    "device_id" TEXT,
    "presence_status" "PresenceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "maintenance" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seats_pkey" PRIMARY KEY ("seat_id")
);

-- CreateTable
CREATE TABLE "devices" (
    "device_id" TEXT NOT NULL,
    "seat_id" TEXT,
    "mqtt_client_id" TEXT NOT NULL,
    "online_status" "DeviceOnlineStatus" NOT NULL DEFAULT 'OFFLINE',
    "last_heartbeat_at" TIMESTAMP(3),
    "sensor_status" "SensorHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "sensor_model" TEXT,
    "firmware_version" TEXT,
    "hardware_version" TEXT,
    "network_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("device_id")
);

-- CreateTable
CREATE TABLE "device_seat_bindings" (
    "binding_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "seat_id" TEXT NOT NULL,
    "bound_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unbound_at" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "device_seat_bindings_pkey" PRIMARY KEY ("binding_id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "reservation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "seat_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "checkin_start_time" TIMESTAMP(3) NOT NULL,
    "checkin_deadline" TIMESTAMP(3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'WAITING_CHECKIN',
    "checked_in_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "release_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("reservation_id")
);

-- CreateTable
CREATE TABLE "qr_tokens" (
    "token_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "reservation_id" TEXT,
    "seat_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expired_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "status" "QRTokenStatus" NOT NULL DEFAULT 'UNUSED',

    CONSTRAINT "qr_tokens_pkey" PRIMARY KEY ("token_id")
);

-- CreateTable
CREATE TABLE "checkin_records" (
    "checkin_id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "seat_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "qr_token_id" TEXT,
    "checked_in_at" TIMESTAMP(3) NOT NULL,
    "presence_status" "PresenceStatus",
    "source" TEXT NOT NULL DEFAULT 'qr_token',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_records_pkey" PRIMARY KEY ("checkin_id")
);

-- CreateTable
CREATE TABLE "sensor_readings" (
    "reading_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "seat_id" TEXT NOT NULL,
    "presence_status" "PresenceStatus" NOT NULL,
    "sensor_status" "SensorHealthStatus",
    "raw_value" JSONB,
    "reported_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensor_readings_pkey" PRIMARY KEY ("reading_id")
);

-- CreateTable
CREATE TABLE "anomaly_events" (
    "event_id" TEXT NOT NULL,
    "event_type" "AnomalyType" NOT NULL,
    "seat_id" TEXT NOT NULL,
    "user_id" TEXT,
    "device_id" TEXT,
    "reservation_id" TEXT,
    "description" TEXT NOT NULL,
    "status" "AnomalyStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handled_by" TEXT,
    "handled_at" TIMESTAMP(3),
    "handle_note" TEXT,

    CONSTRAINT "anomaly_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "maintenance_records" (
    "maintenance_id" TEXT NOT NULL,
    "seat_id" TEXT NOT NULL,
    "started_by" TEXT NOT NULL,
    "ended_by" TEXT,
    "reason" TEXT,
    "detail" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("maintenance_id")
);

-- CreateTable
CREATE TABLE "study_records" (
    "record_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "seat_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "valid_flag" BOOLEAN NOT NULL DEFAULT true,
    "invalid_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_records_pkey" PRIMARY KEY ("record_id")
);

-- CreateTable
CREATE TABLE "admin_action_logs" (
    "log_id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "action_type" "AdminActionType" NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_action_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_openid_key" ON "users"("openid");

-- CreateIndex
CREATE UNIQUE INDEX "users_unionid_key" ON "users"("unionid");

-- CreateIndex
CREATE UNIQUE INDEX "users_oidc_sub_key" ON "users"("oidc_sub");

-- CreateIndex
CREATE UNIQUE INDEX "users_external_user_no_key" ON "users"("external_user_no");

-- CreateIndex
CREATE INDEX "users_auth_provider_idx" ON "users"("auth_provider");

-- CreateIndex
CREATE INDEX "users_roles_idx" ON "users" USING GIN ("roles");

-- CreateIndex
CREATE UNIQUE INDEX "seats_seat_no_key" ON "seats"("seat_no");

-- CreateIndex
CREATE INDEX "seats_business_status_idx" ON "seats"("business_status");

-- CreateIndex
CREATE INDEX "seats_availability_status_idx" ON "seats"("availability_status");

-- CreateIndex
CREATE INDEX "seats_device_id_idx" ON "seats"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_mqtt_client_id_key" ON "devices"("mqtt_client_id");

-- CreateIndex
CREATE INDEX "devices_seat_id_idx" ON "devices"("seat_id");

-- CreateIndex
CREATE INDEX "devices_online_status_idx" ON "devices"("online_status");

-- CreateIndex
CREATE INDEX "device_seat_bindings_device_id_bound_at_idx" ON "device_seat_bindings"("device_id", "bound_at");

-- CreateIndex
CREATE INDEX "device_seat_bindings_seat_id_bound_at_idx" ON "device_seat_bindings"("seat_id", "bound_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_seat_bindings_active_device_id_key" ON "device_seat_bindings"("device_id") WHERE "unbound_at" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "device_seat_bindings_active_seat_id_key" ON "device_seat_bindings"("seat_id") WHERE "unbound_at" IS NULL;

-- CreateIndex
CREATE INDEX "reservations_user_id_status_idx" ON "reservations"("user_id", "status");

-- CreateIndex
CREATE INDEX "reservations_seat_id_status_idx" ON "reservations"("seat_id", "status");

-- CreateIndex
CREATE INDEX "reservations_start_time_end_time_idx" ON "reservations"("start_time", "end_time");

-- CreateIndex
CREATE UNIQUE INDEX "qr_tokens_token_key" ON "qr_tokens"("token");

-- CreateIndex
CREATE INDEX "qr_tokens_seat_id_status_idx" ON "qr_tokens"("seat_id", "status");

-- CreateIndex
CREATE INDEX "qr_tokens_device_id_generated_at_idx" ON "qr_tokens"("device_id", "generated_at");

-- CreateIndex
CREATE INDEX "qr_tokens_reservation_id_idx" ON "qr_tokens"("reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkin_records_qr_token_id_key" ON "checkin_records"("qr_token_id");

-- CreateIndex
CREATE INDEX "checkin_records_reservation_id_idx" ON "checkin_records"("reservation_id");

-- CreateIndex
CREATE INDEX "checkin_records_user_id_checked_in_at_idx" ON "checkin_records"("user_id", "checked_in_at");

-- CreateIndex
CREATE INDEX "checkin_records_seat_id_checked_in_at_idx" ON "checkin_records"("seat_id", "checked_in_at");

-- CreateIndex
CREATE INDEX "sensor_readings_device_id_reported_at_idx" ON "sensor_readings"("device_id", "reported_at");

-- CreateIndex
CREATE INDEX "sensor_readings_seat_id_reported_at_idx" ON "sensor_readings"("seat_id", "reported_at");

-- CreateIndex
CREATE INDEX "sensor_readings_presence_status_idx" ON "sensor_readings"("presence_status");

-- CreateIndex
CREATE INDEX "anomaly_events_status_created_at_idx" ON "anomaly_events"("status", "created_at");

-- CreateIndex
CREATE INDEX "anomaly_events_event_type_idx" ON "anomaly_events"("event_type");

-- CreateIndex
CREATE INDEX "anomaly_events_seat_id_status_idx" ON "anomaly_events"("seat_id", "status");

-- CreateIndex
CREATE INDEX "maintenance_records_seat_id_ended_at_idx" ON "maintenance_records"("seat_id", "ended_at");

-- CreateIndex
CREATE INDEX "maintenance_records_started_by_started_at_idx" ON "maintenance_records"("started_by", "started_at");

-- CreateIndex
CREATE INDEX "study_records_user_id_start_time_idx" ON "study_records"("user_id", "start_time");

-- CreateIndex
CREATE INDEX "study_records_seat_id_start_time_idx" ON "study_records"("seat_id", "start_time");

-- CreateIndex
CREATE INDEX "study_records_valid_flag_start_time_idx" ON "study_records"("valid_flag", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "study_records_reservation_id_key" ON "study_records"("reservation_id");

-- CreateIndex
CREATE INDEX "admin_action_logs_admin_id_created_at_idx" ON "admin_action_logs"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_action_logs_target_type_target_id_idx" ON "admin_action_logs"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "auth_configs" ADD CONSTRAINT "auth_configs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seats" ADD CONSTRAINT "seats_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("device_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("seat_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_seat_bindings" ADD CONSTRAINT "device_seat_bindings_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("device_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_seat_bindings" ADD CONSTRAINT "device_seat_bindings_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("seat_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("seat_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_tokens" ADD CONSTRAINT "qr_tokens_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("reservation_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_tokens" ADD CONSTRAINT "qr_tokens_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("seat_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_tokens" ADD CONSTRAINT "qr_tokens_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("device_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_records" ADD CONSTRAINT "checkin_records_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("reservation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_records" ADD CONSTRAINT "checkin_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_records" ADD CONSTRAINT "checkin_records_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("seat_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_records" ADD CONSTRAINT "checkin_records_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("device_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_records" ADD CONSTRAINT "checkin_records_qr_token_id_fkey" FOREIGN KEY ("qr_token_id") REFERENCES "qr_tokens"("token_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensor_readings" ADD CONSTRAINT "sensor_readings_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("device_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensor_readings" ADD CONSTRAINT "sensor_readings_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("seat_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_events" ADD CONSTRAINT "anomaly_events_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("seat_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_events" ADD CONSTRAINT "anomaly_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_events" ADD CONSTRAINT "anomaly_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("device_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_events" ADD CONSTRAINT "anomaly_events_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("reservation_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_events" ADD CONSTRAINT "anomaly_events_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("seat_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_ended_by_fkey" FOREIGN KEY ("ended_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_records" ADD CONSTRAINT "study_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_records" ADD CONSTRAINT "study_records_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("reservation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_records" ADD CONSTRAINT "study_records_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("seat_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_action_logs" ADD CONSTRAINT "admin_action_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
