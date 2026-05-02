import type { EntityId, UserRole } from '@smartseat/contracts';

export interface RequestUser {
  user_id: EntityId;
  roles: UserRole[];
}
