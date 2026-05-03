import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AdminSeatDetailDto,
  type AdminSeatOverviewDto,
  type CreateSeatRequest,
  type PageRequest,
  type PageResponse,
  type SeatDetailDto,
  type SeatDto,
  type SeatListRequest,
  type SetSeatEnabledRequest,
  type UpdateSeatRequest
} from '@smartseat/contracts';

import { AdminGuard } from '../../common/auth/admin.guard.js';
import { BearerAuthGuard } from '../../common/auth/bearer-auth.guard.js';
import { SeatsService } from './seats.service.js';

@ApiTags('seats')
@Controller('seats')
export class SeatsController {
  constructor(private readonly seatsService: SeatsService) {}

  @Get()
  @ApiOperation({ summary: 'List seats for miniapp home display' })
  async listSeats(@Query() request: SeatListRequest): Promise<PageResponse<SeatDto>> {
    return await this.seatsService.listPublicSeats(request);
  }

  @Get(':seat_id')
  @ApiOperation({ summary: 'Get seat detail for miniapp display' })
  async getSeat(@Param('seat_id') seatId: string): Promise<SeatDetailDto> {
    return await this.seatsService.getPublicSeat(seatId);
  }
}

@ApiTags('admin-seats')
@ApiBearerAuth()
@Controller('admin/seats')
@UseGuards(BearerAuthGuard, AdminGuard)
export class AdminSeatsController {
  constructor(private readonly seatsService: SeatsService) {}

  @Get()
  @ApiOperation({ summary: 'List seats with administrator fields' })
  async listSeats(@Query() request: PageRequest): Promise<PageResponse<AdminSeatOverviewDto>> {
    return await this.seatsService.listAdminSeats(request);
  }

  @Get(':seat_id')
  @ApiOperation({ summary: 'Get administrator seat detail' })
  async getSeat(@Param('seat_id') seatId: string): Promise<AdminSeatDetailDto> {
    return await this.seatsService.getAdminSeat(seatId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a seat' })
  async createSeat(@Body() request: CreateSeatRequest): Promise<AdminSeatDetailDto> {
    return await this.seatsService.createSeat(request);
  }

  @Patch(':seat_id')
  @ApiOperation({ summary: 'Update seat base information' })
  async updateSeat(
    @Param('seat_id') seatId: string,
    @Body() request: UpdateSeatRequest
  ): Promise<AdminSeatDetailDto> {
    return await this.seatsService.updateSeat(seatId, request);
  }

  @Patch(':seat_id/enabled')
  @ApiOperation({ summary: 'Enable or disable a seat for administrator maintenance' })
  async setSeatEnabled(
    @Param('seat_id') seatId: string,
    @Body() request: SetSeatEnabledRequest
  ): Promise<AdminSeatDetailDto> {
    return await this.seatsService.setSeatEnabled(seatId, request);
  }
}
