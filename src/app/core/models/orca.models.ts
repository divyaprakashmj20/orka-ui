export type EmployeeRole = 'HOUSEKEEPING' | 'ROOM_SERVICE' | 'MAINTENANCE' | 'FRONT_DESK';
export type AccessRole =
  | 'SUPERADMIN'
  | 'HOTEL_GROUP_ADMIN'
  | 'HOTEL_ADMIN'
  | 'ADMIN'
  | 'STAFF';
export type RequestType = 'HOUSEKEEPING' | 'FOOD' | 'MAINTENANCE' | 'OTHER';
export type RequestStatus = 'NEW' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED';
export type AppUserStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'DISABLED';

export const EMPLOYEE_ROLES: EmployeeRole[] = [
  'HOUSEKEEPING',
  'ROOM_SERVICE',
  'MAINTENANCE',
  'FRONT_DESK'
];

export const ACCESS_ROLES: AccessRole[] = [
  'SUPERADMIN',
  'HOTEL_GROUP_ADMIN',
  'HOTEL_ADMIN',
  'ADMIN',
  'STAFF'
];
export const REQUEST_TYPES: RequestType[] = ['HOUSEKEEPING', 'FOOD', 'MAINTENANCE', 'OTHER'];
export const REQUEST_STATUSES: RequestStatus[] = ['NEW', 'ACCEPTED', 'COMPLETED', 'CANCELLED'];

export interface HotelGroup {
  id?: number;
  name: string;
  code?: string | null;
}

export interface Hotel {
  id?: number;
  name: string;
  code?: string | null;
  city?: string | null;
  country?: string | null;
  hotelGroup?: HotelGroupRef | null;
}

export interface Room {
  id?: number;
  number: string;
  floor?: number | null;
  hotel?: HotelRef | null;
}

export interface Employee {
  id?: number;
  name: string;
  role?: EmployeeRole | null;
  accessRole?: AccessRole | null;
  phone?: string | null;
  active?: boolean;
  hotel?: HotelRef | null;
}

export interface ServiceRequest {
  id?: number;
  hotel?: HotelRef | null;
  room?: RoomRef | null;
  type?: RequestType | null;
  message?: string | null;
  status?: RequestStatus | null;
  createdAt?: string | null;
  acceptedAt?: string | null;
  completedAt?: string | null;
  assignee?: EmployeeRef | null;
  rating?: number | null;
  comments?: string | null;
}

export interface AppUser {
  id?: number;
  firebaseUid: string;
  email: string;
  name: string;
  phone?: string | null;
  status?: AppUserStatus | null;
  accessRole?: AccessRole | null;
  requestedHotel?: HotelRef | null;
  requestedHotelGroup?: HotelGroupRef | null;
  assignedHotelGroup?: HotelGroupRef | null;
  assignedHotel?: HotelRef | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AppUserRegistrationPayload {
  firebaseUid: string;
  email: string;
  name: string;
  phone?: string | null;
  hotelGroupCode?: string | null;
  hotelCode?: string | null;
}

export interface AppUserApprovalPayload {
  accessRole: AccessRole;
  assignedHotelGroupId?: number | null;
  assignedHotelId?: number | null;
}

export interface HotelGroupRef {
  id?: number;
  name?: string;
  code?: string | null;
}

export interface HotelRef {
  id?: number;
  name?: string;
  code?: string | null;
  city?: string | null;
  country?: string | null;
  hotelGroup?: HotelGroupRef | null;
}

export interface RoomRef {
  id?: number;
  number?: string;
  floor?: number | null;
  hotel?: HotelRef | null;
}

export interface EmployeeRef {
  id?: number;
  name?: string;
  role?: EmployeeRole | null;
  accessRole?: AccessRole | null;
  active?: boolean;
  hotel?: HotelRef | null;
}
