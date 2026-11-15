import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal } from 'class-validator';

export class DepositDto {
  @ApiProperty({ example: '300.00', description: 'Amount in USD' })
  @IsDecimal({ decimal_digits: '0,2' })
  amount!: string;
}
