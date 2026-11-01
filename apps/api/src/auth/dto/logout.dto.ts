import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class LogoutDto {
  @ApiProperty({
    description:
      'Refresh token of the session to revoke. The access token stays valid ' +
      'until it expires (short TTL by design).',
  })
  @IsString()
  @Length(32, 512)
  refreshToken!: string;
}
