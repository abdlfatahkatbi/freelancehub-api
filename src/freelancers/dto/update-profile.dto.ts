import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimal, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Full-stack developer' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({ example: '45.00', description: 'USD per hour' })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  hourlyRate?: string;
}
