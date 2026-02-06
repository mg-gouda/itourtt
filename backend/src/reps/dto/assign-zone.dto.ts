import { IsUUID } from 'class-validator';

export class AssignZoneDto {
  @IsUUID()
  zoneId!: string;
}
