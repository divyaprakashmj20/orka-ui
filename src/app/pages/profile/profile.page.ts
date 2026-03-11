import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonToggle } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { AppUser } from '../../core/models/orca.models';
import { OrcaApiService } from '../../core/services/orca-api.service';
import { NetworkStatusService } from '../../core/services/network-status.service';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { ShellComponent } from '../../core/shell/shell.component';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  host: { class: 'ion-page' },
  imports: [CommonModule, FormsModule, ShellComponent, IonButton, IonToggle],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss'
})
export class ProfilePage implements OnInit {
  private readonly api  = inject(OrcaApiService);
  private readonly network = inject(NetworkStatusService);
  private readonly offlineSync = inject(OfflineSyncService);

  protected readonly loading = signal(true);
  protected readonly saving  = signal(false);
  protected readonly success = signal(false);
  protected readonly error   = signal('');
  protected readonly user    = signal<AppUser | null>(null);

  protected form = { name: '', phone: '', fcmEnabled: true };

  ngOnInit(): void {
    this.api.getMyProfile().subscribe({
      next: (u) => {
        this.user.set(u);
        this.form.name       = u.name ?? '';
        this.form.phone      = u.phone ?? '';
        this.form.fcmEnabled = u.fcmEnabled !== false;
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load your profile.');
        this.loading.set(false);
      }
    });
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    this.success.set(false);
    const payload = {
      name:       this.form.name.trim() || undefined,
      phone:      this.form.phone.trim() || null,
      fcmEnabled: this.form.fcmEnabled
    };
    try {
      if (!this.network.isOnline()) {
        await this.offlineSync.enqueueProfileUpdate(payload);
        const current = this.user();
        if (current) {
          const optimistic = { ...current, ...payload, name: payload.name ?? current.name };
          this.user.set(optimistic);
          this.api.primeMyProfileCache(optimistic);
        }
        this.success.set(true);
        return;
      }

      const updated = await firstValueFrom(
        this.api.updateMyProfile(payload)
      );
      this.user.set(updated);
      this.api.primeMyProfileCache(updated);
      this.success.set(true);
    } catch {
      this.error.set('Failed to save changes. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  protected roleLabel(role: string | null | undefined): string {
    return (role ?? 'STAFF').replace(/_/g, ' ');
  }

  protected scopeLabel(u: AppUser): string {
    return u.assignedHotel?.name ?? u.assignedHotelGroup?.name ?? 'Platform';
  }
}
