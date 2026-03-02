import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AppUser,
  AppUserApprovalPayload,
  AppUserRegistrationPayload,
  DeviceTokenRegisterPayload,
  DeviceTokenUnregisterPayload,
  GuestRequestCreatePayload,
  GuestRoomContext,
  GuestSessionBootstrapPayload,
  GuestSessionBootstrapResult,
  Hotel,
  HotelGroup,
  RequestWritePayload,
  Room,
  ServiceRequest
} from '../models/orca.models';

@Injectable({ providedIn: 'root' })
export class OrcaApiService {
  private readonly apiBase = environment.apiBase;

  constructor(private readonly http: HttpClient) {}

  registerAppUserProfile(input: AppUserRegistrationPayload): Observable<AppUser> {
    return this.http.post<AppUser>(`${this.apiBase}/app-users/register`, input);
  }

  getAppUserByFirebaseUid(firebaseUid: string): Observable<AppUser> {
    return this.http.get<AppUser>(`${this.apiBase}/app-users/firebase/${firebaseUid}`);
  }

  approveAppUser(id: number, input: AppUserApprovalPayload): Observable<AppUser> {
    return this.http.put<AppUser>(`${this.apiBase}/app-users/${id}/approve`, input);
  }

  listPendingAppUsers(): Observable<AppUser[]> {
    return this.http.get<AppUser[]>(`${this.apiBase}/app-users/pending`);
  }

  listAppUsers(): Observable<AppUser[]> {
    return this.http.get<AppUser[]>(`${this.apiBase}/app-users`);
  }

  updateAppUser(id: number, input: Partial<AppUser>): Observable<AppUser> {
    return this.http.put<AppUser>(`${this.apiBase}/app-users/${id}`, input);
  }

  registerDeviceToken(input: DeviceTokenRegisterPayload): Observable<void> {
    return this.http.post<void>(`${this.apiBase}/device-tokens/register`, input);
  }

  unregisterDeviceToken(input: DeviceTokenUnregisterPayload): Observable<void> {
    return this.http.post<void>(`${this.apiBase}/device-tokens/unregister`, input);
  }

  listHotelGroups(): Observable<HotelGroup[]> {
    return this.http.get<HotelGroup[]>(`${this.apiBase}/hotel-groups`);
  }

  saveHotelGroup(input: HotelGroup): Observable<HotelGroup> {
    return input.id == null
      ? this.http.post<HotelGroup>(`${this.apiBase}/hotel-groups`, input)
      : this.http.put<HotelGroup>(`${this.apiBase}/hotel-groups/${input.id}`, input);
  }

  deleteHotelGroup(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/hotel-groups/${id}`);
  }

  listHotels(): Observable<Hotel[]> {
    return this.http.get<Hotel[]>(`${this.apiBase}/hotels`);
  }

  saveHotel(input: Hotel): Observable<Hotel> {
    return input.id == null
      ? this.http.post<Hotel>(`${this.apiBase}/hotels`, input)
      : this.http.put<Hotel>(`${this.apiBase}/hotels/${input.id}`, input);
  }

  deleteHotel(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/hotels/${id}`);
  }

  listRooms(): Observable<Room[]> {
    return this.http.get<Room[]>(`${this.apiBase}/rooms`);
  }

  saveRoom(input: Room): Observable<Room> {
    return input.id == null
      ? this.http.post<Room>(`${this.apiBase}/rooms`, input)
      : this.http.put<Room>(`${this.apiBase}/rooms/${input.id}`, input);
  }

  deleteRoom(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/rooms/${id}`);
  }

  getGuestRoomContext(token: string): Observable<GuestRoomContext> {
    return this.http.get<GuestRoomContext>(`${this.apiBase}/requests/guest/${token}`);
  }

  bootstrapGuestSession(
    token: string,
    input: GuestSessionBootstrapPayload
  ): Observable<GuestSessionBootstrapResult> {
    return this.http.post<GuestSessionBootstrapResult>(`${this.apiBase}/requests/guest/${token}/session`, input);
  }

  createGuestRequest(token: string, input: GuestRequestCreatePayload): Observable<ServiceRequest> {
    return this.http.post<ServiceRequest>(`${this.apiBase}/requests/guest/${token}`, input);
  }

  listRequests(): Observable<ServiceRequest[]> {
    return this.http.get<ServiceRequest[]>(`${this.apiBase}/requests`);
  }

  saveRequest(input: RequestWritePayload, id?: number | null): Observable<ServiceRequest> {
    return id == null
      ? this.http.post<ServiceRequest>(`${this.apiBase}/requests`, input)
      : this.http.put<ServiceRequest>(`${this.apiBase}/requests/${id}`, input);
  }

  deleteRequest(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/requests/${id}`);
  }
}
