import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { PhoneRoleDto } from './phone-role.dto';

export class VerifyOtpDto extends PhoneRoleDto {
  @ApiProperty({
    example: '042917',
    description: 'The 6-digit OTP exactly as delivered.',
  })
  @IsString()
  @Length(6, 6)
  code!: string;

  @ApiProperty({
    required: false,
    example: 'Asha Verma',
    description:
      'Display name. REQUIRED on first login (when the phone has no account yet); ' +
      'ignored when the account already exists.',
  })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  fullName?: string;
}
