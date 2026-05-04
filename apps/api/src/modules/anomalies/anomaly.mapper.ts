import type { AnomalyEvent } from '@prisma/client';
import type { AnomalyEventDto } from '@smartseat/contracts';

export const toAnomalyEventDto = (event: AnomalyEvent): AnomalyEventDto => {
  const dto: AnomalyEventDto = {
    event_id: event.eventId,
    event_type: event.eventType as AnomalyEventDto['event_type'],
    seat_id: event.seatId,
    description: event.description,
    source: event.source as AnomalyEventDto['source'],
    status: event.status as AnomalyEventDto['status'],
    created_at: event.createdAt.toISOString()
  };

  if (event.userId !== null) {
    dto.user_id = event.userId;
  }

  if (event.deviceId !== null) {
    dto.device_id = event.deviceId;
  }

  if (event.reservationId !== null) {
    dto.reservation_id = event.reservationId;
  }

  if (event.reason !== null) {
    dto.reason = event.reason;
  }

  if (event.resolvedAt !== null) {
    dto.resolved_at = event.resolvedAt.toISOString();
  }

  if (event.handledById !== null) {
    dto.handled_by = event.handledById;
  }

  if (event.handledAt !== null) {
    dto.handled_at = event.handledAt.toISOString();
  }

  if (event.handleNote !== null) {
    dto.handle_note = event.handleNote;
  }

  return dto;
};
