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
import { Hotel, HotelGroup } from '../../core/models/orca.models';
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
    IonButton,
    IonList,
    IonItem,
    IonLabel
  ],
  templateUrl: './hotels.page.html',
  styleUrl: './hotels.page.scss'
})
export class HotelsPage implements OnInit {
  protected readonly items = signal<Hotel[]>([]);
  protected readonly hotelGroups = signal<HotelGroup[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected form: HotelForm = this.emptyForm();

  constructor(private readonly api: OrcaApiService) {}

  ngOnInit(): void {
    this.refreshAll();
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
    if (!name || this.form.hotelGroupId == null) {
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
      hotelGroup: { id: this.form.hotelGroupId }
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
      error: () => this.error.set('Delete failed. Hotel may be referenced by rooms/employees/requests.')
    });
  }

  protected resetForm(): void {
    this.form = this.emptyForm();
  }

  private emptyForm(): HotelForm {
    return {
      id: null,
      name: '',
      code: '',
      city: '',
      country: '',
      hotelGroupId: null
    };
  }
}
