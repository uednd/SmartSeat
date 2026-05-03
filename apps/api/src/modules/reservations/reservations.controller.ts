import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AdminReservationListRequest,
  type CancelReservationRequest,
  type CheckinRequest,
  type CheckinResponse,
  type CreateReservationRequest,
  type CurrentUsageResponse,
  type ExtendReservationRequest,
  type PageRequest,
  type PageResponse,
  type ReservationDto,
  type UserReleaseReservationRequest
} from '@smartseat/contracts';

import { AdminGuard } from '../../common/auth/admin.guard.js';
import { BearerAuthGuard } from '../../common/auth/bearer-auth.guard.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { RequestUser } from '../../common/auth/request-user.js';
import { ReservationsService } from './reservations.service.js';

@ApiTags('reservations')
@ApiBearerAuth()
@Controller('reservations')
@UseGuards(BearerAuthGuard)
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a student reservation' })
  async createReservation(
    @CurrentUser() user: RequestUser,
    @Body() request: CreateReservationRequest
  ): Promise<ReservationDto> {
    return await this.reservationsService.createReservation(user, request);
  }

  @Get('current')
  @ApiOperation({ summary: 'Get the current student reservation' })
  async getCurrentReservation(
    @CurrentUser() user: RequestUser
  ): Promise<ReservationDto | undefined> {
    return await this.reservationsService.getCurrentReservation(user);
  }

  @Get('history')
  @ApiOperation({ summary: 'List current student reservation history' })
  async listReservationHistory(
    @CurrentUser() user: RequestUser,
    @Query() request: PageRequest
  ): Promise<PageResponse<ReservationDto>> {
    return await this.reservationsService.listReservationHistory(user, request);
  }

  @Delete(':reservation_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a waiting check-in reservation' })
  async cancelReservation(
    @CurrentUser() user: RequestUser,
    @Param('reservation_id') reservationId: string,
    @Body() request: Partial<CancelReservationRequest>
  ): Promise<ReservationDto> {
    return await this.reservationsService.cancelReservation(user, reservationId, request ?? {});
  }

  @Post(':reservation_id/extend')
  @ApiOperation({ summary: 'Extend a checked-in reservation' })
  async extendReservation(
    @CurrentUser() user: RequestUser,
    @Param('reservation_id') reservationId: string,
    @Body() request: ExtendReservationRequest
  ): Promise<ReservationDto> {
    return await this.reservationsService.extendReservation(user, reservationId, request);
  }
}

@ApiTags('current-usage')
@ApiBearerAuth()
@Controller('current-usage')
@UseGuards(BearerAuthGuard)
export class CurrentUsageController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current checked-in usage for a student' })
  async getCurrentUsage(
    @CurrentUser() user: RequestUser
  ): Promise<CurrentUsageResponse | undefined> {
    return await this.reservationsService.getCurrentUsage(user);
  }

  @Post('release')
  @ApiOperation({ summary: 'Release the current checked-in usage as a student' })
  async releaseCurrentUsage(
    @CurrentUser() user: RequestUser,
    @Body() request: UserReleaseReservationRequest
  ): Promise<ReservationDto> {
    return await this.reservationsService.releaseCurrentUsage(user, request);
  }
}

@ApiTags('checkin')
@ApiBearerAuth()
@Controller('checkin')
@UseGuards(BearerAuthGuard)
export class CheckinController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @ApiOperation({ summary: 'Check in to a reservation with a dynamic QR token' })
  async checkin(
    @CurrentUser() user: RequestUser,
    @Body() request: CheckinRequest
  ): Promise<CheckinResponse> {
    return await this.reservationsService.checkin(user, request);
  }
}

@ApiTags('admin-reservations')
@ApiBearerAuth()
@Controller('admin/reservations')
@UseGuards(BearerAuthGuard, AdminGuard)
export class AdminReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get('current')
  @ApiOperation({ summary: 'List current reservations for administrators' })
  async listCurrentReservations(
    @Query() request: AdminReservationListRequest
  ): Promise<PageResponse<ReservationDto>> {
    return await this.reservationsService.listAdminCurrentReservations(request);
  }

  @Get('seats/:seat_id')
  @ApiOperation({ summary: 'Get current reservation status for a seat' })
  async getSeatReservation(@Param('seat_id') seatId: string): Promise<ReservationDto | undefined> {
    return await this.reservationsService.getAdminSeatReservation(seatId);
  }
}
