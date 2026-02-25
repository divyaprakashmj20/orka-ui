import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AppUser,
  AppUserApprovalPayload,
  AppUserRegistrationPayload,
  Employee,
  Hotel,
  HotelGroup,
  Room,
  ServiceRequest
} from '../models/orca.models';

@Injectable({ providedIn: 'root' })
export class OrcaApiService {
  private readonly apiBase = '/api';

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

  listEmployees(): Observable<Employee[]> {
    return this.http.get<Employee[]>(`${this.apiBase}/employees`);
  }

  saveEmployee(input: Employee): Observable<Employee> {
    return input.id == null
      ? this.http.post<Employee>(`${this.apiBase}/employees`, input)
      : this.http.put<Employee>(`${this.apiBase}/employees/${input.id}`, input);
  }

  deleteEmployee(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/employees/${id}`);
  }

  listRequests(): Observable<ServiceRequest[]> {
    return this.http.get<ServiceRequest[]>(`${this.apiBase}/requests`);
  }

  saveRequest(input: ServiceRequest): Observable<ServiceRequest> {
    return input.id == null
      ? this.http.post<ServiceRequest>(`${this.apiBase}/requests`, input)
      : this.http.put<ServiceRequest>(`${this.apiBase}/requests/${input.id}`, input);
  }

  deleteRequest(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/requests/${id}`);
  }
}
