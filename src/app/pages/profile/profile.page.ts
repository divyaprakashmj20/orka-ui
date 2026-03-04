import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonInput, IonToggle } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { FirebaseAuthService } from '../../core/auth/firebase-auth.service';
import { AppUser } from '../../core/models/orca.models';
import { OrcaApiService } from '../../core/services/orca-api.service';
import { ShellComponent } from '../../core/shell/shell.component';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  host: { class: 'ion-page' },
  imports: [CommonModule, FormsModule, ShellComponent, IonInput, IonButton, IonToggle],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss'
})
export class ProfilePage implements OnInit {
  private readonly api  = inject(OrcaApiService);
  private readonly auth = inject(FirebaseAuthService);

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
    try {
      const updated = await firstValueFrom(
        this.api.updateMyProfile({
          name:       this.form.name.trim() || undefined,
          phone:      this.form.phone.trim() || null,
          fcmEnabled: this.form.fcmEnabled
        })
      );
      this.user.set(updated);
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
