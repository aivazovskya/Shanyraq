import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateShiftHandoverNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}
