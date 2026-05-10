import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AdminActionLogDto,
  type AdminDashboardDto,
  type AdminDeviceDto,
  type AdminReleaseSeatRequest,
  type AdminSeatDetailDto,
  type AdminSystemConfigDto,
  type AdminUpdateUserRequest,
  type AdminUserDto,
  type AnomalyEventDto,
  type AnomalyListRequest,
  type HandleAnomalyRequest,
  type NoShowRecordDto,
  type PageRequest,
  type PageResponse,
  type UpdateDeviceMaintenanceRequest,
  type UpdateSeatMaintenanceRequest
} from '@smartseat/contracts';

import { AdminGuard } from '../../common/auth/admin.guard.js';
import { BearerAuthGuard } from '../../common/auth/bearer-auth.guard.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { RequestUser } from '../../common/auth/request-user.js';
import {
  adminActionLogSchema,
  adminDashboardSchema,
  adminDeviceSchema,
  adminReleaseSeatRequestSchema,
  adminSeatDetailSchema,
  adminSystemConfigSchema,
  anomalyEventSchema,
  apiPageOf,
  handleAnomalyRequestSchema,
  noShowRecordSchema,
  updateDeviceMaintenanceRequestSchema,
  updateSeatMaintenanceRequestSchema
} from '../../common/openapi/schemas.js';
import { AdminService } from './admin.service.js';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(BearerAuthGuard, AdminGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get administrator dashboard summary' })
  @ApiOkResponse({ schema: adminDashboardSchema })
  async getDashboard(): Promise<AdminDashboardDto> {
    return await this.adminService.getDashboard();
  }

  @Get('no-shows')
  @ApiOperation({ summary: 'List administrator no-show records' })
  @ApiOkResponse({ schema: apiPageOf(noShowRecordSchema) })
  async listNoShows(@Query() request: PageRequest): Promise<PageResponse<NoShowRecordDto>> {
    return await this.adminService.listNoShows(request);
  }

  @Get('anomalies')
  @ApiOperation({ summary: 'List anomaly events for administrators' })
  @ApiOkResponse({ schema: apiPageOf(anomalyEventSchema) })
  async listAnomalies(
    @Query() request: AnomalyListRequest
  ): Promise<PageResponse<AnomalyEventDto>> {
    return await this.adminService.listAnomalies(request);
  }

  @Get('anomalies/:event_id')
  @ApiOperation({ summary: 'Get anomaly event detail for administrators' })
  @ApiOkResponse({ schema: anomalyEventSchema })
  async getAnomaly(@Param('event_id') eventId: string): Promise<AnomalyEventDto> {
    return await this.adminService.getAnomaly(eventId);
  }

  @Post('anomalies/handle')
  @ApiOperation({ summary: 'Acknowledge, handle, ignore, or close an anomaly event' })
  @ApiBody({ schema: handleAnomalyRequestSchema })
  @ApiOkResponse({ schema: anomalyEventSchema })
  async handleAnomaly(
    @CurrentUser() user: RequestUser,
    @Body() request: HandleAnomalyRequest
  ): Promise<AnomalyEventDto> {
    return await this.adminService.handleAnomaly(user, request);
  }

  @Post('seats/release')
  @ApiOperation({ summary: 'Release a seat as an administrator' })
  @ApiBody({ schema: adminReleaseSeatRequestSchema })
  @ApiOkResponse({ schema: adminSeatDetailSchema })
  async releaseSeat(
    @CurrentUser() user: RequestUser,
    @Body() request: AdminReleaseSeatRequest
  ): Promise<AdminSeatDetailDto> {
    return await this.adminService.releaseSeat(user, request);
  }

  @Post('seats/maintenance')
  @ApiOperation({ summary: 'Set or restore administrator seat maintenance' })
  @ApiBody({ schema: updateSeatMaintenanceRequestSchema })
  @ApiOkResponse({ schema: adminSeatDetailSchema })
  async setSeatMaintenance(
    @CurrentUser() user: RequestUser,
    @Body() request: UpdateSeatMaintenanceRequest
  ): Promise<AdminSeatDetailDto> {
    return await this.adminService.setSeatMaintenance(user, request);
  }

  @Post('devices/maintenance')
  @ApiOperation({ summary: 'Set or restore maintenance through a bound device' })
  @ApiBody({ schema: updateDeviceMaintenanceRequestSchema })
  @ApiOkResponse({ schema: adminDeviceSchema })
  async setDeviceMaintenance(
    @CurrentUser() user: RequestUser,
    @Body() request: UpdateDeviceMaintenanceRequest
  ): Promise<AdminDeviceDto> {
    return await this.adminService.setDeviceMaintenance(user, request);
  }

  @Get('config')
  @ApiOperation({ summary: 'Get desensitized administrator system configuration' })
  @ApiOkResponse({ schema: adminSystemConfigSchema })
  async getConfig(): Promise<AdminSystemConfigDto> {
    return await this.adminService.getSystemConfig();
  }

  @Get('action-logs')
  @ApiOperation({ summary: 'List administrator action logs' })
  @ApiOkResponse({ schema: apiPageOf(adminActionLogSchema) })
  async listActionLogs(@Query() request: PageRequest): Promise<PageResponse<AdminActionLogDto>> {
    return await this.adminService.listActionLogs(request);
  }

  @Get('users')
  @ApiOperation({ summary: 'List all users for administrator' })
  @ApiOkResponse({ schema: apiPageOf(adminActionLogSchema) })
  async listUsers(@Query() request: PageRequest): Promise<PageResponse<AdminUserDto>> {
    return await this.adminService.listUsers(request);
  }

  @Patch('users/:userId')
  @ApiOperation({ summary: 'Update user account (externalUserNo / password) by administrator' })
  async updateUser(
    @Param('userId') userId: string,
    @Body() request: AdminUpdateUserRequest
  ): Promise<void> {
    return await this.adminService.updateUser(userId, request);
  }

  @Delete('users/:userId')
  @ApiOperation({ summary: 'Delete a user by administrator' })
  async deleteUser(@Param('userId') userId: string): Promise<void> {
    return await this.adminService.deleteUser(userId);
  }
}
