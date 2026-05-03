import type { Device, Reservation, Seat } from '@prisma/client';
import {
  type AdminDeviceDto,
  type AdminSeatDetailDto,
  type DeviceDto,
  type DeviceOnlineStatus,
  type PresenceStatus,
  type ReservationSummaryDto,
  type ReservationStatus,
  type SeatAvailability,
  type SeatDetailDto,
  type SeatDto,
  type SeatOccupancySummaryDto,
  type SeatStatus,
  type SeatUnavailableReason,
  type SensorHealthStatus
} from '@smartseat/contracts';

export const toSeatDto = (seat: Seat): SeatDto => {
  const dto: SeatDto = {
    seat_id: seat.seatId,
    seat_no: seat.seatNo,
    area: seat.area,
    business_status: seat.businessStatus as SeatStatus,
    availability_status: seat.availabilityStatus as SeatAvailability,
    presence_status: seat.presenceStatus as PresenceStatus,
    updated_at: seat.updatedAt.toISOString()
  };

  if (seat.unavailableReason !== null) {
    dto.unavailable_reason = seat.unavailableReason as SeatUnavailableReason;
  }

  if (seat.deviceId !== null) {
    dto.device_id = seat.deviceId;
  }

  return dto;
};

export const toDeviceDto = (device: Device): DeviceDto => {
  const dto: DeviceDto = {
    device_id: device.deviceId,
    online_status: device.onlineStatus as DeviceOnlineStatus,
    created_at: device.createdAt.toISOString(),
    updated_at: device.updatedAt.toISOString()
  };

  if (device.seatId !== null) {
    dto.seat_id = device.seatId;
  }

  if (device.lastHeartbeatAt !== null) {
    dto.last_heartbeat_at = device.lastHeartbeatAt.toISOString();
  }

  if (device.firmwareVersion !== null) {
    dto.firmware_version = device.firmwareVersion;
  }

  return dto;
};

export const toAdminDeviceDto = (device: Device, seat?: Seat | null): AdminDeviceDto => {
  const dto: AdminDeviceDto = {
    ...toDeviceDto(device),
    mqtt_client_id: device.mqttClientId,
    sensor_status: device.sensorStatus as SensorHealthStatus
  };

  if (device.sensorModel !== null) {
    dto.sensor_model = device.sensorModel;
  }

  if (device.hardwareVersion !== null) {
    dto.hardware_version = device.hardwareVersion;
  }

  if (device.networkStatus !== null) {
    dto.network_status = device.networkStatus;
  }

  if (seat !== undefined && seat !== null) {
    dto.seat = toSeatDto(seat);
  }

  return dto;
};

export const toReservationSummaryDto = (reservation: Reservation): ReservationSummaryDto => ({
  reservation_id: reservation.reservationId,
  user_id: reservation.userId,
  seat_id: reservation.seatId,
  start_time: reservation.startTime.toISOString(),
  end_time: reservation.endTime.toISOString(),
  status: reservation.status as ReservationStatus
});

export const toSeatOccupancySummaryDto = (reservation: Reservation): SeatOccupancySummaryDto => ({
  reservation_id: reservation.reservationId,
  seat_id: reservation.seatId,
  start_time: reservation.startTime.toISOString(),
  end_time: reservation.endTime.toISOString(),
  status: reservation.status as ReservationStatus
});

export const toSeatDetailDto = (
  seat: Seat,
  input: {
    device?: Device | null;
    currentReservation?: Reservation | null;
  }
): SeatDetailDto => {
  const dto: SeatDetailDto = toSeatDto(seat);

  if (input.device !== undefined && input.device !== null) {
    dto.device = toDeviceDto(input.device);
  }

  if (input.currentReservation !== undefined && input.currentReservation !== null) {
    dto.current_occupancy = toSeatOccupancySummaryDto(input.currentReservation);
  }

  return dto;
};

export const toAdminSeatDetailDto = (
  seat: Seat,
  input: {
    device?: Device | null;
    currentReservation?: Reservation | null;
    activeAnomalyCount: number;
  }
): AdminSeatDetailDto => {
  const dto: AdminSeatDetailDto = {
    ...toSeatDto(seat),
    maintenance: seat.maintenance,
    active_anomaly_count: input.activeAnomalyCount
  };

  if (input.device !== undefined && input.device !== null) {
    dto.device = toAdminDeviceDto(input.device);
  }

  if (input.currentReservation !== undefined && input.currentReservation !== null) {
    dto.current_reservation = toReservationSummaryDto(input.currentReservation);
  }

  return dto;
};
