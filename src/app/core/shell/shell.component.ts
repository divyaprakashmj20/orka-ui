import { DOCUMENT } from '@angular/common';
import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  barChartOutline,
  bedOutline,
  businessOutline,
  chevronForwardOutline,
  closeOutline,
  homeOutline,
  logOutOutline,
  menuOutline,
  moon,
  moonOutline,
  notificationsOutline,
  peopleOutline,
  personAddOutline,
  personCircleOutline,
  sparklesOutline,
  sunny,
  sunnyOutline,
  wifiOutline,
} from 'ionicons/icons';
import { Subscription, firstValueFrom } from 'rxjs';
import { FirebaseAuthService } from '../auth/firebase-auth.service';
import { AppUser, AccessRole, ServiceRequest } from '../models/orca.models';
import { PushNotificationsService } from '../notifications/push-notifications.service';
import { OrcaApiService } from '../services/orca-api.service';
import { OrkaSseService } from '../services/orka-sse.service';

type NavItem = {
  label: string;
  path: string;
  icon: string;
  roles: AccessRole[];
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',      path: '/',            icon: 'home-outline',         roles: ['SUPERADMIN','HOTEL_GROUP_ADMIN','HOTEL_ADMIN','ADMIN','STAFF'] },
  { label: 'Requests',       path: '/requests',    icon: 'sparkles-outline',     roles: ['SUPERADMIN','HOTEL_GROUP_ADMIN','HOTEL_ADMIN','ADMIN','STAFF'] },
  { label: 'Rooms',          path: '/rooms',       icon: 'bed-outline',          roles: ['SUPERADMIN','HOTEL_GROUP_ADMIN','HOTEL_ADMIN','ADMIN'] },
  { label: 'Staff',          path: '/staff',       icon: 'people-outline',       roles: ['SUPERADMIN','HOTEL_GROUP_ADMIN','HOTEL_ADMIN','ADMIN'] },
  { label: 'User Approvals', path: '/app-users',   icon: 'person-add-outline',   roles: ['SUPERADMIN','HOTEL_GROUP_ADMIN','HOTEL_ADMIN','ADMIN'] },
  { label: 'Hotels',         path: '/hotels',      icon: 'home-outline',         roles: ['SUPERADMIN','HOTEL_GROUP_ADMIN','ADMIN'] },
  { label: 'Hotel Groups',   path: '/hotel-groups',icon: 'business-outline',     roles: ['SUPERADMIN'] },
  { label: 'Reports',        path: '/reports',     icon: 'bar-chart-outline',    roles: ['SUPERADMIN','HOTEL_GROUP_ADMIN','HOTEL_ADMIN','ADMIN'] },
  { label: 'Profile',        path: '/profile',     icon: 'person-circle-outline',roles: ['SUPERADMIN','HOTEL_GROUP_ADMIN','HOTEL_ADMIN','ADMIN','STAFF'] },
];

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent implements OnInit, OnDestroy {
  @Input() pageTitle = '';
  @Input() pageSubtitle = '';

  private readonly document  = inject(DOCUMENT);
  protected readonly auth      = inject(FirebaseAuthService);
  private readonly api       = inject(OrcaApiService);
  private readonly router    = inject(Router);
  private readonly push      = inject(PushNotificationsService);

  private readonly sseService = inject(OrkaSseService);
  private toastSub?: Subscription;

  protected readonly appUser     = signal<AppUser | null>(null);
  protected readonly sidebarOpen = signal(false);
  protected readonly loggingOut  = signal(false);
  protected readonly logoutError = signal('');
  protected readonly isDark      = signal(true);
  protected readonly isOnline    = signal(typeof navigator !== 'undefined' ? navigator.onLine : true);
  protected readonly requestsUnreadCount = toSignal(this.sseService.unreadCount$, { initialValue: 0 });
  /** The request shown in the toast. Null = toast hidden. */
  protected readonly toastRequest = signal<ServiceRequest | null>(null);

  protected readonly visibleNav = computed(() => {
    const role = this.appUser()?.accessRole;
    if (!role) return [];
    return NAV_ITEMS.filter(n => n.roles.includes(role));
  });

  protected readonly userInitials = computed(() => {
    const name = this.appUser()?.name ?? this.auth.user()?.email ?? '?';
    return name.slice(0, 2).toUpperCase();
  });

  protected readonly userScopeLine = computed(() => {
    const u = this.appUser();
    if (!u) return '';
    return u.assignedHotel?.name ?? u.assignedHotelGroup?.name ?? 'Platform';
  });

  protected readonly roleDisplay = computed(() => {
    return (this.appUser()?.accessRole ?? 'STAFF').replace(/_/g, ' ');
  });

  protected readonly displayName = computed(() =>
    this.appUser()?.name ?? this.auth.user()?.email ?? '—'
  );

  constructor() {
    addIcons({
      homeOutline, sparklesOutline, bedOutline, peopleOutline,
      personAddOutline, businessOutline, logOutOutline, menuOutline,
      chevronForwardOutline, alertCircleOutline, moonOutline, sunnyOutline,
      moon, sunny, notificationsOutline, closeOutline,
      barChartOutline, personCircleOutline, wifiOutline
    });
    // Restore persisted theme
    const saved = localStorage.getItem('orka-theme');
    const dark = saved !== 'light';
    this.isDark.set(dark);
    this.applyTheme(dark);

    // Track online/offline state
    if (typeof window !== 'undefined') {
      window.addEventListener('online',  () => this.isOnline.set(true));
      window.addEventListener('offline', () => this.isOnline.set(false));
    }
  }

  ngOnInit(): void {
    void this.loadUser();
    // Drive toast from SSE service — a new request sets latestNewRequest$,
    // navigating to requests clears it.
    this.toastSub = this.sseService.latestNewRequest$.subscribe((req) => {
      this.toastRequest.set(req);
    });
  }

  ngOnDestroy(): void {
    this.toastSub?.unsubscribe();
  }

  protected dismissToast(): void {
    // Hide the toast locally without clearing the unread count.
    this.toastRequest.set(null);
  }

  protected goToRequests(): void {
    this.dismissToast();
    void this.router.navigateByUrl('/requests');
  }

  protected toastTypeLabel(req: ServiceRequest): string {
    return req.type?.replace(/_/g, ' ') ?? 'Request';
  }

  protected toggleTheme(): void {
    const next = !this.isDark();
    this.isDark.set(next);
    this.applyTheme(next);
    localStorage.setItem('orka-theme', next ? 'dark' : 'light');
  }

  private applyTheme(dark: boolean): void {
    this.document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }

  protected toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  protected closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  protected navigate(path: string): void {
    this.closeSidebar();
    void this.router.navigateByUrl(path);
  }

  protected isActive(path: string): boolean {
    if (path === '/') return this.router.url === '/';
    return this.router.url.startsWith(path);
  }

  protected async logout(): Promise<void> {
    try {
      this.loggingOut.set(true);
      this.logoutError.set('');
      await this.push.unregisterCurrentDeviceToken();
      await this.auth.signOutAndWaitForState();
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    } catch {
      this.logoutError.set('Sign out failed — please try again.');
    } finally {
      this.loggingOut.set(false);
    }
  }

  private async loadUser(): Promise<void> {
    try {
      const fb = this.auth.currentUser() ?? await firstValueFrom(this.auth.authState$);
      if (!fb) return;
      const user = await firstValueFrom(this.api.getAppUserByFirebaseUid(fb.uid));
      this.appUser.set(user);
    } catch { /* non-critical */ }
  }
}
