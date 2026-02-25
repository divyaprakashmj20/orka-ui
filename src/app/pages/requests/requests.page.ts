import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
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
  Employee,
  Hotel,
  REQUEST_STATUSES,
  REQUEST_TYPES,
  RequestStatus,
  RequestType,
  Room,
  ServiceRequest
} from '../../core/models/orca.models';
import { OrcaApiService } from '../../core/services/orca-api.service';

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
  protected readonly items = signal<ServiceRequest[]>([]);
  protected readonly hotels = signal<Hotel[]>([]);
  protected readonly rooms = signal<Room[]>([]);
  protected readonly employees = signal<Employee[]>([]);
  protected readonly requestTypes = REQUEST_TYPES;
  protected readonly requestStatuses = REQUEST_STATUSES;
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected form: RequestForm = this.emptyForm();

  constructor(private readonly api: OrcaApiService) {}

  ngOnInit(): void {
    this.refreshAll();
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
    this.api.listEmployees().subscribe({
      next: (employees) => this.employees.set(employees),
      error: () => this.error.set('Failed to load employee lookup.')
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
    if (this.form.hotelId == null || this.form.roomId == null || !this.form.type) {
      this.error.set('Hotel, room, and request type are required.');
      return;
    }

    this.saving.set(true);
    this.error.set('');

    const payload: ServiceRequest = {
      id: this.form.id ?? undefined,
      hotel: { id: this.form.hotelId },
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
    this.form = this.emptyForm();
  }

  protected roomLabel(room: Room): string {
    const hotelName = room.hotel?.name ? `${room.hotel.name} • ` : '';
    return `${hotelName}Room ${room.number}`;
  }

  private emptyForm(): RequestForm {
    return {
      id: null,
      hotelId: null,
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
