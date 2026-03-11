import { Injectable, inject } from '@angular/core';
import { NavigationError, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { NetworkStatusService } from './network-status.service';

type LazyImporter = () => Promise<unknown>;

@Injectable({ providedIn: 'root' })
export class LazyRouteRecoveryService {
  private readonly router = inject(Router);
  private readonly network = inject(NetworkStatusService);

  private readonly importers: LazyImporter[] = [
    () => import('../../pages/home/home.page'),
    () => import('../../pages/requests/requests.page'),
    () => import('../../pages/rooms/rooms.page'),
    () => import('../../pages/staff/staff.page'),
    () => import('../../pages/app-users/app-users.page'),
    () => import('../../pages/hotels/hotels.page'),
    () => import('../../pages/hotel-groups/hotel-groups.page'),
    () => import('../../pages/reports/reports.page'),
    () => import('../../pages/profile/profile.page'),
    () => import('../../pages/login/login.page'),
    () => import('../../pages/register/register.page'),
    () => import('../../pages/forgot-password/forgot-password.page'),
    () => import('../../pages/re-apply/re-apply.page'),
    () => import('../../pages/guest-request/guest-request.page')
  ];

  private warmStarted = false;
  private hadChunkLoadFailure = false;

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationError => event instanceof NavigationError))
      .subscribe((event) => {
        if (this.isLazyChunkError(event.error)) {
          this.hadChunkLoadFailure = true;
        }
      });

    if (this.network.isOnline()) {
      void this.warmRoutes();
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        void this.warmRoutes();
        if (this.hadChunkLoadFailure) {
          this.hadChunkLoadFailure = false;
          window.setTimeout(() => window.location.reload(), 250);
        }
      });
    }
  }

  async warmRoutes(): Promise<void> {
    if (!this.network.isOnline()) {
      return;
    }
    if (this.warmStarted) {
      return;
    }

    this.warmStarted = true;
    try {
      await Promise.allSettled(this.importers.map((load) => load()));
    } finally {
      this.warmStarted = false;
    }
  }

  private isLazyChunkError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message ?? '';
    return (
      message.includes('Failed to fetch dynamically imported module') ||
      message.includes('Importing a module script failed') ||
      message.includes('Loading chunk')
    );
  }
}
