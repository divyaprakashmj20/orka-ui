import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  IonButton,
  IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkDoneOutline, checkmarkOutline, closeCircleOutline, closeOutline, personOutline, refreshOutline, timeOutline, warningOutline } from 'ionicons/icons';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FirebaseAuthService } from '../../core/auth/firebase-auth.service';
import {
  AppUser,
  REQUEST_STATUSES,
  RequestWritePayload,
  RequestStatus,
  ServiceRequest
} from '../../core/models/orca.models';
import { PushEventsService } from '../../core/notifications/push-events.service';
import { OrcaApiService } from '../../core/services/orca-api.service';
import { NetworkStatusService } from '../../core/services/network-status.service';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { OrkaSseService, SseConnectionStatus } from '../../core/services/orka-sse.service';

type RequestBoardFilter = 'ALL' | RequestStatus;
type RequestActionPatch = {
  status?: RequestStatus | null;
  assigneeId?: number | null;
  acceptedAt?: string | null;
  completedAt?: string | null;
};

@Component({
  selector: 'app-requests-page',
  host: { class: 'ion-page' },
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonIcon
  ],
  templateUrl: './requests.page.html',
  styleUrl: './requests.page.scss'
})
export class RequestsPage implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly pushEvents = inject(PushEventsService);
  private readonly auth = inject(FirebaseAuthService);
  private readonly sseService = inject(OrkaSseService);
  private readonly network = inject(NetworkStatusService);
  private readonly offlineSync = inject(OfflineSyncService);

  protected readonly items = signal<ServiceRequest[]>([]);
  protected readonly sseStatus = signal<SseConnectionStatus>('connecting');
  protected readonly currentAppUser = signal<AppUser | null>(null);
  protected readonly loading = signal(false);
  protected readonly acting = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly noticeTone = signal<'info' | 'warning'>('info');
  protected readonly activeFilter = signal<RequestBoardFilter>('ALL');
  protected readonly selectedRequest = signal<ServiceRequest | null>(null);
  protected readonly requestStatuses = REQUEST_STATUSES;
  protected readonly boardFilters: RequestBoardFilter[] = ['ALL', ...REQUEST_STATUSES];
  private noticeTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;
  private readonly noticeMode = signal<'offline-save' | null>(null);
  protected readonly filteredItems = computed(() => {
    const filter = this.activeFilter();
    if (filter === 'ALL') {
      return this.sortedRequests(this.items());
    }
    return this.sortedRequests(this.items().filter((item) => item.status === filter));
  });
  protected readonly requestCounts = computed(() => {
    const counts: Record<RequestBoardFilter, number> = {
      ALL: this.items().length,
      NEW: 0,
      ACCEPTED: 0,
      COMPLETED: 0,
      CANCELLED: 0
    };

    for (const item of this.items()) {
      const status = item.status ?? 'NEW';
      counts[status] += 1;
    }

    return counts;
  });

  constructor(private readonly api: OrcaApiService) {
    addIcons({ checkmarkOutline, checkmarkDoneOutline, closeCircleOutline, closeOutline, personOutline, refreshOutline, timeOutline, warningOutline });

    effect(() => {
      if (this.noticeMode() !== 'offline-save') {
        return;
      }

      const isOnline = this.network.isOnline();
      const pendingCount = this.offlineSync.pendingCount();
      const failedCount = this.offlineSync.failedCount();
      const syncing = this.offlineSync.syncing();
      const lastSyncedAt = this.offlineSync.lastSyncedAt();

      if (!isOnline) {
        this.setStickyNotice('No internet — request change saved offline and will sync automatically.', 'info');
        return;
      }

      if (syncing || pendingCount > 0) {
        this.setStickyNotice('Back online — syncing offline changes…', 'info');
        return;
      }

      if (failedCount > 0) {
        this.noticeMode.set(null);
        this.notice.set('');
        return;
      }

      if (lastSyncedAt) {
        this.noticeMode.set(null);
        this.showNotice('Offline changes synced.', 'info', 4000);
        return;
      }

      this.noticeMode.set(null);
      this.notice.set('');
    });
  }

  ngOnInit(): void {
    this.sseService.setRequestsPageActive(true);

    // Mirror the service's persistent items into the local signal.
    this.sseService.items$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((incoming) => {
        this.items.set(this.sortedRequests(incoming));
        // Keep the detail sheet in sync if it's open.
        const selectedId = this.selectedRequest()?.id;
        if (selectedId != null) {
          this.selectedRequest.set(incoming.find((i) => i.id === selectedId) ?? null);
        }
      });

    // Mirror SSE connection status into a signal for template binding.
    this.sseService.status$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((status) => this.sseStatus.set(status));

    // Push notification fallback — only REST-refresh when SSE is not live.
    this.pushEvents.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event.kind === 'NEW_REQUEST' || event.kind === 'APP_RESUMED') {
          if (this.sseStatus() !== 'connected') {
            this.loadRequests();
          }
        }
      });

    void this.loadCurrentAppUserAndRefresh();
  }

  ngOnDestroy(): void {
    this.sseService.setRequestsPageActive(false);
    this.clearNoticeTimer();
  }

  protected refreshAll(): void {
    this.loadRequests();
  }

  protected loadRequests(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.listRequests().subscribe({
      next: (items) => {
        // Push into service so it stays in sync as the single source of truth.
        this.api.primeRequestsCache(items);
        this.sseService.items$.next(items);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load requests.');
        this.loading.set(false);
      }
    });
  }

  protected setFilter(filter: RequestBoardFilter): void {
    this.activeFilter.set(filter);
  }

  protected openRequest(item: ServiceRequest): void {
    this.selectedRequest.set(item);
  }

  protected closeRequest(): void {
    this.selectedRequest.set(null);
  }

  protected canAccept(item: ServiceRequest): boolean {
    return item.id != null && item.status === 'NEW' && this.currentAppUser()?.id != null;
  }

  protected canComplete(item: ServiceRequest): boolean {
    if (item.id == null || item.status !== 'ACCEPTED') {
      return false;
    }
    const currentUser = this.currentAppUser();
    if (!currentUser?.id) {
      return false;
    }
    return item.assignee?.id === currentUser.id || this.canManageRequestState(currentUser);
  }

  protected canReopen(item: ServiceRequest): boolean {
    if (item.id == null) {
      return false;
    }
    const currentUser = this.currentAppUser();
    return (item.status === 'COMPLETED' || item.status === 'CANCELLED') && this.canManageRequestState(currentUser);
  }

  protected canCancel(item: ServiceRequest): boolean {
    if (item.id == null) {
      return false;
    }
    const currentUser = this.currentAppUser();
    if (!currentUser) {
      return false;
    }
    return (item.status === 'NEW' || item.status === 'ACCEPTED') && this.canManageRequestState(currentUser);
  }

  protected accept(item: ServiceRequest): void {
    const currentUser = this.currentAppUser();
    if (!this.canAccept(item) || !currentUser?.id) {
      return;
    }

    const payload = this.buildRequestPayload(item, {
      status: 'ACCEPTED',
      assigneeId: currentUser.id,
      acceptedAt: item.acceptedAt ?? this.nowIso(),
      completedAt: null
    });
    this.saveAction(payload, item.id!);
  }

  protected complete(item: ServiceRequest): void {
    if (!this.canComplete(item)) {
      return;
    }

    const payload = this.buildRequestPayload(item, {
      status: 'COMPLETED',
      completedAt: this.nowIso()
    });
    this.saveAction(payload, item.id!);
  }

  protected reopen(item: ServiceRequest): void {
    if (!this.canReopen(item)) {
      return;
    }

    const payload = this.buildRequestPayload(item, {
      status: 'NEW',
      completedAt: null,
      acceptedAt: null,
      assigneeId: null
    });
    this.saveAction(payload, item.id!);
  }

  protected cancel(item: ServiceRequest): void {
    if (!this.canCancel(item)) {
      return;
    }

    const payload = this.buildRequestPayload(item, {
      status: 'CANCELLED',
      completedAt: null
    });
    this.saveAction(payload, item.id!);
  }

  protected statusLabel(item: ServiceRequest): string {
    const base = item.status ?? 'NEW';
    return item.localState === 'PENDING_SYNC' ? `${base} · Pending sync` : base;
  }

  protected typeLabel(item: ServiceRequest): string {
    return item.type?.replaceAll('_', ' ') ?? 'Unspecified';
  }

  protected assigneeName(item: ServiceRequest): string {
    return item.assignee?.name || 'Unassigned';
  }

  protected assigneeRole(item: ServiceRequest): string {
    const role = item.assignee?.employeeRole ?? item.assignee?.accessRole;
    return role ? role.replaceAll('_', ' ') : 'No role';
  }

  protected dateTimeLabel(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  }

  protected primaryTimeLabel(item: ServiceRequest): string {
    if (item.status === 'COMPLETED' && item.completedAt) {
      return this.dateTimeLabel(item.completedAt);
    }
    if (item.status === 'ACCEPTED' && item.acceptedAt) {
      return this.dateTimeLabel(item.acceptedAt);
    }
    return this.dateTimeLabel(item.createdAt);
  }

  protected primaryTimeHeading(item: ServiceRequest): string {
    if (item.status === 'COMPLETED' && item.completedAt) {
      return 'Completed';
    }
    if (item.status === 'ACCEPTED' && item.acceptedAt) {
      return 'Accepted';
    }
    return 'Created';
  }

  protected elapsedMetricLabel(item: ServiceRequest): string {
    if (item.status === 'COMPLETED' && item.createdAt && item.completedAt) {
      return 'Time to completion';
    }
    return 'Elapsed time';
  }

  protected elapsedMetricValue(item: ServiceRequest): string {
    const createdAt = item.createdAt ? new Date(item.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) {
      return '-';
    }

    const end =
      item.status === 'COMPLETED' && item.completedAt
        ? new Date(item.completedAt)
        : new Date();

    if (Number.isNaN(end.getTime())) {
      return '-';
    }

    const diffMs = Math.max(0, end.getTime() - createdAt.getTime());
    const totalMinutes = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    const parts: string[] = [];
    if (days > 0) {
      parts.push(`${days}d`);
    }
    if (hours > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0 || parts.length === 0) {
      parts.push(`${minutes}m`);
    }

    return parts.join(' ');
  }

  protected filterLabel(filter: RequestBoardFilter): string {
    const map: Record<RequestBoardFilter, string> = {
      ALL: 'All',
      NEW: 'New',
      ACCEPTED: 'Active',
      COMPLETED: 'Done',
      CANCELLED: 'Cancelled'
    };
    return map[filter];
  }

  protected statusClass(item: ServiceRequest): string {
    return `chip-${(item.status ?? 'new').toLowerCase()}`;
  }

  protected isUrgent(item: ServiceRequest): boolean {
    if (item.status === 'COMPLETED' || item.status === 'CANCELLED') return false;
    const createdAt = item.createdAt ? new Date(item.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
    const diffMs = Date.now() - createdAt.getTime();
    return diffMs > 30 * 60 * 1000; // urgent if > 30 min
  }

  protected hasPendingSync(item: ServiceRequest): boolean {
    return item.localState === 'PENDING_SYNC';
  }

  private async loadCurrentAppUserAndRefresh(): Promise<void> {
    try {
      const firebaseUser = this.auth.currentUser() ?? (await firstValueFrom(this.auth.authState$));
      if (firebaseUser) {
        this.currentAppUser.set(await firstValueFrom(this.api.getAppUserByFirebaseUid(firebaseUser.uid)));
      }
    } catch {
      this.currentAppUser.set(null);
    }
    // Do NOT call refreshAll() here — SSE sends the initial snapshot immediately
    // on connect, so a parallel REST call would cause a double-update race.
    // refreshAll() is only used for the manual refresh button (SSE fallback).
  }

  private saveAction(payload: RequestWritePayload, requestId: number): void {
    if (!this.network.isOnline()) {
      void this.queueOfflineAction(payload, requestId);
      return;
    }

    this.acting.set(true);
    this.error.set('');
    this.api.saveRequest(payload, requestId).subscribe({
      next: (saved) => {
        this.acting.set(false);
        // Only refresh the detail sheet if the user already has it open.
        // Action buttons should NOT auto-open details — the user opens them deliberately.
        if (this.selectedRequest() != null) {
          this.selectedRequest.set(saved);
        }
      },
      error: (error: unknown) => {
        this.acting.set(false);
        if (!this.network.isOnline()) {
          void this.queueOfflineAction(payload, requestId);
          return;
        }
        if (error instanceof HttpErrorResponse && error.status === 409) {
          this.showNotice('This request changed on another device. Refresh to load the latest state.', 'warning');
          return;
        }
        this.error.set('Request update failed. Refresh and try again.');
      }
    });
  }

  private async queueOfflineAction(payload: RequestWritePayload, requestId: number): Promise<void> {
    await this.offlineSync.enqueueRequestUpdate(requestId, payload);
    const optimistic = this.sortedRequests(
      this.items().map((item) => (item.id === requestId ? this.applyOfflinePatch(item, payload) : item))
    );
    this.items.set(optimistic);
    this.api.primeRequestsCache(optimistic);
    this.sseService.items$.next(optimistic);
    if (this.selectedRequest() != null) {
      this.selectedRequest.set(optimistic.find((item) => item.id === requestId) ?? null);
    }
    this.error.set('');
    this.noticeMode.set('offline-save');
    this.setStickyNotice('No internet — request change saved offline and will sync automatically.', 'info');
  }

  private buildRequestPayload(
    item: ServiceRequest,
    overrides: RequestActionPatch
  ): RequestWritePayload {
    return {
      hotelId: item.hotel?.id ?? 0,
      roomId: item.room?.id ?? 0,
      version: item.version ?? null,
      type: item.type ?? null,
      message: item.message ?? null,
      status: overrides.status ?? item.status ?? null,
      createdAt: item.createdAt ?? null,
      acceptedAt: overrides.acceptedAt !== undefined ? overrides.acceptedAt : item.acceptedAt ?? null,
      completedAt: overrides.completedAt !== undefined ? overrides.completedAt : item.completedAt ?? null,
      assigneeId:
        overrides.assigneeId === null
          ? null
          : overrides.assigneeId != null
            ? overrides.assigneeId
            : item.assignee?.id ?? null,
      rating: item.rating ?? null,
      comments: item.comments ?? null
    };
  }

  private applyOfflinePatch(item: ServiceRequest, payload: RequestWritePayload): ServiceRequest {
    const currentUser = this.currentAppUser();
    const assignee =
      payload.assigneeId === null
        ? null
        : payload.assigneeId != null
          ? item.assignee?.id === payload.assigneeId
            ? item.assignee
            : currentUser?.id === payload.assigneeId
              ? {
                  id: currentUser.id,
                  name: currentUser.name,
                  employeeRole: currentUser.employeeRole,
                  accessRole: currentUser.accessRole,
                  active: currentUser.active
                }
              : item.assignee
          : item.assignee;

    return {
      ...item,
      status: payload.status ?? item.status ?? null,
      acceptedAt: payload.acceptedAt ?? item.acceptedAt ?? null,
      completedAt: payload.completedAt ?? item.completedAt ?? null,
      assignee,
      version: payload.version ?? item.version ?? null,
      localState: 'PENDING_SYNC'
    };
  }

  private sortedRequests(items: ServiceRequest[]): ServiceRequest[] {
    // NEW and ACCEPTED are "active" — interleaved by recency
    // CANCELLED sits in the middle, COMPLETED always last
    const statusPriority: Record<string, number> = {
      NEW:       0,
      ACCEPTED:  0,
      CANCELLED: 1,
      COMPLETED: 2,
    };
    return [...items].sort((a, b) => {
      const aPrio = statusPriority[a.status ?? 'NEW'] ?? 0;
      const bPrio = statusPriority[b.status ?? 'NEW'] ?? 0;
      if (aPrio !== bPrio) return aPrio - bPrio;
      // Within the same priority group: most recent first
      const aTime = Date.parse(a.createdAt ?? '') || 0;
      const bTime = Date.parse(b.createdAt ?? '') || 0;
      return bTime - aTime;
    });
  }

  private canManageRequestState(user: AppUser | null): boolean {
    return (
      user?.accessRole === 'SUPERADMIN' ||
      user?.accessRole === 'HOTEL_ADMIN' ||
      user?.accessRole === 'ADMIN'
    );
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  private showNotice(message: string, tone: 'info' | 'warning', duration = 8000): void {
    this.clearNoticeTimer();
    this.notice.set(message);
    this.noticeTone.set(tone);

    if (duration > 0 && typeof window !== 'undefined') {
      this.noticeTimeout = globalThis.setTimeout(() => {
        this.notice.set('');
        this.noticeTimeout = null;
      }, duration);
    }
  }

  private setStickyNotice(message: string, tone: 'info' | 'warning'): void {
    this.clearNoticeTimer();
    this.notice.set(message);
    this.noticeTone.set(tone);
  }

  private clearNoticeTimer(): void {
    if (this.noticeTimeout != null) {
      clearTimeout(this.noticeTimeout);
      this.noticeTimeout = null;
    }
  }
}
