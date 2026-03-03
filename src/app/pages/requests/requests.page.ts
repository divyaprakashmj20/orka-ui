import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  IonButton,
  IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkDoneOutline, checkmarkOutline, closeOutline, personOutline, refreshOutline, timeOutline, warningOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';
import { FirebaseAuthService } from '../../core/auth/firebase-auth.service';
import {
  AppUser,
  REQUEST_STATUSES,
  RequestWritePayload,
  RequestStatus,
  ServiceRequest
} from '../../core/models/orca.models';
import { ShellComponent } from '../../core/shell/shell.component';
import { PushEventsService } from '../../core/notifications/push-events.service';
import { OrcaApiService } from '../../core/services/orca-api.service';

type RequestBoardFilter = 'ALL' | RequestStatus;
type RequestActionPatch = {
  status?: RequestStatus | null;
  assigneeId?: number | null;
  acceptedAt?: string | null;
  completedAt?: string | null;
};

@Component({
  selector: 'app-requests-page',
  standalone: true,
  imports: [
    CommonModule,
    ShellComponent,
    IonButton,
    IonIcon
  ],
  templateUrl: './requests.page.html',
  styleUrl: './requests.page.scss'
})
export class RequestsPage implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly pushEvents = inject(PushEventsService);
  private readonly auth = inject(FirebaseAuthService);

  protected readonly items = signal<ServiceRequest[]>([]);
  protected readonly currentAppUser = signal<AppUser | null>(null);
  protected readonly loading = signal(false);
  protected readonly acting = signal(false);
  protected readonly error = signal('');
  protected readonly activeFilter = signal<RequestBoardFilter>('ALL');
  protected readonly selectedRequest = signal<ServiceRequest | null>(null);
  protected readonly requestStatuses = REQUEST_STATUSES;
  protected readonly boardFilters: RequestBoardFilter[] = ['ALL', ...REQUEST_STATUSES];
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
    addIcons({ checkmarkOutline, checkmarkDoneOutline, closeOutline, personOutline, refreshOutline, timeOutline, warningOutline });
  }

  ngOnInit(): void {
    this.pushEvents.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event.kind === 'NEW_REQUEST' || event.kind === 'APP_RESUMED') {
          this.loadRequests();
        }
      });

    void this.loadCurrentAppUserAndRefresh();
  }

  protected refreshAll(): void {
    this.loadRequests();
  }

  protected loadRequests(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.listRequests().subscribe({
      next: (items) => {
        this.items.set(this.sortedRequests(items));
        const currentSelectedId = this.selectedRequest()?.id;
        if (currentSelectedId != null) {
          this.selectedRequest.set(items.find((item) => item.id === currentSelectedId) ?? null);
        }
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
    return item.status ?? 'NEW';
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

  private async loadCurrentAppUserAndRefresh(): Promise<void> {
    try {
      const firebaseUser = this.auth.currentUser() ?? (await firstValueFrom(this.auth.authState$));
      if (firebaseUser) {
        this.currentAppUser.set(await firstValueFrom(this.api.getAppUserByFirebaseUid(firebaseUser.uid)));
      }
    } catch {
      this.currentAppUser.set(null);
    } finally {
      this.refreshAll();
    }
  }

  private saveAction(payload: RequestWritePayload, requestId: number): void {
    this.acting.set(true);
    this.error.set('');
    this.api.saveRequest(payload, requestId).subscribe({
      next: (saved) => {
        this.acting.set(false);
        const updated = this.items().map((item) => (item.id === requestId ? saved : item));
        this.items.set(this.sortedRequests(updated));
        this.selectedRequest.set(saved);
      },
      error: () => {
        this.acting.set(false);
        this.error.set('Request update failed. Refresh and try again.');
      }
    });
  }

  private buildRequestPayload(
    item: ServiceRequest,
    overrides: RequestActionPatch
  ): RequestWritePayload {
    return {
      hotelId: item.hotel?.id ?? 0,
      roomId: item.room?.id ?? 0,
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

  private sortedRequests(items: ServiceRequest[]): ServiceRequest[] {
    return [...items].sort((a, b) => {
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
}
