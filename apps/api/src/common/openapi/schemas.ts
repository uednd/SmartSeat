import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface.js';

const id = (): SchemaObject => ({ type: 'string' });
const text = (): SchemaObject => ({ type: 'string' });
const dateTime = (): SchemaObject => ({ type: 'string', format: 'date-time' });
const integer = (): SchemaObject => ({ type: 'integer' });
const bool = (): SchemaObject => ({ type: 'boolean' });
const stringArray = (): SchemaObject => ({ type: 'array', items: text() });

export const apiPageOf = (itemSchema: SchemaObject): SchemaObject => ({
  type: 'object',
  required: ['items', 'page', 'page_size', 'total'],
  properties: {
    items: {
      type: 'array',
      items: itemSchema
    },
    page: integer(),
    page_size: integer(),
    total: integer()
  }
});

export const authConfigPublicSchema: SchemaObject = {
  type: 'object',
  required: ['auth_mode', 'oidc_secret_configured', 'wechat_secret_configured'],
  properties: {
    auth_mode: text(),
    oidc_issuer: text(),
    oidc_client_id: text(),
    oidc_redirect_uri: text(),
    oidc_secret_configured: bool(),
    wechat_appid: text(),
    wechat_secret_configured: bool(),
    admin_mapping_rule: text(),
    updated_by: id(),
    updated_at: dateTime()
  }
};

export const loginModeResponseSchema: SchemaObject = {
  type: 'object',
  required: ['auth_mode', 'config'],
  properties: {
    auth_mode: text(),
    config: authConfigPublicSchema
  }
};

export const wechatLoginRequestSchema: SchemaObject = {
  type: 'object',
  required: ['code'],
  properties: {
    code: text(),
    displayName: text(),
    avatarUrl: text()
  }
};

export const oidcAuthorizeUrlResponseSchema: SchemaObject = {
  type: 'object',
  required: ['authorization_url', 'state'],
  properties: {
    authorization_url: text(),
    state: text()
  }
};

export const oidcCallbackRequestSchema: SchemaObject = {
  type: 'object',
  required: ['code', 'state'],
  properties: {
    code: text(),
    state: text()
  }
};

export const updateAuthConfigRequestSchema: SchemaObject = {
  type: 'object',
  required: ['auth_mode'],
  properties: {
    auth_mode: text(),
    oidc_issuer: text(),
    oidc_client_id: text(),
    oidc_client_secret: text(),
    oidc_redirect_uri: text(),
    admin_mapping_rule: text(),
    wechat_appid: text(),
    wechat_secret: text()
  }
};

export const userSchema: SchemaObject = {
  type: 'object',
  required: [
    'user_id',
    'auth_provider',
    'roles',
    'anonymous_name',
    'leaderboard_enabled',
    'no_show_count_week',
    'no_show_count_month',
    'created_at',
    'updated_at'
  ],
  properties: {
    user_id: id(),
    auth_provider: text(),
    roles: stringArray(),
    anonymous_name: text(),
    display_name: text(),
    avatar_url: text(),
    leaderboard_enabled: bool(),
    no_show_count_week: integer(),
    no_show_count_month: integer(),
    created_at: dateTime(),
    updated_at: dateTime()
  }
};

export const authSessionResponseSchema: SchemaObject = {
  type: 'object',
  required: ['token', 'token_type', 'expires_at', 'user', 'role', 'roles', 'next_route'],
  properties: {
    token: text(),
    token_type: text(),
    expires_at: dateTime(),
    user: userSchema,
    role: text(),
    roles: stringArray(),
    next_route: text()
  }
};

export const meResponseSchema: SchemaObject = {
  type: 'object',
  required: [
    'user_id',
    'role',
    'display_name',
    'anonymous_name',
    'user',
    'roles',
    'auth_mode',
    'next_route'
  ],
  properties: {
    user_id: id(),
    role: text(),
    display_name: text(),
    anonymous_name: text(),
    user: userSchema,
    roles: stringArray(),
    auth_mode: text(),
    next_route: text()
  }
};

export const updateLeaderboardPreferenceRequestSchema: SchemaObject = {
  type: 'object',
  required: ['leaderboard_enabled'],
  properties: {
    leaderboard_enabled: bool()
  }
};

export const seatSchema: SchemaObject = {
  type: 'object',
  required: [
    'seat_id',
    'seat_no',
    'area',
    'business_status',
    'availability_status',
    'presence_status',
    'updated_at'
  ],
  properties: {
    seat_id: id(),
    seat_no: text(),
    area: text(),
    business_status: text(),
    availability_status: text(),
    unavailable_reason: text(),
    device_id: id(),
    presence_status: text(),
    updated_at: dateTime()
  }
};

export const deviceSchema: SchemaObject = {
  type: 'object',
  required: ['device_id', 'online_status', 'created_at', 'updated_at'],
  properties: {
    device_id: id(),
    seat_id: id(),
    online_status: text(),
    last_heartbeat_at: dateTime(),
    firmware_version: text(),
    created_at: dateTime(),
    updated_at: dateTime()
  }
};

export const adminDeviceSchema: SchemaObject = {
  type: 'object',
  properties: {
    ...deviceSchema.properties,
    mqtt_client_id: text(),
    sensor_status: text(),
    sensor_model: text(),
    hardware_version: text(),
    network_status: text(),
    seat: seatSchema
  }
};

export const seatDetailSchema: SchemaObject = {
  type: 'object',
  properties: {
    ...seatSchema.properties,
    current_occupancy: {
      type: 'object',
      properties: {
        reservation_id: id(),
        seat_id: id(),
        start_time: dateTime(),
        end_time: dateTime(),
        status: text()
      }
    },
    device: deviceSchema
  }
};

export const adminSeatDetailSchema: SchemaObject = {
  type: 'object',
  properties: {
    ...seatSchema.properties,
    maintenance: bool(),
    current_reservation: {
      type: 'object',
      properties: {
        reservation_id: id(),
        user_id: id(),
        seat_id: id(),
        start_time: dateTime(),
        end_time: dateTime(),
        status: text()
      }
    },
    device: adminDeviceSchema,
    active_anomaly_count: integer(),
    remaining_seconds: integer()
  }
};

export const createSeatRequestSchema: SchemaObject = {
  type: 'object',
  required: ['seat_no', 'area'],
  properties: {
    seat_id: id(),
    seat_no: text(),
    area: text()
  }
};

export const updateSeatRequestSchema: SchemaObject = {
  type: 'object',
  properties: {
    seat_no: text(),
    area: text()
  }
};

export const setSeatEnabledRequestSchema: SchemaObject = {
  type: 'object',
  required: ['enabled'],
  properties: {
    enabled: bool(),
    reason: text()
  }
};

export const createDeviceRequestSchema: SchemaObject = {
  type: 'object',
  required: ['mqtt_client_id'],
  properties: {
    device_id: id(),
    mqtt_client_id: text(),
    firmware_version: text(),
    hardware_version: text(),
    sensor_model: text(),
    network_status: text()
  }
};

export const updateDeviceRequestSchema: SchemaObject = {
  type: 'object',
  properties: {
    mqtt_client_id: text(),
    firmware_version: text(),
    hardware_version: text(),
    sensor_model: text(),
    network_status: text()
  }
};

export const bindDeviceSeatRequestSchema: SchemaObject = {
  type: 'object',
  required: ['seat_id'],
  properties: {
    seat_id: id(),
    reason: text()
  }
};

export const unbindDeviceSeatRequestSchema: SchemaObject = {
  type: 'object',
  properties: {
    reason: text()
  }
};

export const reservationSchema: SchemaObject = {
  type: 'object',
  required: [
    'reservation_id',
    'user_id',
    'seat_id',
    'start_time',
    'end_time',
    'status',
    'checkin_start_time',
    'checkin_deadline',
    'created_at'
  ],
  properties: {
    reservation_id: id(),
    user_id: id(),
    seat_id: id(),
    start_time: dateTime(),
    end_time: dateTime(),
    status: text(),
    checkin_start_time: dateTime(),
    checkin_deadline: dateTime(),
    checked_in_at: dateTime(),
    released_at: dateTime(),
    release_reason: text(),
    created_at: dateTime()
  }
};

export const createReservationRequestSchema: SchemaObject = {
  type: 'object',
  required: ['seat_id', 'start_time', 'end_time'],
  properties: {
    seat_id: id(),
    start_time: dateTime(),
    end_time: dateTime()
  }
};

export const cancelReservationRequestSchema: SchemaObject = {
  type: 'object',
  properties: {
    reason: text()
  }
};

export const extendReservationRequestSchema: SchemaObject = {
  type: 'object',
  required: ['reservation_id', 'end_time'],
  properties: {
    reservation_id: id(),
    end_time: dateTime()
  }
};

export const userReleaseReservationRequestSchema: SchemaObject = {
  type: 'object',
  required: ['reservation_id'],
  properties: {
    reservation_id: id(),
    reason: text()
  }
};

export const currentUsageResponseSchema: SchemaObject = {
  type: 'object',
  required: ['reservation', 'seat', 'remaining_seconds'],
  properties: {
    reservation: reservationSchema,
    seat: seatSchema,
    remaining_seconds: integer()
  }
};

export const checkinRequestSchema: SchemaObject = {
  type: 'object',
  required: ['seat_id', 'device_id', 'token', 'timestamp'],
  properties: {
    seat_id: id(),
    device_id: id(),
    token: text(),
    timestamp: dateTime()
  }
};

export const checkinResponseSchema: SchemaObject = {
  type: 'object',
  required: ['reservation', 'seat', 'checked_in_at'],
  properties: {
    reservation: reservationSchema,
    seat: seatSchema,
    checked_in_at: dateTime()
  }
};
