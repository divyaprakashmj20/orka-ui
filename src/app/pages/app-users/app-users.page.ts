import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
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
import {
  ACCESS_ROLES,
  AccessRole,
  AppUser,
  AppUserApprovalPayload,
  EMPLOYEE_ROLES,
  EmployeeRole,
  Hotel,
  HotelGroup
} from '../../core/models/orca.models';
import { FirebaseAuthService } from '../../core/auth/firebase-auth.service';
import { OrcaApiService } from '../../core/services/orca-api.service';

type Draft = {
  accessRole: AccessRole;
  employeeRole: EmployeeRole | null;
  active: boolean;
  assignedHotelGroupId: number | null;
  assignedHotelId: number | null;
};

@Component({
  selector: 'app-app-users-page',
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
  templateUrl: './app-users.page.html',
  styleUrl: './app-users.page.scss'
})
export class AppUsersPage implements OnInit {
  private readonly auth = inject(FirebaseAuthService);

  protected readonly currentAppUser = signal<AppUser | null>(null);
  protected readonly pendingUsers = signal<AppUser[]>([]);
  protected readonly hotelGroups = signal<HotelGroup[]>([]);
  protected readonly hotels = signal<Hotel[]>([]);
  protected readonly employeeRoles = EMPLOYEE_ROLES;
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly busyIds = signal<number[]>([]);

  protected drafts: Record<number, Draft> = {};

  constructor(private readonly api: OrcaApiService) {}

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
    this.api.listPendingAppUsers().subscribe({
      next: (users) => {
        const visibleUsers = this.filterPendingUsersForActor(users, actor);
        this.pendingUsers.set(visibleUsers);
        this.seedDrafts(visibleUsers);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load pending users.');
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

  protected approve(user: AppUser): void {
    const actor = this.currentAppUser();
    const id = user.id;
    if (id == null || !actor) {
      return;
    }
    const draft = this.drafts[id];
    if (!draft) {
      this.error.set('Approval draft missing.');
      return;
    }

    const payload: AppUserApprovalPayload = {
      accessRole: draft.accessRole,
      employeeRole: this.needsEmployeeRole(draft.accessRole) ? draft.employeeRole : null,
      active: draft.active,
      assignedHotelGroupId: this.needsGroupAssignment(draft.accessRole)
        ? draft.assignedHotelGroupId
        : null,
      assignedHotelId: this.needsHotelAssignment(draft.accessRole) ? draft.assignedHotelId : null
    };

    if (this.needsGroupAssignment(draft.accessRole) && payload.assignedHotelGroupId == null) {
      this.error.set('Select a hotel group for this role.');
      return;
    }
    if (this.needsHotelAssignment(draft.accessRole) && payload.assignedHotelId == null) {
      this.error.set('Select a hotel for this role.');
      return;
    }
    if (this.needsEmployeeRole(draft.accessRole) && payload.employeeRole == null) {
      this.error.set('Select an operational role for this user.');
      return;
    }
    if (!this.canActorApproveSelection(actor, user, payload)) {
      this.error.set('You can only approve users and assignments within your scope.');
      return;
    }

    this.markBusy(id, true);
    this.error.set('');
    this.api.approveAppUser(id, payload).subscribe({
      next: () => {
        this.markBusy(id, false);
        this.removeFromPending(id);
      },
      error: () => {
        this.markBusy(id, false);
        this.error.set('Approval failed.');
      }
    });
  }

  protected reject(user: AppUser): void {
    const actor = this.currentAppUser();
    const id = user.id;
    if (id == null || !actor || !this.canActorManageUser(actor, user)) {
      return;
    }
    if (!window.confirm(`Reject ${user.email}?`)) {
      return;
    }

    this.markBusy(id, true);
    this.error.set('');
    this.api.updateAppUser(id, { status: 'REJECTED' }).subscribe({
      next: () => {
        this.markBusy(id, false);
        this.removeFromPending(id);
      },
      error: () => {
        this.markBusy(id, false);
        this.error.set('Reject failed.');
      }
    });
  }

  protected onRoleChange(userId: number): void {
    const draft = this.drafts[userId];
    if (!draft) {
      return;
    }
    if (!this.needsGroupAssignment(draft.accessRole)) {
      draft.assignedHotelGroupId = null;
    }
    if (!this.needsHotelAssignment(draft.accessRole)) {
      draft.assignedHotelId = null;
    }
    if (!this.needsEmployeeRole(draft.accessRole)) {
      draft.employeeRole = null;
    }
  }

  protected filteredHotelsForUser(userId: number): Hotel[] {
    const draft = this.drafts[userId];
    const actor = this.currentAppUser();
    if (!draft) {
      return this.assignableHotels(actor);
    }
    let hotels = this.assignableHotels(actor);
    if (!draft.assignedHotelGroupId) {
      return hotels;
    }
    return hotels.filter((hotel) => hotel.hotelGroup?.id === draft.assignedHotelGroupId);
  }

  protected assignableHotelGroups(): HotelGroup[] {
    const actor = this.currentAppUser();
    if (!actor) {
      return [];
    }
    if (this.isSuperAdmin(actor)) {
      return this.hotelGroups();
    }
    if (this.isHotelGroupAdmin(actor)) {
      return actor.assignedHotelGroup?.id == null
        ? []
        : this.hotelGroups().filter((g) => g.id === actor.assignedHotelGroup?.id);
    }
    return [];
  }

  protected roleOptionsForUser(user: AppUser): AccessRole[] {
    const actor = this.currentAppUser();
    if (!actor || !this.canActorManageUser(actor, user)) {
      return [];
    }
    if (this.isSuperAdmin(actor)) {
      return ACCESS_ROLES.filter((r) =>
        ['SUPERADMIN', 'HOTEL_GROUP_ADMIN', 'HOTEL_ADMIN', 'STAFF'].includes(r)
      );
    }
    if (this.isHotelGroupAdmin(actor)) {
      return ACCESS_ROLES.filter((r) => ['HOTEL_ADMIN', 'STAFF'].includes(r));
    }
    if (this.isHotelAdmin(actor)) {
      return ACCESS_ROLES.filter((r) => ['STAFF'].includes(r));
    }
    return [];
  }

  protected isBusy(userId: number | undefined): boolean {
    return userId != null && this.busyIds().includes(userId);
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

  private async loadCurrentAppUserAndRefresh(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const firebaseUser =
        this.auth.currentUser() ?? (await firstValueFrom(this.auth.authState$));
      if (!firebaseUser) {
        this.currentAppUser.set(null);
        this.error.set('Not signed in.');
        this.loading.set(false);
        return;
      }

      const appUser = await firstValueFrom(this.api.getAppUserByFirebaseUid(firebaseUser.uid));
      this.currentAppUser.set(appUser);
      this.refreshAll();
    } catch {
      this.currentAppUser.set(null);
      this.error.set('Failed to load your profile.');
      this.loading.set(false);
    }
  }

  private seedDrafts(users: AppUser[]): void {
    const actor = this.currentAppUser();
    for (const user of users) {
      if (user.id == null || this.drafts[user.id]) {
        continue;
      }
      const defaultRole = this.defaultRoleForActor(actor, user);
      const scopedGroupId = this.defaultAssignedHotelGroupId(actor, user);
      const scopedHotelId = this.defaultAssignedHotelId(actor, user);
      this.drafts[user.id] = {
        accessRole: defaultRole,
        employeeRole: this.defaultEmployeeRole(defaultRole, user),
        active: true,
        assignedHotelGroupId: scopedGroupId,
        assignedHotelId: scopedHotelId
      };
    }
  }

  private markBusy(id: number, busy: boolean): void {
    const current = this.busyIds();
    this.busyIds.set(busy ? [...current, id] : current.filter((x) => x !== id));
  }

  private removeFromPending(id: number): void {
    this.pendingUsers.set(this.pendingUsers().filter((u) => u.id !== id));
    delete this.drafts[id];
  }

  private filterPendingUsersForActor(users: AppUser[], actor: AppUser): AppUser[] {
    if (this.isSuperAdmin(actor)) {
      return users;
    }

    if (this.isHotelGroupAdmin(actor)) {
      const actorGroupId = actor.assignedHotelGroup?.id;
      if (actorGroupId == null) {
        return [];
      }
      return users.filter(
        (user) =>
          user.requestedHotel?.id != null &&
          user.requestedHotelGroup?.id === actorGroupId
      );
    }

    if (this.isHotelAdmin(actor)) {
      const actorHotelId = actor.assignedHotel?.id;
      if (actorHotelId == null) {
        return [];
      }
      return users.filter((user) => user.requestedHotel?.id === actorHotelId);
    }

    return [];
  }

  private canActorManageUser(actor: AppUser, user: AppUser): boolean {
    if (this.isSuperAdmin(actor)) {
      return true;
    }
    if (this.isHotelGroupAdmin(actor)) {
      return (
        actor.assignedHotelGroup?.id != null &&
        user.requestedHotel?.id != null &&
        user.requestedHotelGroup?.id === actor.assignedHotelGroup.id
      );
    }
    if (this.isHotelAdmin(actor)) {
      return actor.assignedHotel?.id != null && user.requestedHotel?.id === actor.assignedHotel.id;
    }
    return false;
  }

  private canActorApproveSelection(
    actor: AppUser,
    user: AppUser,
    payload: AppUserApprovalPayload
  ): boolean {
    if (!this.canActorManageUser(actor, user)) {
      return false;
    }

    if (this.isSuperAdmin(actor)) {
      return true;
    }

    if (this.isHotelGroupAdmin(actor)) {
      if (!['HOTEL_ADMIN', 'STAFF'].includes(payload.accessRole)) {
        return false;
      }
      if (payload.accessRole === 'HOTEL_ADMIN' || payload.accessRole === 'STAFF') {
        const hotel = this.hotels().find((h) => h.id === payload.assignedHotelId);
        return (
          hotel != null &&
          actor.assignedHotelGroup?.id != null &&
          hotel.hotelGroup?.id === actor.assignedHotelGroup.id
        );
      }
      return false;
    }

    if (this.isHotelAdmin(actor)) {
      return (
        payload.accessRole === 'STAFF' &&
        actor.assignedHotel?.id != null &&
        payload.assignedHotelId === actor.assignedHotel.id
      );
    }

    return false;
  }

  private assignableHotels(actor: AppUser | null): Hotel[] {
    if (!actor) {
      return [];
    }
    if (this.isSuperAdmin(actor)) {
      return this.hotels();
    }
    if (this.isHotelGroupAdmin(actor)) {
      const groupId = actor.assignedHotelGroup?.id;
      return groupId == null ? [] : this.hotels().filter((h) => h.hotelGroup?.id === groupId);
    }
    if (this.isHotelAdmin(actor)) {
      const hotelId = actor.assignedHotel?.id;
      return hotelId == null ? [] : this.hotels().filter((h) => h.id === hotelId);
    }
    return [];
  }

  private defaultRoleForActor(actor: AppUser | null, user: AppUser): AccessRole {
    if (actor && this.isHotelAdmin(actor)) {
      return 'STAFF';
    }
    if (actor && this.isHotelGroupAdmin(actor)) {
      return 'HOTEL_ADMIN';
    }
    return user.requestedHotel ? 'STAFF' : 'HOTEL_GROUP_ADMIN';
  }

  private defaultAssignedHotelGroupId(actor: AppUser | null, user: AppUser): number | null {
    if (actor && this.isHotelGroupAdmin(actor)) {
      return actor.assignedHotelGroup?.id ?? null;
    }
    if (actor && this.isHotelAdmin(actor)) {
      return actor.assignedHotel?.hotelGroup?.id ?? null;
    }
    return user.requestedHotelGroup?.id ?? user.requestedHotel?.hotelGroup?.id ?? null;
  }

  private defaultAssignedHotelId(actor: AppUser | null, user: AppUser): number | null {
    if (actor && this.isHotelAdmin(actor)) {
      return actor.assignedHotel?.id ?? null;
    }
    return user.requestedHotel?.id ?? null;
  }

  private defaultEmployeeRole(role: AccessRole, user: AppUser): EmployeeRole | null {
    if (role === 'STAFF') {
      return user.employeeRole ?? 'HOUSEKEEPING';
    }
    return null;
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
