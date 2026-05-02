import { ApiProperty } from '@nestjs/swagger';

export type HealthStatus = 'ok';
export type DependencyStatus = 'configured' | 'not_configured' | 'unknown';

export class DependencyHealthDto {
  @ApiProperty({ enum: ['configured', 'not_configured', 'unknown'], type: String })
  status!: DependencyStatus;

  @ApiProperty({ example: false, type: Boolean })
  checked!: false;

  @ApiProperty({
    example: 'Configuration is present; live connection is not checked in API-PLT-01.',
    type: String
  })
  message!: string;
}

export class HealthDependenciesDto {
  @ApiProperty({ type: DependencyHealthDto })
  database!: DependencyHealthDto;

  @ApiProperty({ type: DependencyHealthDto })
  mqtt!: DependencyHealthDto;
}

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok'], type: String })
  status!: HealthStatus;

  @ApiProperty({ example: 'smartseat-api', type: String })
  service!: string;

  @ApiProperty({ example: '0.0.0', type: String })
  version!: string;

  @ApiProperty({ example: 'development', type: String })
  environment!: string;

  @ApiProperty({ format: 'date-time', type: String })
  timestamp!: string;

  @ApiProperty({ type: HealthDependenciesDto })
  dependencies!: HealthDependenciesDto;
}
