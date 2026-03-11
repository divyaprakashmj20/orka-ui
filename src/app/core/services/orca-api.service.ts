import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
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
  ProfileUpdatePayload,
  ReportOverview,
  RequestWritePayload,
  Room,
  ServiceRequest
} from '../models/orca.models';
import { FirebaseAuthService } from '../auth/firebase-auth.service';
import { OfflineStoreService } from './offline-store.service';

@Injectable({ providedIn: 'root' })
export class OrcaApiService {
  private readonly apiBase = environment.apiBase;
  private readonly auth = inject(FirebaseAuthService);
  private readonly offlineStore = inject(OfflineStoreService);

  constructor(private readonly http: HttpClient) {}

  registerAppUserProfile(input: AppUserRegistrationPayload): Observable<AppUser> {
    return this.http.post<AppUser>(`${this.apiBase}/app-users/register`, input);
  }

  getAppUserByFirebaseUid(firebaseUid: string): Observable<AppUser> {
    return this.cachedRequest(
      `app-user:${firebaseUid}`,
      this.http.get<AppUser>(`${this.apiBase}/app-users/firebase/${firebaseUid}`),
      false
    );
  }

  approveAppUser(id: number, input: AppUserApprovalPayload): Observable<AppUser> {
    return this.http.put<AppUser>(`${this.apiBase}/app-users/${id}/approve`, input);
  }

  listPendingAppUsers(): Observable<AppUser[]> {
    return this.cachedRequest('app-users:pending', this.http.get<AppUser[]>(`${this.apiBase}/app-users/pending`));
  }

  listAppUsers(): Observable<AppUser[]> {
    return this.cachedRequest('app-users:list', this.http.get<AppUser[]>(`${this.apiBase}/app-users`));
  }

  updateAppUser(id: number, input: Partial<AppUser>): Observable<AppUser> {
    return this.http.put<AppUser>(`${this.apiBase}/app-users/${id}`, input);
  }

  restoreAppUser(id: number): Observable<AppUser> {
    return this.http.put<AppUser>(`${this.apiBase}/app-users/${id}/restore`, {});
  }

  registerDeviceToken(input: DeviceTokenRegisterPayload): Observable<void> {
    return this.http.post<void>(`${this.apiBase}/device-tokens/register`, input);
  }

  unregisterDeviceToken(input: DeviceTokenUnregisterPayload): Observable<void> {
    return this.http.post<void>(`${this.apiBase}/device-tokens/unregister`, input);
  }

  listHotelGroups(): Observable<HotelGroup[]> {
    return this.cachedRequest('hotel-groups:list', this.http.get<HotelGroup[]>(`${this.apiBase}/hotel-groups`));
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
    return this.cachedRequest('hotels:list', this.http.get<Hotel[]>(`${this.apiBase}/hotels`));
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
    return this.cachedRequest('rooms:list', this.http.get<Room[]>(`${this.apiBase}/rooms`));
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
    return this.cachedRequest(
      `guest-context:${token}`,
      this.http.get<GuestRoomContext>(`${this.apiBase}/requests/guest/${token}`),
      false
    );
  }

  bootstrapGuestSession(
    token: string,
    input: GuestSessionBootstrapPayload
  ): Observable<GuestSessionBootstrapResult> {
    return this.http
      .post<GuestSessionBootstrapResult>(`${this.apiBase}/requests/guest/${token}/session`, input)
      .pipe(
        tap((result) => this.offlineStore.replaceGuestSessionSnapshot(token, result)),
        catchError((error) => {
          const cached = this.offlineStore.getCache<GuestSessionBootstrapResult>(`guest-session:${token}`);
          return cached ? of(cached) : throwError(() => error);
        })
      );
  }

  createGuestRequest(token: string, input: GuestRequestCreatePayload): Observable<ServiceRequest> {
    return this.http.post<ServiceRequest>(`${this.apiBase}/requests/guest/${token}`, input);
  }

  listRequests(): Observable<ServiceRequest[]> {
    return this.cachedRequest('requests:list', this.http.get<ServiceRequest[]>(`${this.apiBase}/requests`));
  }

  getRequestById(id: number): Observable<ServiceRequest> {
    return this.http.get<ServiceRequest>(`${this.apiBase}/requests/${id}`);
  }

  saveRequest(input: RequestWritePayload, id?: number | null): Observable<ServiceRequest> {
    return id == null
      ? this.http.post<ServiceRequest>(`${this.apiBase}/requests`, input)
      : this.http.put<ServiceRequest>(`${this.apiBase}/requests/${id}`, input);
  }

  deleteRequest(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/requests/${id}`);
  }

  getMyProfile(): Observable<AppUser> {
    return this.cachedRequest('profile:me', this.http.get<AppUser>(`${this.apiBase}/app-users/me`));
  }

  updateMyProfile(input: ProfileUpdatePayload): Observable<AppUser> {
    return this.http.put<AppUser>(`${this.apiBase}/app-users/me/profile`, input);
  }

  listAllAppUsers(): Observable<AppUser[]> {
    return this.cachedRequest('app-users:list', this.http.get<AppUser[]>(`${this.apiBase}/app-users`));
  }

  getReportOverview(): Observable<ReportOverview> {
    return this.http.get<ReportOverview>(`${this.apiBase}/reports/overview`);
  }

  primeRequestsCache(items: ServiceRequest[]): void {
    this.offlineStore.setCache(this.scopedKey('requests:list'), items);
  }

  replaceCachedRequest(item: ServiceRequest): ServiceRequest[] {
    const key = this.scopedKey('requests:list');
    const current = this.offlineStore.getCache<ServiceRequest[]>(key) ?? [];
    const index = current.findIndex((existing) => existing.id === item.id);
    const next = index >= 0
      ? current.map((existing, idx) => (idx === index ? item : existing))
      : [item, ...current];
    this.offlineStore.setCache(key, next);
    return next;
  }

  primeGuestSessionCache(token: string, snapshot: GuestSessionBootstrapResult): void {
    this.offlineStore.replaceGuestSessionSnapshot(token, snapshot);
  }

  primeMyProfileCache(user: AppUser): void {
    this.offlineStore.setCache(this.scopedKey('profile:me'), user);
  }

  private cachedRequest<T>(cacheKey: string, request$: Observable<T>, scoped = true): Observable<T> {
    const resolvedKey = scoped ? this.scopedKey(cacheKey) : cacheKey;
    return request$.pipe(
      tap((result) => this.offlineStore.setCache(resolvedKey, result)),
      catchError((error) => {
        const cached = this.offlineStore.getCache<T>(resolvedKey);
        return cached != null ? of(cached) : throwError(() => error);
      })
    );
  }

  private scopedKey(base: string): string {
    const uid = this.auth.currentUser()?.uid ?? 'guest';
    return `${uid}:${base}`;
  }
}
