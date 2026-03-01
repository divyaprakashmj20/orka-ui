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
import { AppUser, Hotel, HotelGroup } from '../../core/models/orca.models';
import { OrcaApiService } from '../../core/services/orca-api.service';

type HotelForm = {
  id: number | null;
  name: string;
  code: string;
  city: string;
  country: string;
  hotelGroupId: number | null;
};

@Component({
  selector: 'app-hotels-page',
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
  templateUrl: './hotels.page.html',
  styleUrl: './hotels.page.scss'
})
export class HotelsPage implements OnInit {
  private readonly auth = inject(FirebaseAuthService);
  protected readonly items = signal<Hotel[]>([]);
  protected readonly hotelGroups = signal<HotelGroup[]>([]);
  protected readonly currentAppUser = signal<AppUser | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected form: HotelForm = this.emptyForm();

  constructor(private readonly api: OrcaApiService) {}

  ngOnInit(): void {
    void this.loadCurrentAppUserAndRefresh();
  }

  protected refreshAll(): void {
    this.loadHotels();
    this.api.listHotelGroups().subscribe({
      next: (groups) => this.hotelGroups.set(groups),
      error: () => this.error.set('Failed to load hotel groups lookup.')
    });
  }

  protected loadHotels(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.listHotels().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load hotels.');
        this.loading.set(false);
      }
    });
  }

  protected save(): void {
    const name = this.form.name.trim();
    const hotelGroupId = this.fixedHotelGroupId() ?? this.form.hotelGroupId;
    if (!name || hotelGroupId == null) {
      this.error.set('Name and hotel group are required.');
      return;
    }

    this.saving.set(true);
    this.error.set('');

    const payload: Hotel = {
      id: this.form.id ?? undefined,
      name,
      code: this.form.code.trim() || null,
      city: this.form.city.trim() || null,
      country: this.form.country.trim() || null,
      hotelGroup: { id: hotelGroupId }
    };

    this.api.saveHotel(payload).subscribe({
      next: () => {
        this.form = this.emptyForm();
        this.saving.set(false);
        this.loadHotels();
      },
      error: () => {
        this.error.set('Save failed. Make sure the selected hotel group exists.');
        this.saving.set(false);
      }
    });
  }

  protected edit(item: Hotel): void {
    this.form = {
      id: item.id ?? null,
      name: item.name ?? '',
      code: item.code ?? '',
      city: item.city ?? '',
      country: item.country ?? '',
      hotelGroupId: item.hotelGroup?.id ?? null
    };
  }

  protected remove(item: Hotel): void {
    if (item.id == null) {
      return;
    }
    if (!window.confirm(`Delete hotel "${item.name}"?`)) {
      return;
    }
    this.api.deleteHotel(item.id).subscribe({
      next: () => this.loadHotels(),
      error: () => this.error.set('Delete failed. Hotel may be referenced by rooms/users/requests.')
    });
  }

  protected resetForm(): void {
    this.form = this.emptyForm(this.fixedHotelGroupId());
  }

  protected showHotelGroupSelector(): boolean {
    return this.currentAppUser()?.accessRole === 'SUPERADMIN';
  }

  protected fixedHotelGroupName(): string {
    return this.currentAppUser()?.assignedHotelGroup?.name ?? 'Assigned hotel group';
  }

  private async loadCurrentAppUserAndRefresh(): Promise<void> {
    try {
      const firebaseUser = this.auth.currentUser() ?? (await firstValueFrom(this.auth.authState$));
      if (firebaseUser) {
        this.currentAppUser.set(await firstValueFrom(this.api.getAppUserByFirebaseUid(firebaseUser.uid)));
        this.form = this.emptyForm(this.fixedHotelGroupId());
      }
    } catch {
      this.currentAppUser.set(null);
    } finally {
      this.refreshAll();
    }
  }

  private fixedHotelGroupId(): number | null {
    return this.currentAppUser()?.accessRole === 'SUPERADMIN'
      ? null
      : (this.currentAppUser()?.assignedHotelGroup?.id ?? null);
  }

  private emptyForm(hotelGroupId: number | null = null): HotelForm {
    return {
      id: null,
      name: '',
      code: '',
      city: '',
      country: '',
      hotelGroupId
    };
  }
}
