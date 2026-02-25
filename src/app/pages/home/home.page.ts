import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar
} from '@ionic/angular/standalone';
import { FirebaseAuthService } from '../../core/auth/firebase-auth.service';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss'
})
export class HomePage {
  private readonly auth = inject(FirebaseAuthService);
  private readonly router = inject(Router);

  protected readonly loggingOut = signal(false);
  protected readonly authError = signal('');
  protected readonly userEmail = computed(() => this.auth.user()?.email ?? 'Signed in user');

  protected readonly sections = [
    { title: 'User Approvals', path: '/app-users', note: 'Superadmin pending user approvals' },
    { title: 'Hotel Groups', path: '/hotel-groups', note: 'CRUD for /api/hotel-groups' },
    { title: 'Hotels', path: '/hotels', note: 'CRUD for /api/hotels' },
    { title: 'Rooms', path: '/rooms', note: 'CRUD for /api/rooms' },
    { title: 'Employees', path: '/employees', note: 'CRUD for /api/employees' },
    { title: 'Requests', path: '/requests', note: 'CRUD for /api/requests' }
  ] as const;

  protected async logout(): Promise<void> {
    try {
      this.loggingOut.set(true);
      this.authError.set('');
      await this.auth.signOutAndWaitForState();
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    } catch {
      this.authError.set('Unable to sign out right now.');
    } finally {
      this.loggingOut.set(false);
    }
  }
}
