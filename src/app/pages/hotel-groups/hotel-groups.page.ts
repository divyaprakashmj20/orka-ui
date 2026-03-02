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
  IonInput,
  IonItem,
  IonLabel,
  IonTitle,
  IonToolbar
} from '@ionic/angular/standalone';
import { HotelGroup } from '../../core/models/orca.models';
import { OrcaApiService } from '../../core/services/orca-api.service';

type HotelGroupForm = {
  id: number | null;
  name: string;
  code: string;
};

@Component({
  selector: 'app-hotel-groups-page',
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
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton
  ],
  templateUrl: './hotel-groups.page.html',
  styleUrl: './hotel-groups.page.scss'
})
export class HotelGroupsPage implements OnInit {
  protected readonly items = signal<HotelGroup[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected form: HotelGroupForm = this.emptyForm();

  constructor(private readonly api: OrcaApiService) {}

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.listHotelGroups().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load hotel groups. Check backend and CORS config.');
        this.loading.set(false);
      }
    });
  }

  protected save(): void {
    const name = this.form.name.trim();
    if (!name) {
      this.error.set('Name is required.');
      return;
    }

    this.saving.set(true);
    this.error.set('');
    const payload: HotelGroup = {
      id: this.form.id ?? undefined,
      name,
      code: this.form.code.trim() || null
    };

    this.api.saveHotelGroup(payload).subscribe({
      next: () => {
        this.form = this.emptyForm();
        this.saving.set(false);
        this.load();
      },
      error: () => {
        this.error.set('Save failed.');
        this.saving.set(false);
      }
    });
  }

  protected edit(item: HotelGroup): void {
    this.form = {
      id: item.id ?? null,
      name: item.name ?? '',
      code: item.code ?? ''
    };
  }

  protected remove(item: HotelGroup): void {
    if (item.id == null) {
      return;
    }
    if (!window.confirm(`Delete hotel group "${item.name}"?`)) {
      return;
    }

    this.api.deleteHotelGroup(item.id).subscribe({
      next: () => this.load(),
      error: () => {
        this.error.set('Delete failed. It may be referenced by hotels.');
      }
    });
  }

  protected resetForm(): void {
    this.form = this.emptyForm();
  }

  private emptyForm(): HotelGroupForm {
    return { id: null, name: '', code: '' };
  }
}
