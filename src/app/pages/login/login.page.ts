import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  IonButton,
  IonSpinner,
  NavController
} from '@ionic/angular/standalone';
import { FirebaseError } from 'firebase/app';
import { firstValueFrom } from 'rxjs';
import { FirebaseAuthService } from '../../core/auth/firebase-auth.service';
import { OrcaApiService } from '../../core/services/orca-api.service';

@Component({
  selector: 'app-login-page',
  host: { class: 'ion-page' },
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonButton,
    IonSpinner
  ],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss'
})
export class LoginPage {
  private readonly auth   = inject(FirebaseAuthService);
  private readonly api    = inject(OrcaApiService);
  private readonly nav    = inject(NavController);
  private readonly route  = inject(ActivatedRoute);

  protected form = {
    email: '',
    password: ''
  };

  protected readonly loading = signal(false);
  protected readonly error = signal('');

  protected go(path: string): void {
    void this.nav.navigateForward(path);
  }

  constructor() {
    const reason = this.route.snapshot.queryParamMap.get('reason');
    if (reason) {
      this.error.set(this.messageFromGuardReason(reason));
    }
  }

  protected async login(): Promise<void> {
    const email = this.form.email.trim();
    const password = this.form.password;

    if (!email || !password) {
      this.error.set('Email and password are required.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      const credential = await this.auth.signIn(email, password);
      const appUser = await firstValueFrom(this.api.getAppUserByFirebaseUid(credential.user.uid));

      if (appUser.status !== 'ACTIVE') {
        await this.auth.signOutAndWaitForState();
        this.error.set(this.messageForStatus(appUser.status));
        this.loading.set(false);
        return;
      }

      const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo') || '/';
      void this.nav.navigateRoot(redirectTo);
      // Do NOT reset loading here — the page is navigating away. Resetting
      // briefly re-renders the form over the incoming page during transition.
    } catch (error) {
      this.error.set(this.toMessage(error));
      this.loading.set(false);
    }
  }

  private toMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 404) {
        return 'No Orka profile found for this account. Please register first.';
      }
      if (error.status === 400) {
        return 'Invalid login profile request.';
      }
      return 'Login succeeded, but profile validation failed against Orka backend.';
    }

    if (!(error instanceof FirebaseError)) {
      return 'Login failed. Please try again.';
    }

    switch (error.code) {
      case 'auth/invalid-email':
        return 'Invalid email address.';
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Invalid email or password.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Try again later.';
      case 'auth/api-key-not-valid':
        return 'Firebase config is invalid. Update firebase.config.ts.';
      default:
        return `Login failed (${error.code}).`;
    }
  }

  private messageForStatus(status: string | null | undefined): string {
    switch (status) {
      case 'PENDING_APPROVAL':
        return 'Your account is pending admin approval.';
      case 'REJECTED':
        return 'Your account request was rejected. Contact your hotel admin.';
      case 'DISABLED':
        return 'Your account is disabled. Contact support or admin.';
      default:
        return 'Your account is not yet allowed to access Orka.';
    }
  }

  private messageFromGuardReason(reason: string): string {
    switch (reason) {
      case 'PENDING_APPROVAL':
        return 'Your account is pending admin approval.';
      case 'REJECTED':
        return 'Your account request was rejected.';
      case 'DISABLED':
        return 'Your account is disabled.';
      case 'PROFILE_MISSING':
        return 'No Orka profile found for this Firebase account.';
      case 'INSUFFICIENT_ROLE':
        return 'You are signed in, but your role cannot access that page.';
      default:
        return '';
    }
  }
}
