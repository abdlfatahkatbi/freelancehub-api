import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDecimal,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'Logo design' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 'Design a modern logo for a technology startup.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  description!: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId!: number;

  @ApiProperty({ example: '300.00', description: 'Budget in USD' })
  @IsDecimal({ decimal_digits: '0,2' })
  budget!: string;
}
