import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AdminDeviceDto,
  type BindDeviceSeatRequest,
  type CreateDeviceRequest,
  type DeviceDto,
  type DeviceListRequest,
  type PageResponse,
  type UnbindDeviceSeatRequest,
  type UpdateDeviceRequest
} from '@smartseat/contracts';

import { AdminGuard } from '../../common/auth/admin.guard.js';
import { BearerAuthGuard } from '../../common/auth/bearer-auth.guard.js';
import { DevicesService } from './devices.service.js';

@ApiTags('devices')
@ApiBearerAuth()
@Controller('devices')
@UseGuards(BearerAuthGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @ApiOperation({ summary: 'List devices for authenticated users' })
  async listDevices(@Query() request: DeviceListRequest): Promise<PageResponse<DeviceDto>> {
    return await this.devicesService.listDevices(request);
  }

  @Get(':device_id')
  @ApiOperation({ summary: 'Get device detail for authenticated users' })
  async getDevice(@Param('device_id') deviceId: string): Promise<DeviceDto> {
    return await this.devicesService.getDevice(deviceId);
  }
}

@ApiTags('admin-devices')
@ApiBearerAuth()
@Controller('admin/devices')
@UseGuards(BearerAuthGuard, AdminGuard)
export class AdminDevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @ApiOperation({ summary: 'List devices with administrator fields' })
  async listDevices(@Query() request: DeviceListRequest): Promise<PageResponse<AdminDeviceDto>> {
    return await this.devicesService.listAdminDevices(request);
  }

  @Get(':device_id')
  @ApiOperation({ summary: 'Get administrator device detail' })
  async getDevice(@Param('device_id') deviceId: string): Promise<AdminDeviceDto> {
    return await this.devicesService.getAdminDevice(deviceId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a device' })
  async createDevice(@Body() request: CreateDeviceRequest): Promise<AdminDeviceDto> {
    return await this.devicesService.createDevice(request);
  }

  @Patch(':device_id')
  @ApiOperation({ summary: 'Update device base information' })
  async updateDevice(
    @Param('device_id') deviceId: string,
    @Body() request: UpdateDeviceRequest
  ): Promise<AdminDeviceDto> {
    return await this.devicesService.updateDevice(deviceId, request);
  }

  @Put(':device_id/binding')
  @ApiOperation({ summary: 'Bind a device to a seat' })
  async bindDeviceSeat(
    @Param('device_id') deviceId: string,
    @Body() request: BindDeviceSeatRequest
  ): Promise<AdminDeviceDto> {
    return await this.devicesService.bindDeviceSeat(deviceId, request);
  }

  @Post(':device_id/unbind')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unbind a device from its active seat' })
  async unbindDeviceSeat(
    @Param('device_id') deviceId: string,
    @Body() request: UnbindDeviceSeatRequest
  ): Promise<AdminDeviceDto> {
    return await this.devicesService.unbindDeviceSeat(deviceId, request);
  }
}
