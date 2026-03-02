import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
  IonInput,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar
} from '@ionic/angular/standalone';
import QRCode from 'qrcode';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
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
    IonItem,
    IonLabel,
    IonInput,
    IonSelect,
    IonSelectOption,
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
  protected readonly modalSaving = signal(false);
  protected readonly error = signal('');
  protected readonly selectedRoom = signal<Room | null>(null);
  protected readonly roomModalOpen = signal(false);
  protected readonly editModalOpen = signal(false);
  protected readonly roomModalMode = signal<'details' | 'edit'>('details');
  protected readonly qrCodeDataUrl = signal('');
  protected readonly qrLoading = signal(false);
  protected readonly groupedRooms = computed(() => {
    const hotelMap = new Map<
      string,
      {
        key: string;
        hotelId: number | null;
        hotelName: string;
        floors: Array<{ floor: number | null; rooms: Room[] }>;
      }
    >();

    for (const room of this.items()) {
      const hotelId = room.hotel?.id ?? null;
      const hotelName = room.hotel?.name || 'Unassigned hotel';
      const hotelKey = hotelId != null ? `hotel-${hotelId}` : `hotel-${hotelName}`;
      const existingHotel =
        hotelMap.get(hotelKey) ??
        {
          key: hotelKey,
          hotelId,
          hotelName,
          floors: []
        };

      let floorBucket = existingHotel.floors.find((entry) => entry.floor === (room.floor ?? null));
      if (!floorBucket) {
        floorBucket = { floor: room.floor ?? null, rooms: [] };
        existingHotel.floors.push(floorBucket);
      }
      floorBucket.rooms.push(room);
      hotelMap.set(hotelKey, existingHotel);
    }

    return Array.from(hotelMap.values())
      .map((hotel) => ({
        ...hotel,
        floors: hotel.floors
          .map((floor) => ({
            floor: floor.floor,
            rooms: [...floor.rooms].sort((a, b) => (a.number || '').localeCompare(b.number || '', undefined, { numeric: true }))
          }))
          .sort((a, b) => {
            const aFloor = a.floor ?? Number.MAX_SAFE_INTEGER;
            const bFloor = b.floor ?? Number.MAX_SAFE_INTEGER;
            return aFloor - bFloor;
          })
      }))
      .sort((a, b) => a.hotelName.localeCompare(b.hotelName));
  });
  protected form: RoomForm = this.emptyForm();
  protected editForm: RoomForm = this.emptyForm();

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
        const currentSelectedId = this.selectedRoom()?.id;
        if (currentSelectedId != null) {
          const selected = items.find((item) => item.id === currentSelectedId) ?? null;
          this.selectedRoom.set(selected);
          if (selected && this.roomModalMode() === 'edit') {
            this.editForm = {
              id: selected.id ?? null,
              number: selected.number ?? '',
              floor: selected.floor ?? null,
              hotelId: selected.hotel?.id ?? null
            };
          }
        }
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
        this.form = this.emptyForm(this.fixedHotelId());
        this.saving.set(false);
        this.loadRooms();
      },
      error: () => {
        this.error.set('Save failed. Room number may need to be unique per hotel.');
        this.saving.set(false);
      }
    });
  }

  protected openEdit(item: Room): void {
    this.selectedRoom.set(item);
    this.editForm = {
      id: item.id ?? null,
      number: item.number ?? '',
      floor: item.floor ?? null,
      hotelId: item.hotel?.id ?? null
    };
    this.roomModalMode.set('edit');
    this.roomModalOpen.set(true);
    this.editModalOpen.set(true);
    void this.prepareQrCode(item);
  }

  protected closeEdit(): void {
    this.editModalOpen.set(false);
    this.roomModalMode.set('details');
    this.editForm = this.emptyForm(this.fixedHotelId());
  }

  protected saveEdit(): void {
    const roomId = this.editForm.id;
    const roomNumber = this.editForm.number.trim();
    const hotelId = this.fixedHotelId() ?? this.editForm.hotelId;
    if (roomId == null || !roomNumber || hotelId == null) {
      this.error.set('Room number and hotel are required.');
      return;
    }

    this.modalSaving.set(true);
    this.error.set('');
    const payload: Room = {
      id: roomId,
      number: roomNumber,
      floor: this.editForm.floor,
      hotel: { id: hotelId }
    };

    this.api.saveRoom(payload).subscribe({
      next: (saved) => {
        this.modalSaving.set(false);
        this.editModalOpen.set(false);
        this.roomModalMode.set('details');
        this.editForm = this.emptyForm(this.fixedHotelId());
        this.loadRooms();
        this.selectedRoom.set(saved);
      },
      error: () => {
        this.error.set('Update failed. Room number may need to be unique per hotel.');
        this.modalSaving.set(false);
      }
    });
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

  protected selectRoom(item: Room): void {
    this.selectedRoom.set(item);
    this.roomModalMode.set('details');
    this.roomModalOpen.set(true);
    void this.prepareQrCode(item);
  }

  protected closeRoomModal(): void {
    this.roomModalOpen.set(false);
    this.editModalOpen.set(false);
    this.roomModalMode.set('details');
    this.editForm = this.emptyForm(this.fixedHotelId());
    this.qrCodeDataUrl.set('');
    this.qrLoading.set(false);
  }

  protected startEditFromSelected(): void {
    const room = this.selectedRoom();
    if (!room) {
      return;
    }
    this.openEdit(room);
  }

  protected showHotelSelector(): boolean {
    return this.fixedHotelId() == null;
  }

  protected fixedHotelName(): string {
    return this.currentAppUser()?.assignedHotel?.name ?? 'Assigned hotel';
  }

  protected guestUrl(room: Room): string {
    const token = room.guestAccessToken;
    if (!token) {
      return '';
    }
    return `${environment.guestBaseUrl.replace(/\/$/, '')}/guest/request/${token}`;
  }

  protected async copyGuestUrl(room: Room): Promise<void> {
    const url = this.guestUrl(room);
    if (!url) {
      this.error.set('Guest link is not available for this room yet.');
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      this.error.set('');
    } catch {
      this.error.set('Failed to copy guest link.');
    }
  }

  protected async downloadGuestQr(room: Room): Promise<void> {
    if (!this.qrCodeDataUrl()) {
      await this.prepareQrCode(room);
    }

    const dataUrl = this.qrCodeDataUrl();
    if (!dataUrl) {
      this.error.set('Failed to generate QR code.');
      return;
    }

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `orka-room-${room.number}-qr.png`;
    link.click();
  }

  protected selectedGuestUrl(): string {
    return this.selectedRoom() ? this.guestUrl(this.selectedRoom()!) : '';
  }

  protected floorLabel(floor: number | null): string {
    return floor == null ? 'Unspecified floor' : `Floor ${floor}`;
  }

  private async prepareQrCode(room: Room): Promise<void> {
    const url = this.guestUrl(room);
    if (!url) {
      this.qrCodeDataUrl.set('');
      return;
    }

    this.qrLoading.set(true);
    try {
      this.qrCodeDataUrl.set(
        await QRCode.toDataURL(url, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 320,
          color: {
            dark: '#0f172a',
            light: '#ffffffff'
          }
        })
      );
      this.error.set('');
    } catch {
      this.qrCodeDataUrl.set('');
      this.error.set('Failed to generate QR code.');
    } finally {
      this.qrLoading.set(false);
    }
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
