import {
  AdminActionType as ContractAdminActionType,
  AnomalyStatus as ContractAnomalyStatus,
  AnomalyType as ContractAnomalyType,
  AuthMode as ContractAuthMode,
  AuthProvider as ContractAuthProvider,
  DeviceOnlineStatus as ContractDeviceOnlineStatus,
  PresenceStatus as ContractPresenceStatus,
  QRTokenStatus as ContractQRTokenStatus,
  ReservationStatus as ContractReservationStatus,
  SeatAvailability as ContractSeatAvailability,
  SeatStatus as ContractSeatStatus,
  SeatUnavailableReason as ContractSeatUnavailableReason,
  SensorHealthStatus as ContractSensorHealthStatus,
  UserRole as ContractUserRole
} from '@smartseat/contracts';
import {
  AdminActionType,
  AnomalyStatus,
  AnomalyType,
  AuthMode,
  AuthProvider,
  DeviceOnlineStatus,
  PresenceStatus,
  QRTokenStatus,
  ReservationStatus,
  SeatAvailability,
  SeatStatus,
  SeatUnavailableReason,
  SensorHealthStatus,
  UserRole
} from '@prisma/client';
import { describe, expect, it } from 'vitest';

const sortedValues = (values: Record<string, string>): string[] => Object.values(values).sort();

describe('Prisma enum baseline', () => {
  it.each([
    ['AuthMode', AuthMode, ContractAuthMode],
    ['AuthProvider', AuthProvider, ContractAuthProvider],
    ['UserRole', UserRole, ContractUserRole],
    ['SeatStatus', SeatStatus, ContractSeatStatus],
    ['DeviceOnlineStatus', DeviceOnlineStatus, ContractDeviceOnlineStatus],
    ['SeatAvailability', SeatAvailability, ContractSeatAvailability],
    ['SeatUnavailableReason', SeatUnavailableReason, ContractSeatUnavailableReason],
    ['ReservationStatus', ReservationStatus, ContractReservationStatus],
    ['PresenceStatus', PresenceStatus, ContractPresenceStatus],
    ['SensorHealthStatus', SensorHealthStatus, ContractSensorHealthStatus],
    ['QRTokenStatus', QRTokenStatus, ContractQRTokenStatus],
    ['AnomalyType', AnomalyType, ContractAnomalyType],
    ['AnomalyStatus', AnomalyStatus, ContractAnomalyStatus],
    ['AdminActionType', AdminActionType, ContractAdminActionType]
  ])('keeps %s aligned with packages/contracts', (_name, prismaEnum, contractEnum) => {
    expect(sortedValues(prismaEnum)).toEqual(sortedValues(contractEnum));
  });
});
