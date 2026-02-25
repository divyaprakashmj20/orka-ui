import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
import { FirebaseAuthService } from '../../core/auth/firebase-auth.service';

@Component({
  selector: 'app-forgot-password-page',
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
  templateUrl: './forgot-password.page.html',
  styleUrl: './forgot-password.page.scss'
})
export class ForgotPasswordPage {
  private readonly auth = inject(FirebaseAuthService);

  protected form = { email: '' };
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');

  protected async sendReset(): Promise<void> {
    const email = this.form.email.trim();
    if (!email) {
      this.error.set('Email is required.');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.success.set('');
    try {
      await this.auth.sendPasswordReset(email);
      this.success.set('Password reset email sent. Check your inbox.');
    } catch (error) {
      this.error.set(this.toMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private toMessage(error: unknown): string {
    if (!(error instanceof FirebaseError)) {
      return 'Could not send reset email.';
    }
    switch (error.code) {
      case 'auth/invalid-email':
        return 'Invalid email address.';
      case 'auth/user-not-found':
        return 'No account found for this email.';
      case 'auth/api-key-not-valid':
        return 'Firebase config is invalid. Update firebase.config.ts.';
      default:
        return `Reset failed (${error.code}).`;
    }
  }
}
