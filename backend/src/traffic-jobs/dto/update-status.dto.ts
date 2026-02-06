import { IsNotEmpty, IsIn } from 'class-validator';

export class UpdateStatusDto {
  @IsNotEmpty()
  @IsIn(['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  status!: 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}
