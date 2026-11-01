import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description:
      'Opaque refresh token received from /auth/otp/verify or a previous /auth/refresh.',
  })
  @IsString()
  @Length(32, 512)
  refreshToken!: string;
}
