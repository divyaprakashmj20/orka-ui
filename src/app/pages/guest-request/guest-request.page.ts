import { DOCUMENT } from '@angular/common';
import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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
export class GuestRequestPage implements OnInit {
  private readonly route    = inject(ActivatedRoute);
  private readonly api      = inject(OrcaApiService);
  private readonly document = inject(DOCUMENT);

  protected readonly loading = signal(true);
  protected readonly isDark  = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal(false);
  protected readonly context = signal<GuestRoomContext | null>(null);
  protected readonly requests = signal<ServiceRequest[]>([]);
  protected readonly selectedType = signal<RequestType | null>(null);
  protected message = '';

  protected readonly canSubmit = computed(
    () => !!this.context() && !!this.selectedType() && !this.saving()
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
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.error.set('Missing room access token.');
      this.loading.set(false);
      return;
    }

    try {
      await this.bootstrap(token);
    } catch {
      this.error.set('This room link is invalid or no longer available.');
    } finally {
      this.loading.set(false);
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
      this.success.set(true);
      this.message = '';
    } catch {
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

  private async bootstrap(token: string): Promise<void> {
    const result = await firstValueFrom(
      this.api.bootstrapGuestSession(token, {
        sessionToken: this.readGuestSessionToken(token)
      })
    );

    this.context.set(result.context);
    this.requests.set(result.requests);
    this.storeGuestSessionToken(token, result.sessionToken);

    if (!this.selectedType() && result.context.availableRequestTypes.length) {
      this.selectedType.set(result.context.availableRequestTypes[0] ?? null);
    }
  }

  private guestSessionStorageKey(roomToken: string): string {
    return `orka_guest_session_${roomToken}`;
  }

  private readGuestSessionToken(roomToken: string | null | undefined): string | null {
    if (!roomToken || typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage.getItem(this.guestSessionStorageKey(roomToken));
  }

  private storeGuestSessionToken(roomToken: string, sessionToken: string): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(this.guestSessionStorageKey(roomToken), sessionToken);
  }
}
