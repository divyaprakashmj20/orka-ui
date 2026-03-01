import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
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
  IonTitle,
  IonToolbar
} from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { FirebaseAuthService } from '../../core/auth/firebase-auth.service';
import { AppUser, Hotel, Room } from '../../core/models/orca.models';
import { OrcaApiService } from '../../core/services/orca-api.service';

type RoomForm = {
  id: number | null;
  number: string;
  floor: number | null;
  hotelId: number | null;
};

@Component({
  selector: 'app-rooms-page',
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
    IonButton
  ],
  templateUrl: './rooms.page.html',
  styleUrl: './rooms.page.scss'
})
export class RoomsPage implements OnInit {
  private readonly auth = inject(FirebaseAuthService);
  protected readonly items = signal<Room[]>([]);
  protected readonly hotels = signal<Hotel[]>([]);
  protected readonly currentAppUser = signal<AppUser | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected form: RoomForm = this.emptyForm();

  constructor(private readonly api: OrcaApiService) {}

  ngOnInit(): void {
    void this.loadCurrentAppUserAndRefresh();
  }

  protected refreshAll(): void {
    this.loadRooms();
    this.api.listHotels().subscribe({
      next: (hotels) => this.hotels.set(hotels),
      error: () => this.error.set('Failed to load hotel lookup.')
    });
  }

  protected loadRooms(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.listRooms().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load rooms.');
        this.loading.set(false);
      }
    });
  }

  protected save(): void {
    const roomNumber = this.form.number.trim();
    const hotelId = this.fixedHotelId() ?? this.form.hotelId;
    if (!roomNumber || hotelId == null) {
      this.error.set('Room number and hotel are required.');
      return;
    }

    this.saving.set(true);
    this.error.set('');
    const payload: Room = {
      id: this.form.id ?? undefined,
      number: roomNumber,
      floor: this.form.floor,
      hotel: { id: hotelId }
    };

    this.api.saveRoom(payload).subscribe({
      next: () => {
        this.form = this.emptyForm();
        this.saving.set(false);
        this.loadRooms();
      },
      error: () => {
        this.error.set('Save failed. Room number may need to be unique per hotel.');
        this.saving.set(false);
      }
    });
  }

  protected edit(item: Room): void {
    this.form = {
      id: item.id ?? null,
      number: item.number ?? '',
      floor: item.floor ?? null,
      hotelId: item.hotel?.id ?? null
    };
  }

  protected remove(item: Room): void {
    if (item.id == null) {
      return;
    }
    if (!window.confirm(`Delete room "${item.number}"?`)) {
      return;
    }
    this.api.deleteRoom(item.id).subscribe({
      next: () => this.loadRooms(),
      error: () => this.error.set('Delete failed. Room may be referenced by requests.')
    });
  }

  protected resetForm(): void {
    this.form = this.emptyForm(this.fixedHotelId());
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
    return this.currentAppUser()?.accessRole === 'HOTEL_ADMIN'
      ? (this.currentAppUser()?.assignedHotel?.id ?? null)
      : null;
  }

  private emptyForm(hotelId: number | null = null): RoomForm {
    return { id: null, number: '', floor: null, hotelId };
  }
}
