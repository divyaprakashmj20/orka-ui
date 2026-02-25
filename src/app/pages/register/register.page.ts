import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonNote,
  IonTitle,
  IonToolbar
} from '@ionic/angular/standalone';
import { FirebaseError } from 'firebase/app';
import { firstValueFrom } from 'rxjs';
import { FirebaseAuthService } from '../../core/auth/firebase-auth.service';
import { OrcaApiService } from '../../core/services/orca-api.service';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonItem,
    IonLabel,
    IonInput,
    IonButton,
    IonNote
  ],
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss'
})
export class RegisterPage {
  private readonly auth = inject(FirebaseAuthService);
  private readonly api = inject(OrcaApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected form = {
    name: '',
    phone: '',
    hotelGroupCode: '',
    hotelCode: '',
    email: '',
    password: '',
    confirmPassword: ''
  };

  protected readonly loading = signal(false);
  protected readonly error = signal('');

  protected async register(): Promise<void> {
    const name = this.form.name.trim();
    const phone = this.form.phone.trim();
    const hotelGroupCode = this.form.hotelGroupCode.trim();
    const hotelCode = this.form.hotelCode.trim();
    const email = this.form.email.trim();
    const password = this.form.password;
    const confirmPassword = this.form.confirmPassword;

    if (!name || !email || !password || !confirmPassword) {
      this.error.set('Name, email, password, and confirm password are required.');
      return;
    }
    if ((!hotelGroupCode && !hotelCode) || (hotelGroupCode && hotelCode)) {
      this.error.set('Use either a Hotel Group Code or a Hotel Code (not both).');
      return;
    }
    if (password !== confirmPassword) {
      this.error.set('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      this.error.set('Password must be at least 6 characters.');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    try {
      const credential = await this.auth.register(email, password);
      await firstValueFrom(
        this.api.registerAppUserProfile({
          firebaseUid: credential.user.uid,
          email: credential.user.email ?? email,
          name,
          phone: phone || null,
          hotelGroupCode: hotelGroupCode || null,
          hotelCode: hotelCode || null
        })
      );
      const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo') || '/';
      await this.router.navigateByUrl(redirectTo);
    } catch (error) {
      // If Firebase auth succeeds but backend profile creation fails, delete the Firebase user
      // so we do not leave behind an orphaned auth account.
      if (this.auth.currentUser()) {
        try {
          await this.auth.deleteCurrentUserAndWaitForState();
        } catch {
          // ignore secondary cleanup failures
        }
      }
      this.error.set(this.toMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private toMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 400) {
        return 'Invalid hotel code / hotel group code or profile setup request.';
      }
      return 'Account created in Firebase, but profile setup failed in Orka backend.';
    }

    if (!(error instanceof FirebaseError)) {
      return 'Registration failed. Please try again.';
    }
    switch (error.code) {
      case 'auth/email-already-in-use':
        return 'An account already exists for this email.';
      case 'auth/invalid-email':
        return 'Invalid email address.';
      case 'auth/weak-password':
        return 'Password is too weak.';
      case 'auth/api-key-not-valid':
        return 'Firebase config is invalid. Update firebase.config.ts.';
      case 'auth/network-request-failed':
        return 'Network error while creating account.';
      default:
        return `Registration failed (${error.code}).`;
    }
  }
}
