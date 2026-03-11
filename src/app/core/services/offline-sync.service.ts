import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { GuestRequestCreatePayload, ProfileUpdatePayload, RequestWritePayload } from '../models/orca.models';
import { NetworkStatusService } from './network-status.service';
import { OfflineMutation, OfflineStoreService } from './offline-store.service';
import { OrcaApiService } from './orca-api.service';
import { OrkaSseService } from './orka-sse.service';

@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private readonly network = inject(NetworkStatusService);
  private readonly store = inject(OfflineStoreService);
  private readonly api = inject(OrcaApiService);
  private readonly sseService = inject(OrkaSseService);
  private errorTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  readonly queue = signal<OfflineMutation[]>(this.store.listMutations());
  readonly syncing = signal(false);
  readonly lastSyncedAt = signal<string | null>(null);
  readonly lastError = signal<string | null>(null);
  readonly pendingCount = computed(() => this.queue().filter((item) => item.status === 'pending').length);
  readonly failedCount = computed(() => this.queue().filter((item) => item.status === 'failed').length);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.flushQueue());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          void this.flushQueue();
        }
      });
    }
  }

  async enqueueRequestUpdate(requestId: number, input: RequestWritePayload): Promise<void> {
    this.store.enqueueMutation({ kind: 'request-update', payload: { requestId, input } });
    this.refreshQueue();
  }

  async enqueueGuestRequest(token: string, input: GuestRequestCreatePayload): Promise<void> {
    this.store.enqueueMutation({ kind: 'guest-request-create', payload: { token, input } });
    this.refreshQueue();
  }

  async enqueueProfileUpdate(input: ProfileUpdatePayload): Promise<void> {
    this.store.enqueueMutation({ kind: 'profile-update', payload: { input } });
    this.refreshQueue();
  }

  async flushQueue(force = false): Promise<void> {
    this.network.refreshFromNavigator();

    if (this.syncing()) {
      return;
    }
    if (!force && !this.network.isOnline()) {
      return;
    }

    const queue = this.store.listMutations().filter((item) => item.status === 'pending');
    if (!queue.length) {
      return;
    }

    this.syncing.set(true);
    this.setLastError(null);

    try {
      for (const item of queue) {
        try {
          await this.runMutation(item);
          this.network.setOnline(true);
          this.store.removeMutation(item.id);
          this.refreshQueue();
        } catch (error) {
          if (this.isNetworkError(error)) {
            this.network.setOnline(false);
            this.store.updateMutation(item.id, {
              status: 'pending',
              attempts: item.attempts + 1,
              lastError: 'Waiting for connection'
            });
            this.refreshQueue();
            break;
          }

          if (this.isConflictError(error) && item.kind === 'request-update') {
            const payload = item.payload as { requestId: number; input: RequestWritePayload };
            await this.refreshRequestState(payload.requestId);
          }

          this.store.updateMutation(item.id, {
            status: 'failed',
            attempts: item.attempts + 1,
            lastError: this.describeError(error)
          });
          this.setLastError(this.describeError(error));
          this.refreshQueue();
        }
      }

      if (this.store.listMutations().length === 0) {
        this.lastSyncedAt.set(new Date().toISOString());
        this.setLastError(null);
      }
    } finally {
      this.network.refreshFromNavigator();
      this.syncing.set(false);
    }
  }

  private async runMutation(item: OfflineMutation): Promise<void> {
    switch (item.kind) {
      case 'request-update': {
        const payload = item.payload as { requestId: number; input: RequestWritePayload };
        await firstValueFrom(this.api.saveRequest(payload.input, payload.requestId));
        return;
      }
      case 'guest-request-create': {
        const payload = item.payload as { token: string; input: GuestRequestCreatePayload };
        await firstValueFrom(this.api.createGuestRequest(payload.token, payload.input));
        return;
      }
      case 'profile-update': {
        const payload = item.payload as { input: ProfileUpdatePayload };
        await firstValueFrom(this.api.updateMyProfile(payload.input));
        return;
      }
    }
  }

  private refreshQueue(): void {
    this.queue.set(this.store.listMutations());
  }

  private isNetworkError(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 0;
  }

  private isConflictError(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 409;
  }

  private describeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 409) {
        return 'Request changed on another device before your offline update could sync.';
      }
      return error.error?.message || error.statusText || 'Sync failed';
    }
    return 'Sync failed';
  }

  private async refreshRequestState(requestId: number): Promise<void> {
    try {
      const latest = await firstValueFrom(this.api.getRequestById(requestId));
      const updatedList = this.api.replaceCachedRequest(latest);
      this.sseService.items$.next(updatedList);
    } catch {
      // Ignore refresh failure; the queue item is still marked failed.
    }
  }

  private setLastError(message: string | null): void {
    if (this.errorTimer != null) {
      clearTimeout(this.errorTimer);
      this.errorTimer = null;
    }

    this.lastError.set(message);

    if (message && typeof window !== 'undefined') {
      this.errorTimer = globalThis.setTimeout(() => {
        this.lastError.set(null);
        this.errorTimer = null;
      }, 8000);
    }
  }
}
