import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton
} from '@ionic/angular/standalone';
import { HotelGroup } from '../../core/models/orca.models';
import { OrcaApiService } from '../../core/services/orca-api.service';
import { NetworkStatusService } from '../../core/services/network-status.service';

type HotelGroupForm = {
  id: number | null;
  name: string;
  code: string;
};

@Component({
  selector: 'app-hotel-groups-page',
  host: { class: 'ion-page' },
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonButton
  ],
  templateUrl: './hotel-groups.page.html',
  styleUrl: './hotel-groups.page.scss'
})
export class HotelGroupsPage implements OnInit {
  private readonly network = inject(NetworkStatusService);
  protected readonly items = signal<HotelGroup[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly modalSaving = signal(false);
  protected readonly editModalOpen = signal(false);
  protected readonly error = signal('');
  protected form: HotelGroupForm = this.emptyForm();
  protected editForm: HotelGroupForm = this.emptyForm();

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
    if (!this.network.isOnline()) {
      this.error.set('Internet is required to create or edit hotel groups.');
      return;
    }
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
    this.editForm = {
      id: item.id ?? null,
      name: item.name ?? '',
      code: item.code ?? ''
    };
    this.editModalOpen.set(true);
  }

  protected closeModal(): void {
    this.editModalOpen.set(false);
    this.editForm = this.emptyForm();
    this.error.set('');
  }

  protected saveEdit(): void {
    if (!this.network.isOnline()) {
      this.error.set('Internet is required to update hotel groups.');
      return;
    }
    const name = this.editForm.name.trim();
    if (!name) { this.error.set('Name is required.'); return; }
    this.modalSaving.set(true);
    this.error.set('');
    const payload: HotelGroup = { id: this.editForm.id ?? undefined, name, code: this.editForm.code.trim() || null };
    this.api.saveHotelGroup(payload).subscribe({
      next: () => { this.modalSaving.set(false); this.closeModal(); this.load(); },
      error: () => { this.error.set('Save failed.'); this.modalSaving.set(false); }
    });
  }

  protected remove(item: HotelGroup): void {
    if (!this.network.isOnline()) {
      this.error.set('Internet is required to delete hotel groups.');
      return;
    }
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
