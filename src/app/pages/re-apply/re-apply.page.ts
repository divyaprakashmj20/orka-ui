import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonSpinner,
  NavController
} from '@ionic/angular/standalone';
import { firstValueFrom, take } from 'rxjs';
import { FirebaseAuthService } from '../../core/auth/firebase-auth.service';
import { OrcaApiService } from '../../core/services/orca-api.service';

@Component({
  selector: 'app-re-apply-page',
  standalone: true,
  host: { class: 'ion-page' },
  imports: [CommonModule, FormsModule, IonButton, IonSpinner],
  templateUrl: './re-apply.page.html',
  styleUrl: './re-apply.page.scss'
})
export class ReApplyPage implements OnInit {
  private readonly auth = inject(FirebaseAuthService);
  private readonly api  = inject(OrcaApiService);
  private readonly nav  = inject(NavController);

  protected readonly loading  = signal(true);
  protected readonly saving   = signal(false);
  protected readonly success  = signal(false);
  protected readonly error    = signal('');

  protected form = {
    name: '',
    phone: '',
    hotelGroupCode: '',
    hotelCode: ''
  };

  protected email = '';

  async ngOnInit(): Promise<void> {
    const fb = this.auth.currentUser()
      ?? await firstValueFrom(this.auth.authState$.pipe(take(1)));

    if (!fb) {
      // Not signed in at all — redirect to login
      void this.nav.navigateRoot('/login');
      return;
    }

    this.email = fb.email ?? '';
    // Pre-fill name from Firebase display name if available
    this.form.name = fb.displayName ?? '';
    this.loading.set(false);
  }

  protected async submit(): Promise<void> {
    const name            = this.form.name.trim();
    const phone           = this.form.phone.trim();
    const hotelGroupCode  = this.form.hotelGroupCode.trim();
    const hotelCode       = this.form.hotelCode.trim();

    if (!name) {
      this.error.set('Name is required.');
      return;
    }
    if ((!hotelGroupCode && !hotelCode) || (hotelGroupCode && hotelCode)) {
      this.error.set('Provide either a Hotel Group Code or a Hotel Code, not both.');
      return;
    }

    const fb = this.auth.currentUser();
    if (!fb) {
      this.error.set('Session expired. Please sign in again.');
      return;
    }

    this.saving.set(true);
    this.error.set('');

    try {
      await firstValueFrom(
        this.api.registerAppUserProfile({
          firebaseUid:    fb.uid,
          email:          fb.email ?? this.email,
          name,
          phone:          phone || null,
          hotelGroupCode: hotelGroupCode || null,
          hotelCode:      hotelCode || null
        })
      );
      this.success.set(true);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 400) {
        this.error.set('Invalid hotel or hotel group code. Please double-check and try again.');
      } else {
        this.error.set('Failed to re-submit application. Please try again.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOutAndWaitForState();
    void this.nav.navigateRoot('/login');
  }
}
