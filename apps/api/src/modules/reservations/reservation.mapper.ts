import type { Reservation } from '@prisma/client';
import { type ReservationDto, type ReservationStatus } from '@smartseat/contracts';

export const toReservationDto = (reservation: Reservation): ReservationDto => {
  const dto: ReservationDto = {
    reservation_id: reservation.reservationId,
    user_id: reservation.userId,
    seat_id: reservation.seatId,
    start_time: reservation.startTime.toISOString(),
    end_time: reservation.endTime.toISOString(),
    status: reservation.status as ReservationStatus,
    checkin_start_time: reservation.checkinStartTime.toISOString(),
    checkin_deadline: reservation.checkinDeadline.toISOString(),
    created_at: reservation.createdAt.toISOString()
  };

  if (reservation.checkedInAt !== null) {
    dto.checked_in_at = reservation.checkedInAt.toISOString();
  }

  if (reservation.releasedAt !== null) {
    dto.released_at = reservation.releasedAt.toISOString();
  }

  if (reservation.releaseReason !== null) {
    dto.release_reason = reservation.releaseReason;
  }

  return dto;
};
