import { PhoneRoleDto } from './phone-role.dto';

/** Body of POST /auth/otp/request — phone + self-service role. */
export class RequestOtpDto extends PhoneRoleDto {}
