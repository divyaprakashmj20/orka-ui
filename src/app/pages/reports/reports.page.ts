import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { forkJoin, firstValueFrom } from 'rxjs';
import { FirebaseAuthService } from '../../core/auth/firebase-auth.service';
import {
  AppUser, Hotel, HotelGroup, RequestStatus, RequestType, ServiceRequest
} from '../../core/models/orca.models';
import { OrcaApiService } from '../../core/services/orca-api.service';
import { OOptionComponent } from '../../core/components/o-select/o-option.component';
import { OSelectComponent } from '../../core/components/o-select/o-select.component';

export type DateRange = '7d' | '30d' | 'all';

export interface StaffStat {
  user: AppUser;
  assigned: number;
  completed: number;
  cancelled: number;
  completionRate: number;
  avgCompleteMinutes: number | null;
}

@Component({
  selector: 'app-reports-page',
  standalone: true,
  host: { class: 'ion-page' },
  imports: [CommonModule, OSelectComponent, OOptionComponent],
  templateUrl: './reports.page.html',
  styleUrl: './reports.page.scss'
})
export class ReportsPage implements OnInit {
  private readonly auth = inject(FirebaseAuthService);
  private readonly api  = inject(OrcaApiService);

  protected readonly currentAppUser = signal<AppUser | null>(null);
  protected readonly allRequests    = signal<ServiceRequest[]>([]);
  protected readonly allUsers       = signal<AppUser[]>([]);
  protected readonly hotelGroups    = signal<HotelGroup[]>([]);
  protected readonly hotels         = signal<Hotel[]>([]);
  protected readonly loading        = signal(true);
  protected readonly error          = signal('');

  // ── Filters ─────────────────────────────────────────────
  protected readonly selectedGroupId = signal<number | null>(null);
  protected readonly selectedHotelId = signal<number | null>(null);
  protected readonly dateRange       = signal<DateRange>('30d');

  // ── Role helpers ─────────────────────────────────────────
  private readonly role = computed(() => this.currentAppUser()?.accessRole ?? null);
  protected readonly isSuperAdmin  = computed(() => this.role() === 'SUPERADMIN');
  protected readonly isGroupAdmin  = computed(() => this.role() === 'HOTEL_GROUP_ADMIN' || this.role() === 'ADMIN');
  protected readonly isHotelAdmin  = computed(() => this.role() === 'HOTEL_ADMIN');
  protected readonly canSeeStaff   = computed(() => this.isSuperAdmin() || this.isGroupAdmin() || this.isHotelAdmin());
  protected readonly showGroupFilter = computed(() => this.isSuperAdmin() || this.isGroupAdmin());
  protected readonly showHotelFilter = computed(() => {
    if (this.isHotelAdmin()) return false;
    if (this.isSuperAdmin()) return this.selectedGroupId() != null;
    return true;
  });

  // ── Filter option lists ──────────────────────────────────
  protected readonly visibleGroupOptions = computed(() => {
    const actor = this.currentAppUser();
    if (!actor) return [];
    if (this.isSuperAdmin()) return this.hotelGroups().slice().sort((a, b) => a.name.localeCompare(b.name));
    if (actor.assignedHotelGroup?.id != null)
      return this.hotelGroups().filter(g => g.id === actor.assignedHotelGroup?.id);
    return [];
  });

  protected readonly visibleHotelOptions = computed(() => {
    const actor = this.currentAppUser();
    if (!actor) return [];
    let list = this.hotels();
    if (this.isSuperAdmin() && this.selectedGroupId() != null)
      list = list.filter(h => h.hotelGroup?.id === this.selectedGroupId());
    else if (!this.isSuperAdmin() && actor.assignedHotelGroup?.id != null)
      list = list.filter(h => h.hotelGroup?.id === actor.assignedHotelGroup?.id);
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  });

  // ── Filtered request set ─────────────────────────────────
  protected readonly filteredRequests = computed(() => {
    let reqs = this.allRequests();
    const gid = this.selectedGroupId();
    const hid = this.selectedHotelId();
    const dr  = this.dateRange();

    if (hid != null) {
      reqs = reqs.filter(r => r.hotel?.id === hid);
    } else if (gid != null) {
      reqs = reqs.filter(r => {
        const rGid = r.hotel?.hotelGroup?.id;
        if (rGid != null) return rGid === gid;
        const hotel = this.hotels().find(h => h.id === r.hotel?.id);
        return hotel?.hotelGroup?.id === gid;
      });
    }

    if (dr !== 'all') {
      const cutoff = Date.now() - (dr === '7d' ? 7 : 30) * 86_400_000;
      reqs = reqs.filter(r => {
        const t = Date.parse(r.createdAt ?? '');
        return !isNaN(t) && t >= cutoff;
      });
    }
    return reqs;
  });

  // ── Aggregate metrics ────────────────────────────────────
  protected readonly totalRequests   = computed(() => this.filteredRequests().length);

  protected readonly byStatus = computed(() => {
    const map: Partial<Record<RequestStatus, number>> = {};
    for (const r of this.filteredRequests()) {
      const s = (r.status ?? 'NEW') as RequestStatus;
      map[s] = (map[s] ?? 0) + 1;
    }
    return map;
  });

  protected readonly byType = computed(() => {
    const map: Partial<Record<RequestType, number>> = {};
    for (const r of this.filteredRequests()) {
      const t = (r.type ?? 'OTHER') as RequestType;
      map[t] = (map[t] ?? 0) + 1;
    }
    return map;
  });

  protected readonly totalByType   = computed(() => Math.max(1, Object.values(this.byType()).reduce((a, b) => a + (b ?? 0), 0)));
  protected readonly completionRate = computed(() => {
    const total = this.totalRequests();
    return total ? Math.round(((this.byStatus()['COMPLETED'] ?? 0) / total) * 100) : 0;
  });
  protected readonly openRate = computed(() => {
    const total = this.totalRequests();
    const open = (this.byStatus()['NEW'] ?? 0) + (this.byStatus()['ACCEPTED'] ?? 0);
    return total ? Math.round((open / total) * 100) : 0;
  });

  protected readonly avgAcceptMinutes   = computed(() => this.calcAvgMinutes('createdAt', 'acceptedAt'));
  protected readonly avgCompleteMinutes = computed(() => this.calcAvgMinutes('createdAt', 'completedAt'));

  // ── 7-day trend (always unfiltered by date for context) ──
  protected readonly requestsPerDay = computed(() => {
    const result: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      result.push({ date: d.toISOString().slice(0, 10), count: 0 });
    }
    const base = this.selectedGroupId() != null || this.selectedHotelId() != null
      ? this.filteredRequests() : this.allRequests();
    for (const r of base) {
      const slot = result.find(x => x.date === r.createdAt?.slice(0, 10));
      if (slot) slot.count++;
    }
    return result;
  });
  protected readonly maxDayCount = computed(() => Math.max(1, ...this.requestsPerDay().map(x => x.count)));

  // ── Top rooms ────────────────────────────────────────────
  protected readonly topRooms = computed(() => {
    const map: Record<string, { count: number; floor: number | null }> = {};
    for (const r of this.filteredRequests()) {
      const num = r.room?.number;
      if (!num) continue;
      if (!map[num]) map[num] = { count: 0, floor: r.room?.floor ?? null };
      map[num].count++;
    }
    return Object.entries(map)
      .map(([roomNumber, v]) => ({ roomNumber, count: v.count, floor: v.floor }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  });

  // ── Staff metrics ─────────────────────────────────────────
  protected readonly staffStats = computed((): StaffStat[] => {
    if (!this.canSeeStaff()) return [];
    const requests = this.filteredRequests();
    const staffMap = new Map<number, { user: AppUser; reqs: ServiceRequest[] }>();

    for (const u of this.allUsers()) {
      if (u.id == null || u.accessRole !== 'STAFF') continue;
      staffMap.set(u.id, { user: u, reqs: [] });
    }
    for (const r of requests) {
      const aid = r.assignee?.id;
      if (aid == null) continue;
      if (!staffMap.has(aid)) {
        staffMap.set(aid, {
          user: { id: aid, firebaseUid: '', email: '', name: r.assignee?.name ?? `Staff #${aid}`,
                  accessRole: 'STAFF', employeeRole: r.assignee?.employeeRole ?? null },
          reqs: []
        });
      }
      staffMap.get(aid)!.reqs.push(r);
    }

    return Array.from(staffMap.values())
      .filter(s => s.reqs.length > 0)
      .map(s => {
        const completed = s.reqs.filter(r => r.status === 'COMPLETED');
        const cancelled = s.reqs.filter(r => r.status === 'CANCELLED');
        const times = completed
          .map(r => {
            const a = Date.parse(r.createdAt ?? ''), b = Date.parse(r.completedAt ?? '');
            return !isNaN(a) && !isNaN(b) ? (b - a) / 60000 : null;
          })
          .filter((m): m is number => m !== null && m >= 0);
        return {
          user: s.user,
          assigned: s.reqs.length,
          completed: completed.length,
          cancelled: cancelled.length,
          completionRate: Math.round((completed.length / s.reqs.length) * 100),
          avgCompleteMinutes: times.length
            ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null
        };
      })
      .sort((a, b) => b.completed - a.completed);
  });

  // ── Lifecycle ────────────────────────────────────────────
  ngOnInit(): void { void this.init(); }

  protected setGroupFilter(gid: number | null): void {
    this.selectedGroupId.set(gid);
    const stillVisible = this.visibleHotelOptions().some(h => h.id === this.selectedHotelId());
    if (!stillVisible) this.selectedHotelId.set(null);
  }
  protected setHotelFilter(hid: number | null): void { this.selectedHotelId.set(hid); }
  protected setDateRange(range: DateRange): void { this.dateRange.set(range); }
  protected clearFilters(): void {
    const actor = this.currentAppUser();
    if (this.isSuperAdmin()) this.selectedGroupId.set(null);
    if (!this.isHotelAdmin()) this.selectedHotelId.set(null);
    this.dateRange.set('30d');
  }

  // ── Helpers ──────────────────────────────────────────────
  protected readonly requestTypes = ['HOUSEKEEPING', 'FOOD', 'MAINTENANCE', 'OTHER'] as const;

  protected barHeightPct(count: number): number {
    return Math.round((count / this.maxDayCount()) * 100);
  }
  protected typePct(type: string): number {
    return Math.round(((this.byType() as any)[type] ?? 0) / this.totalByType() * 100);
  }
  protected dayLabel(iso: string): string {
    return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' });
  }
  protected typeLabel(type: string): string {
    return ({ HOUSEKEEPING: 'Housekeeping', FOOD: 'Food & Bev', MAINTENANCE: 'Maintenance', OTHER: 'Other' } as any)[type] ?? type;
  }
  protected minuteLabel(minutes: number | null): string {
    if (minutes == null) return '—';
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  protected staffRoleLabel(user: AppUser): string {
    return user.employeeRole?.replaceAll('_', ' ') ?? 'Staff';
  }

  private calcAvgMinutes(start: 'createdAt', end: 'acceptedAt' | 'completedAt'): number | null {
    const times = this.filteredRequests()
      .filter(r => r[end] != null)
      .map(r => {
        const a = Date.parse(r[start] ?? ''), b = Date.parse(r[end] ?? '');
        return !isNaN(a) && !isNaN(b) && b >= a ? (b - a) / 60000 : null;
      })
      .filter((m): m is number => m !== null);
    return times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  }

  private async init(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const fbUser = this.auth.currentUser() ?? await firstValueFrom(this.auth.authState$);
      if (!fbUser) { this.error.set('Not signed in.'); this.loading.set(false); return; }
      const appUser = await firstValueFrom(this.api.getAppUserByFirebaseUid(fbUser.uid));
      this.currentAppUser.set(appUser);
      if ((appUser.accessRole === 'HOTEL_GROUP_ADMIN' || appUser.accessRole === 'ADMIN') && appUser.assignedHotelGroup?.id != null)
        this.selectedGroupId.set(appUser.assignedHotelGroup.id);
      if (appUser.accessRole === 'HOTEL_ADMIN' && appUser.assignedHotel?.id != null)
        this.selectedHotelId.set(appUser.assignedHotel.id);

      forkJoin({
        requests: this.api.listRequests(),
        users:    this.api.listAppUsers(),
        groups:   this.api.listHotelGroups(),
        hotels:   this.api.listHotels()
      }).subscribe({
        next: res => {
          this.allRequests.set(res.requests);
          this.allUsers.set(res.users);
          this.hotelGroups.set(res.groups);
          this.hotels.set(res.hotels);
          this.loading.set(false);
        },
        error: () => { this.error.set('Could not load report data.'); this.loading.set(false); }
      });
    } catch {
      this.error.set('Failed to load your profile.'); this.loading.set(false);
    }
  }
}
