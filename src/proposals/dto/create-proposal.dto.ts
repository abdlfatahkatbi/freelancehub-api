import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateProposalDto {
  @ApiProperty({ example: '200.00', description: 'Proposal price in USD' })
  @IsDecimal({ decimal_digits: '0,2' })
  price!: string;

  @ApiProperty({ example: 7, minimum: 1 })
  @IsInt()
  @Min(1)
  durationDays!: number;

  @ApiProperty({ example: 'I can deliver this within one week.' })
  @IsString()
  @IsNotEmpty()
  message!: string;
}
