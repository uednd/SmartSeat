import type { StudyRecord } from '@prisma/client';
import type { StudyRecordDto } from '@smartseat/contracts';

export const toStudyRecordDto = (record: StudyRecord): StudyRecordDto => {
  const dto: StudyRecordDto = {
    record_id: record.recordId,
    user_id: record.userId,
    reservation_id: record.reservationId,
    seat_id: record.seatId,
    start_time: record.startTime.toISOString(),
    end_time: record.endTime.toISOString(),
    duration_minutes: record.durationMinutes,
    source: record.source as StudyRecordDto['source'],
    valid_flag: record.validFlag,
    created_at: record.createdAt.toISOString()
  };

  if (record.invalidReason !== null) {
    dto.invalid_reason = record.invalidReason;
  }

  return dto;
};
