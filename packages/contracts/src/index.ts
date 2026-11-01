export type UserRole = 'CUSTOMER' | 'DRIVER' | 'ADMIN';
export type RideStatus =
  | 'REQUESTED'
  | 'SEARCHING'
  | 'ASSIGNED'
  | 'ARRIVING'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export interface HealthResponse {
  status: 'ok';
  service: string;
}
