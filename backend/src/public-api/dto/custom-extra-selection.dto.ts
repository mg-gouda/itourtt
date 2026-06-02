import { IsString, IsNotEmpty, IsInt, Min } from 'class-validator';

// A single B2C catalog extra selected by the customer, with quantity.
export class CustomExtraSelectionDto {
  @IsString()
  @IsNotEmpty()
  extraId!: string;

  @IsInt()
  @Min(1)
  qty!: number;
}
