import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar
} from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { FirebaseAuthService } from '../../core/auth/firebase-auth.service';
import {
  ACCESS_ROLES,
  AccessRole,
  AppUser,
  EMPLOYEE_ROLES,
  EmployeeRole,
  Hotel,
  HotelGroup,
  HotelGroupRef,
  HotelRef
} from '../../core/models/orca.models';
import { OrcaApiService } from '../../core/services/orca-api.service';

type Draft = {
  name: string;
  phone: string;
  accessRole: AccessRole;
  employeeRole: EmployeeRole | null;
  active: boolean;
  assignedHotelGroupId: number | null;
  assignedHotelId: number | null;
};

type HotelNode = {
  hotel: HotelRef;
  hotelAdmins: AppUser[];
  staff: AppUser[];
};

type GroupNode = {
  group: HotelGroupRef;
  groupAdmins: AppUser[];
  hotels: HotelNode[];
};

@Component({
  selector: 'app-staff-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton
  ],
  templateUrl: './staff.page.html',
  styleUrl: './staff.page.scss'
})
export class StaffPage implements OnInit {
  private readonly auth = inject(FirebaseAuthService);
  private readonly api = inject(OrcaApiService);

  protected readonly currentAppUser = signal<AppUser | null>(null);
  protected readonly users = signal<AppUser[]>([]);
  protected readonly hotelGroups = signal<HotelGroup[]>([]);
  protected readonly hotels = signal<Hotel[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly busyIds = signal<number[]>([]);
  protected readonly expandedUserId = signal<number | null>(null);
  protected readonly platformExpanded = signal(false);
  protected readonly expandedGroupIds = signal<number[]>([]);
  protected readonly expandedHotelIds = signal<number[]>([]);
  protected readonly roleFilter = signal<'ALL' | AccessRole>('ALL');
  protected readonly statusFilter = signal<'ALL' | 'ACTIVE' | 'DISABLED'>('ALL');

  protected readonly employeeRoles = EMPLOYEE_ROLES;

  protected drafts: Record<number, Draft> = {};

  protected readonly managedUsers = computed(() => {
    const actorId = this.currentAppUser()?.id;
    return this.users().filter((user) => {
      const visible =
        user.id != null &&
        user.id !== actorId &&
        user.status !== 'PENDING_APPROVAL' &&
        user.status !== 'REJECTED';

      if (!visible) {
        return false;
      }

      if (this.roleFilter() !== 'ALL' && user.accessRole !== this.roleFilter()) {
        return false;
      }

      const active = user.active ?? true;
      if (this.statusFilter() === 'ACTIVE' && !active) {
        return false;
      }
      if (this.statusFilter() === 'DISABLED' && active) {
        return false;
      }

      return true;
    });
  });

  protected readonly platformUsers = computed(() =>
    this.managedUsers().filter((user) => user.accessRole === 'SUPERADMIN')
  );

  protected readonly groupNodes = computed<GroupNode[]>(() => {
    const users = this.managedUsers();
    const groups = new Map<number, HotelGroupRef>();
    const hotels = new Map<number, HotelRef>();

    for (const group of this.hotelGroups()) {
      if (group.id != null) {
        groups.set(group.id, group);
      }
    }
    for (const hotel of this.hotels()) {
      if (hotel.id != null) {
        hotels.set(hotel.id, hotel);
        if (hotel.hotelGroup?.id != null) {
          groups.set(hotel.hotelGroup.id, hotel.hotelGroup);
        }
      }
    }
    for (const user of users) {
      if (user.assignedHotelGroup?.id != null) {
        groups.set(user.assignedHotelGroup.id, user.assignedHotelGroup);
      }
      if (user.assignedHotel?.id != null) {
        hotels.set(user.assignedHotel.id, user.assignedHotel);
        if (user.assignedHotel.hotelGroup?.id != null) {
          groups.set(user.assignedHotel.hotelGroup.id, user.assignedHotel.hotelGroup);
        }
      }
    }

    return Array.from(groups.values())
      .filter((group) => group.id != null)
      .map((group) => {
        const groupAdmins = users.filter(
          (user) =>
            (user.accessRole === 'HOTEL_GROUP_ADMIN' || user.accessRole === 'ADMIN') &&
            user.assignedHotelGroup?.id === group.id
        );

        const groupHotels = Array.from(hotels.values())
          .filter(
            (hotel) =>
              hotel.id != null &&
              (hotel.hotelGroup?.id === group.id ||
                users.some((user) => user.assignedHotel?.id === hotel.id && user.assignedHotelGroup?.id === group.id))
          )
          .sort((left, right) => (left.name ?? '').localeCompare(right.name ?? ''))
          .map((hotel) => ({
            hotel,
            hotelAdmins: users.filter(
              (user) => user.accessRole === 'HOTEL_ADMIN' && user.assignedHotel?.id === hotel.id
            ),
            staff: users.filter(
              (user) => user.accessRole === 'STAFF' && user.assignedHotel?.id === hotel.id
            )
          }));

        return {
          group,
          groupAdmins,
          hotels: groupHotels
        };
      })
      .filter((node) => node.groupAdmins.length > 0 || node.hotels.length > 0)
      .sort((left, right) => (left.group.name ?? '').localeCompare(right.group.name ?? ''));
  });

  ngOnInit(): void {
    void this.loadCurrentAppUserAndRefresh();
  }

  protected refreshAll(): void {
    const actor = this.currentAppUser();
    if (!actor) {
      this.error.set('Unable to determine current user profile.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.api.listAppUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.seedDrafts(users);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load staff members.');
        this.loading.set(false);
      }
    });

    this.api.listHotelGroups().subscribe({
      next: (groups) => this.hotelGroups.set(groups),
      error: () => this.error.set('Failed to load hotel groups.')
    });

    this.api.listHotels().subscribe({
      next: (hotels) => this.hotels.set(hotels),
      error: () => this.error.set('Failed to load hotels.')
    });
  }

  protected toggleEditor(userId: number | undefined): void {
    if (userId == null) {
      return;
    }
    this.expandedUserId.set(this.expandedUserId() === userId ? null : userId);
  }

  protected togglePlatform(): void {
    this.platformExpanded.set(!this.platformExpanded());
  }

  protected isGroupExpanded(groupId: number | undefined): boolean {
    return groupId != null && this.expandedGroupIds().includes(groupId);
  }

  protected toggleGroup(groupId: number | undefined): void {
    if (groupId == null) {
      return;
    }
    const current = this.expandedGroupIds();
    this.expandedGroupIds.set(
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    );
  }

  protected isHotelExpanded(hotelId: number | undefined): boolean {
    return hotelId != null && this.expandedHotelIds().includes(hotelId);
  }

  protected toggleHotel(hotelId: number | undefined): void {
    if (hotelId == null) {
      return;
    }
    const current = this.expandedHotelIds();
    this.expandedHotelIds.set(
      current.includes(hotelId) ? current.filter((id) => id !== hotelId) : [...current, hotelId]
    );
  }

  protected save(user: AppUser): void {
    const actor = this.currentAppUser();
    const id = user.id;
    if (!actor || id == null) {
      return;
    }

    const draft = this.drafts[id];
    if (!draft) {
      this.error.set('Staff draft missing.');
      return;
    }

    if (!draft.name.trim()) {
      this.error.set('Name is required.');
      return;
    }
    if (this.needsGroupAssignment(draft.accessRole) && draft.assignedHotelGroupId == null) {
      this.error.set('Select a hotel group for this role.');
      return;
    }
    if (this.needsHotelAssignment(draft.accessRole) && draft.assignedHotelId == null) {
      this.error.set('Select a hotel for this role.');
      return;
    }
    if (this.needsEmployeeRole(draft.accessRole) && draft.employeeRole == null) {
      this.error.set('Select an operational role for staff.');
      return;
    }

    this.markBusy(id, true);
    this.error.set('');

    this.api
      .updateAppUser(id, {
        name: draft.name.trim(),
        phone: draft.phone.trim() || null,
        accessRole: draft.accessRole,
        employeeRole: this.needsEmployeeRole(draft.accessRole) ? draft.employeeRole : null,
        active: draft.active,
        status: draft.active ? 'ACTIVE' : 'DISABLED',
        assignedHotelGroup: this.needsGroupAssignment(draft.accessRole)
          ? { id: draft.assignedHotelGroupId ?? undefined }
          : null,
        assignedHotel: this.needsHotelAssignment(draft.accessRole)
          ? { id: draft.assignedHotelId ?? undefined }
          : null
      })
      .subscribe({
        next: (updated) => {
          this.markBusy(id, false);
          this.users.set(this.users().map((existing) => (existing.id === updated.id ? updated : existing)));
          this.seedDrafts(this.users());
          this.expandedUserId.set(null);
        },
        error: () => {
          this.markBusy(id, false);
          this.error.set('Failed to save staff member.');
        }
      });
  }

  protected roleOptionsForUser(): AccessRole[] {
    const actor = this.currentAppUser();
    if (!actor) {
      return [];
    }
    if (this.isSuperAdmin(actor)) {
      return ACCESS_ROLES.filter((role) =>
        ['SUPERADMIN', 'HOTEL_GROUP_ADMIN', 'HOTEL_ADMIN', 'STAFF'].includes(role)
      );
    }
    if (this.isHotelGroupAdmin(actor)) {
      return ACCESS_ROLES.filter((role) => ['HOTEL_ADMIN', 'STAFF'].includes(role));
    }
    if (this.isHotelAdmin(actor)) {
      return ACCESS_ROLES.filter((role) => role === 'STAFF');
    }
    return [];
  }

  protected assignableHotelGroups(): HotelGroup[] {
    const actor = this.currentAppUser();
    if (!actor) {
      return [];
    }
    if (this.isSuperAdmin(actor)) {
      return this.hotelGroups();
    }
    if (this.isHotelGroupAdmin(actor) && actor.assignedHotelGroup?.id != null) {
      return this.hotelGroups().filter((group) => group.id === actor.assignedHotelGroup?.id);
    }
    return [];
  }

  protected filteredHotelsForUser(userId: number): Hotel[] {
    const actor = this.currentAppUser();
    const draft = this.drafts[userId];
    if (!actor || !draft) {
      return [];
    }

    let hotels = this.assignableHotels(actor);
    if (draft.assignedHotelGroupId != null) {
      hotels = hotels.filter((hotel) => hotel.hotelGroup?.id === draft.assignedHotelGroupId);
    }
    return hotels;
  }

  protected needsGroupAssignment(role: AccessRole): boolean {
    return role === 'HOTEL_GROUP_ADMIN' || role === 'ADMIN';
  }

  protected needsHotelAssignment(role: AccessRole): boolean {
    return role === 'HOTEL_ADMIN' || role === 'STAFF';
  }

  protected needsEmployeeRole(role: AccessRole): boolean {
    return role === 'STAFF';
  }

  protected isBusy(userId: number | undefined): boolean {
    return userId != null && this.busyIds().includes(userId);
  }

  protected onRoleChange(userId: number): void {
    const actor = this.currentAppUser();
    const draft = this.drafts[userId];
    if (!draft || !actor) {
      return;
    }

    if (!this.needsEmployeeRole(draft.accessRole)) {
      draft.employeeRole = null;
    }
    if (!this.needsGroupAssignment(draft.accessRole)) {
      draft.assignedHotelGroupId = null;
    }
    if (!this.needsHotelAssignment(draft.accessRole)) {
      draft.assignedHotelId = null;
    }

    if (this.needsGroupAssignment(draft.accessRole) && draft.assignedHotelGroupId == null) {
      draft.assignedHotelGroupId = actor.assignedHotelGroup?.id ?? null;
    }
    if (this.needsHotelAssignment(draft.accessRole) && draft.assignedHotelId == null) {
      draft.assignedHotelId = actor.assignedHotel?.id ?? null;
    }
    if (this.needsEmployeeRole(draft.accessRole) && draft.employeeRole == null) {
      draft.employeeRole = 'HOUSEKEEPING';
    }
  }

  protected userRoleLabel(user: AppUser): string {
    if (user.accessRole === 'STAFF' && user.employeeRole) {
      return user.employeeRole.replaceAll('_', ' ');
    }
    return user.accessRole?.replaceAll('_', ' ') || 'STAFF';
  }

  protected showPlatformSection(): boolean {
    const actor = this.currentAppUser();
    return actor != null && this.isSuperAdmin(actor);
  }

  protected showGroupLeadershipSection(): boolean {
    const actor = this.currentAppUser();
    return actor != null && this.isSuperAdmin(actor);
  }

  protected showHotelAdminSection(): boolean {
    const actor = this.currentAppUser();
    return actor != null && (this.isSuperAdmin(actor) || this.isHotelGroupAdmin(actor));
  }

  protected groupSummary(groupNode: GroupNode): string {
    if (this.showGroupLeadershipSection()) {
      return `${groupNode.groupAdmins.length} group admin(s), ${groupNode.hotels.length} hotel(s)`;
    }
    return `${groupNode.hotels.length} hotel(s)`;
  }

  protected hotelSummary(hotelNode: HotelNode): string {
    if (this.showHotelAdminSection()) {
      return `${hotelNode.hotelAdmins.length} admin(s), ${hotelNode.staff.length} staff member(s)`;
    }
    return `${hotelNode.staff.length} staff member(s)`;
  }

  protected setRoleFilter(role: 'ALL' | AccessRole): void {
    this.roleFilter.set(role);
  }

  protected setStatusFilter(status: 'ALL' | 'ACTIVE' | 'DISABLED'): void {
    this.statusFilter.set(status);
  }

  private async loadCurrentAppUserAndRefresh(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const firebaseUser = this.auth.currentUser() ?? (await firstValueFrom(this.auth.authState$));
      if (!firebaseUser) {
        this.error.set('Not signed in.');
        this.loading.set(false);
        return;
      }

      const appUser = await firstValueFrom(this.api.getAppUserByFirebaseUid(firebaseUser.uid));
      this.currentAppUser.set(appUser);
      this.refreshAll();
    } catch {
      this.error.set('Failed to load your profile.');
      this.loading.set(false);
    }
  }

  private seedDrafts(users: AppUser[]): void {
    for (const user of users) {
      if (user.id == null) {
        continue;
      }
      this.drafts[user.id] = {
        name: user.name,
        phone: user.phone ?? '',
        accessRole: user.accessRole ?? 'STAFF',
        employeeRole: user.employeeRole ?? null,
        active: user.active ?? true,
        assignedHotelGroupId: user.assignedHotelGroup?.id ?? null,
        assignedHotelId: user.assignedHotel?.id ?? null
      };
    }
  }

  private assignableHotels(actor: AppUser): Hotel[] {
    if (this.isSuperAdmin(actor)) {
      return this.hotels();
    }
    if (this.isHotelGroupAdmin(actor)) {
      return this.hotels().filter((hotel) => hotel.hotelGroup?.id === actor.assignedHotelGroup?.id);
    }
    if (this.isHotelAdmin(actor)) {
      return this.hotels().filter((hotel) => hotel.id === actor.assignedHotel?.id);
    }
    return [];
  }

  private markBusy(id: number, busy: boolean): void {
    const current = this.busyIds();
    this.busyIds.set(busy ? [...current, id] : current.filter((item) => item !== id));
  }

  private isSuperAdmin(user: AppUser): boolean {
    return user.accessRole === 'SUPERADMIN';
  }

  private isHotelGroupAdmin(user: AppUser): boolean {
    return user.accessRole === 'HOTEL_GROUP_ADMIN' || user.accessRole === 'ADMIN';
  }

  private isHotelAdmin(user: AppUser): boolean {
    return user.accessRole === 'HOTEL_ADMIN';
  }
}
