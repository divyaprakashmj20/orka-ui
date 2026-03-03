import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { FirebaseAuthService } from '../auth/firebase-auth.service';
import { ServiceRequest } from '../models/orca.models';

export type SseConnectionStatus = 'connecting' | 'connected' | 'error';

/**
 * Persistent SSE service — one always-on connection for the lifetime of the app.
 *
 * Items and connection status are held here as BehaviorSubjects so any component
 * can read the latest state whether or not the requests page is mounted.
 *
 * Unread count increments whenever a truly new NEW-status request arrives while
 * the requests page is NOT active. Call setRequestsPageActive(true/false) from
 * RequestsPage ngOnInit / ngOnDestroy.
 */
@Injectable({ providedIn: 'root' })
export class OrkaSseService {
  private readonly authService = inject(FirebaseAuthService);

  private es: EventSource | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly RETRY_MS = 3000;

  private requestsPageActive = false;
  private knownIds = new Set<number>();
  private initialSnapshotDone = false;

  readonly status$ = new BehaviorSubject<SseConnectionStatus>('connecting');
  readonly items$ = new BehaviorSubject<ServiceRequest[]>([]);
  readonly unreadCount$ = new BehaviorSubject<number>(0);
  /** The most recent new-status request that arrived while the requests page was closed.
   *  Cleared when the requests page becomes active. Drives the toast notification. */
  readonly latestNewRequest$ = new BehaviorSubject<ServiceRequest | null>(null);

  constructor() {
    void this.connect();
  }

  /** Call from RequestsPage ngOnInit — clears the unread badge and toast. */
  setRequestsPageActive(active: boolean): void {
    this.requestsPageActive = active;
    if (active) {
      this.unreadCount$.next(0);
      this.latestNewRequest$.next(null);
    }
  }

  private async connect(): Promise<void> {
    this.status$.next('connecting');

    let firebaseUser = this.authService.currentUser();
    if (!firebaseUser) {
      try {
        firebaseUser = await firstValueFrom(
          this.authService.authState$.pipe(filter((u) => u !== null))
        );
      } catch {
        this.status$.next('error');
        this.retryTimer = setTimeout(() => { void this.connect(); }, this.RETRY_MS);
        return;
      }
    }

    let token: string;
    try {
      token = await firebaseUser!.getIdToken();
    } catch {
      this.status$.next('error');
      this.retryTimer = setTimeout(() => { void this.connect(); }, this.RETRY_MS);
      return;
    }

    const url = `${environment.apiBase}/requests/stream?token=${encodeURIComponent(token)}`;
    this.es = new EventSource(url);

    this.es.onopen = (): void => {
      this.status$.next('connected');
    };

    this.es.onmessage = (event: MessageEvent): void => {
      this.handlePayload(event.data);
    };

    this.es.addEventListener('requests', (event) => {
      this.handlePayload((event as MessageEvent).data);
    });

    this.es.onerror = (): void => {
      this.closeSource();
      this.status$.next('error');
      this.retryTimer = setTimeout(() => { void this.connect(); }, this.RETRY_MS);
    };
  }

  private closeSource(): void {
    if (this.es != null) {
      this.es.close();
      this.es = null;
    }
    if (this.retryTimer != null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private handlePayload(raw: string): void {
    try {
      const parsed: unknown = JSON.parse(raw);
      let incoming: ServiceRequest[];

      if (Array.isArray(parsed)) {
        incoming = parsed as ServiceRequest[];
      } else if (parsed && typeof parsed === 'object') {
        incoming = [parsed as ServiceRequest];
      } else {
        return;
      }

      const current = this.items$.value;
      let updated: ServiceRequest[];

      if (incoming.length === 1 && current.length > 0) {
        // Single-item push — patch in place or append if new.
        const item = incoming[0];
        const idx = current.findIndex((i) => i.id === item.id);
        updated = idx >= 0
          ? current.map((i) => (i.id === item.id ? item : i))
          : [...current, item];
      } else {
        // Full list — initial snapshot or bulk replace.
        updated = incoming;
      }

      // Count unread: new ids with NEW status, only after the initial snapshot,
      // only while the requests page is not open.
      if (this.initialSnapshotDone && !this.requestsPageActive) {
        const arrivals = updated.filter(
          (i) => i.id != null && !this.knownIds.has(i.id!) && i.status === 'NEW'
        );
        if (arrivals.length > 0) {
          this.unreadCount$.next(this.unreadCount$.value + arrivals.length);
          // Show the most recently arrived request in the toast.
          this.latestNewRequest$.next(arrivals[arrivals.length - 1]);
        }
      }

      updated.forEach((i) => { if (i.id != null) this.knownIds.add(i.id!); });
      this.initialSnapshotDone = true;
      this.items$.next(updated);
    } catch {
      // Non-JSON heartbeat or keep-alive — ignore.
    }
  }
}
