import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches } from 'class-validator';
import { AUTH_ROLES } from '@rideppy/contracts';

/** Shared E.164 phone validation (single definition, DTO-level). */
export const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

export class PhoneRoleDto {
  @ApiProperty({
    example: '+919876543210',
    description: 'Phone number in E.164 format (8..15 digits, leading +).',
  })
  @IsString()
  @Matches(E164_PHONE_REGEX, {
    message: 'phone must be E.164 formatted, e.g. +919876543210',
  })
  phone!: string;

  /**
   * Self-service roles only. ADMIN is deliberately excluded — admin accounts
   * are provisioned by operations and can never be created via the API.
   */
  @ApiProperty({
    enum: [...AUTH_ROLES],
    description: 'Account role for the login (self-service roles only).',
  })
  @IsIn([...AUTH_ROLES], {
    message: 'role must be CUSTOMER or DRIVER (admins cannot self-register)',
  })
  role!: 'CUSTOMER' | 'DRIVER';
}
