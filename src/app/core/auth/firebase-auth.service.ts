import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Auth,
  User,
  authState,
  createUserWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut
} from '@angular/fire/auth';
import { filter, firstValueFrom, shareReplay, take } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class FirebaseAuthService {
  private readonly auth = inject(Auth);

  readonly authState$ = authState(this.auth).pipe(shareReplay({ bufferSize: 1, refCount: true }));
  readonly user = toSignal<User | null>(this.authState$, { initialValue: null });
  readonly isAuthenticated = computed(() => this.user() !== null);

  signIn(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  register(email: string, password: string) {
    return createUserWithEmailAndPassword(this.auth, email, password);
  }

  sendPasswordReset(email: string) {
    return sendPasswordResetEmail(this.auth, email);
  }

  signOut() {
    return firebaseSignOut(this.auth);
  }

  async signOutAndWaitForState(): Promise<void> {
    await firebaseSignOut(this.auth);
    await firstValueFrom(
      this.authState$.pipe(
        filter((user) => user === null),
        take(1)
      )
    );
  }

  async deleteCurrentUserAndWaitForState(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      return;
    }

    await deleteUser(user);
    await firstValueFrom(
      this.authState$.pipe(
        filter((current) => current === null),
        take(1)
      )
    );
  }

  currentUser() {
    return this.auth.currentUser;
  }
}
