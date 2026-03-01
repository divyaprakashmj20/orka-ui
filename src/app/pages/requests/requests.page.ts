import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar
} from '@ionic/angular/standalone';
import {
  AppUser,
  Hotel,
  REQUEST_STATUSES,
  REQUEST_TYPES,
  RequestStatus,
  RequestType,
  Room,
  ServiceRequest
} from '../../core/models/orca.models';
import { PushEventsService } from '../../core/notifications/push-events.service';
import { OrcaApiService } from '../../core/services/orca-api.service';
import { FirebaseAuthService } from '../../core/auth/firebase-auth.service';
import { firstValueFrom } from 'rxjs';

type RequestForm = {
  id: number | null;
  hotelId: number | null;
  roomId: number | null;
  type: RequestType | null;
  message: string;
  status: RequestStatus | null;
  createdAt: string;
  acceptedAt: string;
  completedAt: string;
  assigneeId: number | null;
  rating: number | null;
  comments: string;
};

@Component({
  selector: 'app-requests-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    IonList,
    IonItem,
    IonLabel
  ],
  templateUrl: './requests.page.html',
  styleUrl: './requests.page.scss'
})
export class RequestsPage implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly pushEvents = inject(PushEventsService);
  private readonly auth = inject(FirebaseAuthService);

  protected readonly items = signal<ServiceRequest[]>([]);
  protected readonly hotels = signal<Hotel[]>([]);
  protected readonly rooms = signal<Room[]>([]);
  protected readonly assignees = signal<AppUser[]>([]);
  protected readonly currentAppUser = signal<AppUser | null>(null);
  protected readonly requestTypes = REQUEST_TYPES;
  protected readonly requestStatuses = REQUEST_STATUSES;
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected form: RequestForm = this.emptyForm();
  protected readonly visibleRooms = computed(() => {
    const hotelId = this.fixedHotelId() ?? this.form.hotelId;
    if (hotelId == null) {
      return this.rooms();
    }
    return this.rooms().filter((room) => room.hotel?.id === hotelId);
  });
  protected readonly visibleAssignees = computed(() => {
    const hotelId = this.fixedHotelId() ?? this.form.hotelId;
    if (hotelId == null) {
      return this.assignees();
    }
    return this.assignees().filter((user) => user.assignedHotel?.id === hotelId);
  });

  constructor(private readonly api: OrcaApiService) {}

  ngOnInit(): void {
    this.pushEvents.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event.kind === 'NEW_REQUEST' || event.kind === 'APP_RESUMED') {
          this.loadRequests();
        }
      });

    void this.loadCurrentAppUserAndRefresh();
  }

  protected refreshAll(): void {
    this.loadRequests();
    this.api.listHotels().subscribe({
      next: (hotels) => this.hotels.set(hotels),
      error: () => this.error.set('Failed to load hotel lookup.')
    });
    this.api.listRooms().subscribe({
      next: (rooms) => this.rooms.set(rooms),
      error: () => this.error.set('Failed to load room lookup.')
    });
    this.api.listAppUsers().subscribe({
      next: (users) =>
        this.assignees.set(
          users.filter(
            (user) =>
              user.active !== false &&
              (user.accessRole === 'HOTEL_ADMIN' ||
                user.accessRole === 'ADMIN' ||
                user.accessRole === 'STAFF')
          )
        ),
      error: () => this.error.set('Failed to load assignee lookup.')
    });
  }

  protected loadRequests(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.listRequests().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load requests.');
        this.loading.set(false);
      }
    });
  }

  protected save(): void {
    const hotelId = this.fixedHotelId() ?? this.form.hotelId;
    if (hotelId == null || this.form.roomId == null || !this.form.type) {
      this.error.set('Hotel, room, and request type are required.');
      return;
    }

    this.saving.set(true);
    this.error.set('');

    const payload: ServiceRequest = {
      id: this.form.id ?? undefined,
      hotel: { id: hotelId },
      room: { id: this.form.roomId },
      type: this.form.type,
      message: this.form.message.trim() || null,
      status: this.form.status ?? null,
      createdAt: this.toApiDateTime(this.form.createdAt),
      acceptedAt: this.toApiDateTime(this.form.acceptedAt),
      completedAt: this.toApiDateTime(this.form.completedAt),
      assignee: this.form.assigneeId == null ? null : { id: this.form.assigneeId },
      rating: this.form.rating,
      comments: this.form.comments.trim() || null
    };

    this.api.saveRequest(payload).subscribe({
      next: () => {
        this.form = this.emptyForm();
        this.saving.set(false);
        this.loadRequests();
      },
      error: () => {
        this.error.set('Save failed. Verify linked hotel/room/assignee IDs exist.');
        this.saving.set(false);
      }
    });
  }

  protected edit(item: ServiceRequest): void {
    this.form = {
      id: item.id ?? null,
      hotelId: item.hotel?.id ?? null,
      roomId: item.room?.id ?? null,
      type: item.type ?? null,
      message: item.message ?? '',
      status: item.status ?? null,
      createdAt: this.toInputDateTime(item.createdAt),
      acceptedAt: this.toInputDateTime(item.acceptedAt),
      completedAt: this.toInputDateTime(item.completedAt),
      assigneeId: item.assignee?.id ?? null,
      rating: item.rating ?? null,
      comments: item.comments ?? ''
    };
  }

  protected remove(item: ServiceRequest): void {
    if (item.id == null) {
      return;
    }
    if (!window.confirm(`Delete request #${item.id}?`)) {
      return;
    }
    this.api.deleteRequest(item.id).subscribe({
      next: () => this.loadRequests(),
      error: () => this.error.set('Delete failed.')
    });
  }

  protected resetForm(): void {
    this.form = this.emptyForm(this.fixedHotelId());
  }

  protected roomLabel(room: Room): string {
    const hotelName = room.hotel?.name ? `${room.hotel.name} - ` : '';
    return `${hotelName}Room ${room.number}`;
  }

  protected assigneeLabel(user: AppUser): string {
    const role = user.employeeRole ?? user.accessRole ?? 'STAFF';
    return `${user.name} (${role.replaceAll('_', ' ')})`;
  }

  protected showHotelSelector(): boolean {
    return this.fixedHotelId() == null;
  }

  protected fixedHotelName(): string {
    return this.currentAppUser()?.assignedHotel?.name ?? 'Assigned hotel';
  }

  private async loadCurrentAppUserAndRefresh(): Promise<void> {
    try {
      const firebaseUser = this.auth.currentUser() ?? (await firstValueFrom(this.auth.authState$));
      if (firebaseUser) {
        this.currentAppUser.set(await firstValueFrom(this.api.getAppUserByFirebaseUid(firebaseUser.uid)));
        this.form = this.emptyForm(this.fixedHotelId());
      }
    } catch {
      this.currentAppUser.set(null);
    } finally {
      this.refreshAll();
    }
  }

  private fixedHotelId(): number | null {
    const role = this.currentAppUser()?.accessRole;
    return role === 'HOTEL_ADMIN' || role === 'STAFF'
      ? (this.currentAppUser()?.assignedHotel?.id ?? null)
      : null;
  }

  private emptyForm(hotelId: number | null = null): RequestForm {
    return {
      id: null,
      hotelId,
      roomId: null,
      type: null,
      message: '',
      status: 'NEW',
      createdAt: '',
      acceptedAt: '',
      completedAt: '',
      assigneeId: null,
      rating: null,
      comments: ''
    };
  }

  private toInputDateTime(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    return value.length >= 16 ? value.slice(0, 16) : value;
  }

  private toApiDateTime(value: string): string | null {
    if (!value) {
      return null;
    }
    return value.length === 16 ? `${value}:00` : value;
  }
}
