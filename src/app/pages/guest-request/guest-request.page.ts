import { DOCUMENT } from '@angular/common';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonSpinner,
  IonTextarea
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  bedOutline,
  buildOutline,
  cafeOutline,
  checkmarkCircleOutline,
  helpCircleOutline,
  locationOutline,
  moonOutline,
  sunnyOutline,
  timeOutline
} from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';
import { GuestRoomContext, RequestStatus, RequestType, ServiceRequest } from '../../core/models/orca.models';
import { OrcaApiService } from '../../core/services/orca-api.service';

@Component({
  selector: 'app-guest-request-page',
  host: { class: 'ion-page' },
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonButton,
    IonContent,
    IonIcon,
    IonSpinner,
    IonTextarea
  ],
  templateUrl: './guest-request.page.html',
  styleUrl: './guest-request.page.scss'
})
export class GuestRequestPage implements OnInit, OnDestroy {
  private readonly route    = inject(ActivatedRoute);
  private readonly api      = inject(OrcaApiService);
  private readonly document = inject(DOCUMENT);
  private readonly router   = inject(Router);

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private sessionExpiryTimeout: ReturnType<typeof setTimeout> | null = null;
  private prevStatuses = new Map<number, RequestStatus>();

  protected readonly loading = signal(true);
  protected readonly isDark  = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal(false);
  protected readonly sessionExpired = signal(false);
  protected readonly sessionExpiresAt = signal<string | null>(null);
  protected readonly context = signal<GuestRoomContext | null>(null);
  protected readonly requests = signal<ServiceRequest[]>([]);
  protected readonly selectedType = signal<RequestType | null>(null);
  protected message = '';
  protected textboxFocused = false;

  protected readonly canSubmit = computed(
    () => !!this.context() && !!this.selectedType() && !this.saving() && !this.sessionExpired()
  );

  constructor() {
    addIcons({
      bedOutline, buildOutline, cafeOutline, helpCircleOutline,
      checkmarkCircleOutline, locationOutline, timeOutline,
      moonOutline, sunnyOutline
    });
    const saved = localStorage.getItem('orka-theme');
    const dark = saved !== 'light';
    this.isDark.set(dark);
    // Sync with whatever the shell already set
    this.document.documentElement.getAttribute('data-theme') === 'light'
      ? this.isDark.set(false)
      : this.isDark.set(true);
  }

  protected toggleTheme(): void {
    const next = !this.isDark();
    this.isDark.set(next);
    this.document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    localStorage.setItem('orka-theme', next ? 'dark' : 'light');
  }

  async ngOnInit(): Promise<void> {
    const token = this.resolveRoomToken();
    if (!token) {
      this.error.set('Session expired or missing room access. Please scan the QR code again.');
      this.loading.set(false);
      return;
    }

    try {
      await this.bootstrap(token);
      this.snapshotStatuses();
      this.startPolling(token);
    } catch (error) {
      this.handleBootstrapFailure(token, error);
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    if (this.pollInterval != null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.sessionExpiryTimeout != null) {
      clearTimeout(this.sessionExpiryTimeout);
      this.sessionExpiryTimeout = null;
    }
  }

  protected selectType(type: RequestType): void {
    this.selectedType.set(type);
  }

  protected async submit(): Promise<void> {
    const token = this.context()?.guestAccessToken;
    const sessionToken = this.readGuestSessionToken(token);
    const type = this.selectedType();
    if (!token || !type || !sessionToken) {
      this.error.set('Choose a request type first.');
      return;
    }

    this.saving.set(true);
    this.error.set('');
    try {
      await firstValueFrom(
        this.api.createGuestRequest(token, {
          sessionToken,
          type,
          message: this.message.trim() || null
        })
      );
      await this.bootstrap(token);
      this.snapshotStatuses();
      this.success.set(true);
      this.message = '';
      void this.requestNotificationPermission();
    } catch (error) {
      if (token && this.isExpiredSessionError(error)) {
        this.expireSession(token);
        return;
      }
      this.error.set('Failed to submit the request. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  protected resetSuccess(): void {
    this.success.set(false);
  }

  protected requestStatusLabel(status: RequestStatus | null | undefined): string {
    switch (status) {
      case 'NEW':
        return 'Pending';
      case 'ACCEPTED':
        return 'In progress';
      case 'COMPLETED':
        return 'Completed';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  }

  protected requestStatusTone(status: RequestStatus | null | undefined): 'primary' | 'warning' | 'success' | 'medium' {
    switch (status) {
      case 'NEW':
        return 'warning';
      case 'ACCEPTED':
        return 'primary';
      case 'COMPLETED':
        return 'success';
      default:
        return 'medium';
    }
  }

  protected requestTypeLabel(type: RequestType): string {
    switch (type) {
      case 'HOUSEKEEPING':
        return 'Housekeeping';
      case 'FOOD':
        return 'Food & Beverage';
      case 'MAINTENANCE':
        return 'Maintenance';
      default:
        return 'Other';
    }
  }

  protected requestTypeIcon(type: RequestType): string {
    switch (type) {
      case 'HOUSEKEEPING':
        return 'bed-outline';
      case 'FOOD':
        return 'cafe-outline';
      case 'MAINTENANCE':
        return 'build-outline';
      default:
        return 'help-circle-outline';
    }
  }

  private startPolling(token: string): void {
    if (this.pollInterval != null) {
      return;
    }
    this.pollInterval = setInterval(() => void this.poll(token), 20_000);
  }

  private async poll(token: string): Promise<void> {
    try {
      await this.bootstrap(token);
      this.detectStatusChangesAndNotify();
      this.snapshotStatuses();
    } catch (error) {
      if (this.isExpiredSessionError(error)) {
        this.expireSession(token);
      }
      // Silently ignore poll errors — network may be temporarily unavailable
    }
  }

  private snapshotStatuses(): void {
    this.prevStatuses.clear();
    for (const req of this.requests()) {
      if (req.id != null && req.status) {
        this.prevStatuses.set(req.id, req.status);
      }
    }
  }

  private detectStatusChangesAndNotify(): void {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return;
    }
    for (const req of this.requests()) {
      if (req.id == null || !req.status) {
        continue;
      }
      const prev = this.prevStatuses.get(req.id);
      if (prev && prev !== req.status) {
        if (req.status === 'ACCEPTED') {
          new Notification('Request accepted', {
            body: `Your ${this.requestTypeLabel(req.type!)} request is now in progress.`,
            icon: '/favicon.png'
          });
        } else if (req.status === 'COMPLETED') {
          new Notification('Request completed', {
            body: `Your ${this.requestTypeLabel(req.type!)} request has been completed.`,
            icon: '/favicon.png'
          });
        }
      }
    }
  }

  private async requestNotificationPermission(): Promise<void> {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') {
      return;
    }
    await Notification.requestPermission();
  }

  private async bootstrap(token: string): Promise<void> {
    const storedSession = this.readGuestAccessRecord();
    const result = await firstValueFrom(
      this.api.bootstrapGuestSession(token, {
        sessionToken: storedSession?.sessionToken ?? null
      })
    );

    this.error.set('');
    this.sessionExpired.set(false);
    this.context.set(result.context);
    this.requests.set(result.requests);
    this.sessionExpiresAt.set(result.sessionExpiresAt);
    this.storeGuestAccess(token, result.sessionToken, result.sessionExpiresAt);
    this.scheduleSessionExpiry(token, result.sessionExpiresAt);

    if (!this.selectedType() && result.context.availableRequestTypes.length) {
      this.selectedType.set(result.context.availableRequestTypes[0] ?? null);
    }
  }

  private handleBootstrapFailure(token: string, error: unknown): void {
    if (this.isExpiredSessionError(error)) {
      this.expireSession(token);
      return;
    }

    this.error.set('This room link is invalid or no longer available.');
  }

  private scheduleSessionExpiry(roomToken: string, expiresAt: string | null | undefined): void {
    if (this.sessionExpiryTimeout != null) {
      clearTimeout(this.sessionExpiryTimeout);
      this.sessionExpiryTimeout = null;
    }

    if (!expiresAt) {
      return;
    }

    const expiresAtMs = new Date(expiresAt).getTime();
    if (Number.isNaN(expiresAtMs)) {
      return;
    }

    const delay = expiresAtMs - Date.now();
    if (delay <= 0) {
      this.expireSession(roomToken);
      return;
    }

    this.sessionExpiryTimeout = setTimeout(() => {
      this.expireSession(roomToken);
    }, delay);
  }

  private expireSession(roomToken: string): void {
    this.clearGuestAccess();
    this.sessionExpired.set(true);
    this.sessionExpiresAt.set(null);
    this.context.set(null);
    this.requests.set([]);
    this.selectedType.set(null);
    this.success.set(false);
    this.saving.set(false);
    this.error.set('Your guest session has expired. Please scan the room QR code again to continue.');

    if (this.pollInterval != null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.sessionExpiryTimeout != null) {
      clearTimeout(this.sessionExpiryTimeout);
      this.sessionExpiryTimeout = null;
    }
  }

  private isExpiredSessionError(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 401;
  }

  private resolveRoomToken(): string | null {
    const routeToken = this.route.snapshot.paramMap.get('token');
    if (routeToken) {
      const existingSessionToken = this.readGuestAccessRecord()?.sessionToken ?? null;
      this.storeGuestAccess(routeToken, existingSessionToken, null);
      this.hideRoomTokenFromUrl();
      return routeToken;
    }

    const stored = this.readGuestAccessRecord();
    if (!stored?.roomToken) {
      return null;
    }

    if (stored.sessionExpiresAt) {
      const expiry = new Date(stored.sessionExpiresAt).getTime();
      if (Number.isNaN(expiry) || expiry <= Date.now()) {
        this.clearGuestAccess();
        this.sessionExpired.set(true);
        return null;
      }
    }

    return stored.roomToken;
  }

  private hideRoomTokenFromUrl(): void {
    const history = this.document.defaultView?.history;
    if (!history) {
      return;
    }

    const cleanUrl = this.router.serializeUrl(this.router.createUrlTree(['/guest/request']));
    history.replaceState(history.state, '', cleanUrl);
  }

  private guestAccessStorageKey(): string {
    return 'orka_guest_access';
  }

  private readGuestAccessRecord(): { roomToken: string; sessionToken: string | null; sessionExpiresAt: string | null } | null {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }

    const raw = sessionStorage.getItem(this.guestAccessStorageKey());
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as { roomToken?: unknown; sessionToken?: unknown; sessionExpiresAt?: unknown };
      if (typeof parsed?.roomToken === 'string' && parsed.roomToken.trim()) {
        return {
          roomToken: parsed.roomToken,
          sessionToken: typeof parsed.sessionToken === 'string' && parsed.sessionToken.trim()
            ? parsed.sessionToken
            : null,
          sessionExpiresAt: typeof parsed.sessionExpiresAt === 'string' ? parsed.sessionExpiresAt : null
        };
      }
    } catch {
      // Ignore malformed session data.
    }

    return null;
  }

  private readGuestSessionToken(roomToken: string | null | undefined): string | null {
    const stored = this.readGuestAccessRecord();
    if (!roomToken || !stored || stored.roomToken !== roomToken) {
      return null;
    }
    return stored.sessionToken;
  }

  private storeGuestAccess(roomToken: string, sessionToken: string | null, sessionExpiresAt: string | null): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    sessionStorage.setItem(this.guestAccessStorageKey(), JSON.stringify({
      roomToken,
      sessionToken,
      sessionExpiresAt
    }));
  }

  private clearGuestAccess(): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    sessionStorage.removeItem(this.guestAccessStorageKey());
  }
}
