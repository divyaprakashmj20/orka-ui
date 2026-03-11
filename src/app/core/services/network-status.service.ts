import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  readonly isOnline = signal(typeof navigator !== 'undefined' ? navigator.onLine : true);
  readonly lastChangedAt = signal<string | null>(null);

  constructor() {
    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('online', () => this.setOnline(true));
    window.addEventListener('offline', () => this.setOnline(false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.refreshFromNavigator();
      }
    });
  }

  refreshFromNavigator(): void {
    if (typeof navigator === 'undefined') {
      return;
    }
    this.setOnline(navigator.onLine);
  }

  setOnline(next: boolean): void {
    if (this.isOnline() === next) {
      return;
    }
    this.isOnline.set(next);
    this.lastChangedAt.set(new Date().toISOString());
  }
}
