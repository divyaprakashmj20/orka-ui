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
import { Hotel, Room } from '../../core/models/orca.models';
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
    IonButton,
    IonList,
    IonItem,
    IonLabel
  ],
  templateUrl: './rooms.page.html',
  styleUrl: './rooms.page.scss'
})
export class RoomsPage implements OnInit {
  protected readonly items = signal<Room[]>([]);
  protected readonly hotels = signal<Hotel[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected form: RoomForm = this.emptyForm();

  constructor(private readonly api: OrcaApiService) {}

  ngOnInit(): void {
    this.refreshAll();
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
    if (!roomNumber || this.form.hotelId == null) {
      this.error.set('Room number and hotel are required.');
      return;
    }

    this.saving.set(true);
    this.error.set('');
    const payload: Room = {
      id: this.form.id ?? undefined,
      number: roomNumber,
      floor: this.form.floor,
      hotel: { id: this.form.hotelId }
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
    this.form = this.emptyForm();
  }

  private emptyForm(): RoomForm {
    return { id: null, number: '', floor: null, hotelId: null };
  }
}
