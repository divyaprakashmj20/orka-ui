import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, OnInit, WritableSignal, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { IonIcon, IonButton } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  bedOutline,
  businessOutline,
  chevronForwardOutline,
  homeOutline,
  peopleOutline,
  personAddOutline,
  sparklesOutline,
} from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';
import { FirebaseAuthService } from '../../core/auth/firebase-auth.service';
import { ShellComponent } from '../../core/shell/shell.component';
import { AppUser, AccessRole } from '../../core/models/orca.models';
import { PushNotificationsService } from '../../core/notifications/push-notifications.service';
import { OrcaApiService } from '../../core/services/orca-api.service';
import { OrkaSseService } from '../../core/services/orka-sse.service';

type DashboardTab = 'overview' | 'operations' | 'admin';

type DashboardSection = {
  title: string;
  path: string;
  note: string;
  icon: string;
  tab: DashboardTab;
  roles: AccessRole[];
};

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    CommonModule,
    IonIcon,
    IonButton,
    ShellComponent
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss'
})
export class HomePage implements OnInit {
  private readonly document = inject(DOCUMENT);
  private readonly auth = inject(FirebaseAuthService);
  private readonly pushNotifications = inject(PushNotificationsService);
  private readonly api = inject(OrcaApiService);
  private readonly router = inject(Router);

  protected readonly loggingOut = signal(false);
  protected readonly loadingProfile = signal(true);
  protected readonly authError = signal('');
  protected readonly userEmail = computed(() => this.auth.user()?.email ?? 'Signed in user');
  protected readonly appUser = signal<AppUser | null>(null);
  protected readonly activeTab = signal<DashboardTab>('overview');
  protected readonly requestsUnreadCount = toSignal(inject(OrkaSseService).unreadCount$, { initialValue: 0 });
  protected readonly paletteHue  = signal(239);
  protected readonly successHue  = signal(142);
  protected readonly warningHue  = signal(38);
  protected readonly dangerHue   = signal(0);
  // Surface knobs
  protected readonly neutralHue    = signal(235);
  protected readonly darkBgL       = signal(4);
  protected readonly darkSurfL     = signal(9);
  protected readonly darkTextL     = signal(95);
  protected readonly darkBorderA   = signal(7);
  protected readonly lightBgL      = signal(97);
  protected readonly lightSurfL    = signal(100);
  protected readonly lightTextL    = signal(5);
  protected readonly lightBorderA  = signal(7);

  protected readonly sections: DashboardSection[] = [
    {
      title: 'Live Requests',
      path: '/requests',
      note: 'Track incoming room-service, housekeeping, and maintenance work.',
      icon: 'sparkles-outline',
      tab: 'operations',
      roles: ['SUPERADMIN', 'HOTEL_GROUP_ADMIN', 'HOTEL_ADMIN', 'ADMIN', 'STAFF']
    },
    {
      title: 'Room Directory',
      path: '/rooms',
      note: 'Maintain the active room inventory used by guest QR flows.',
      icon: 'bed-outline',
      tab: 'operations',
      roles: ['SUPERADMIN', 'HOTEL_GROUP_ADMIN', 'HOTEL_ADMIN', 'ADMIN']
    },
    {
      title: 'User Approvals',
      path: '/app-users',
      note: 'Review pending users and grant scoped access at the right level.',
      icon: 'person-add-outline',
      tab: 'admin',
      roles: ['SUPERADMIN', 'HOTEL_GROUP_ADMIN', 'HOTEL_ADMIN', 'ADMIN']
    },
    {
      title: 'Staff Management',
      path: '/staff',
      note: 'Edit the active team, adjust roles, and disable access without touching approvals.',
      icon: 'people-outline',
      tab: 'admin',
      roles: ['SUPERADMIN', 'HOTEL_GROUP_ADMIN', 'HOTEL_ADMIN', 'ADMIN']
    },
    {
      title: 'Hotel Groups',
      path: '/hotel-groups',
      note: 'Define the top-level hotel-group structure for the platform.',
      icon: 'business-outline',
      tab: 'admin',
      roles: ['SUPERADMIN']
    },
    {
      title: 'Hotels',
      path: '/hotels',
      note: 'Create and organize hotels under the right hotel-group.',
      icon: 'home-outline',
      tab: 'admin',
      roles: ['SUPERADMIN', 'HOTEL_GROUP_ADMIN', 'ADMIN']
    }
  ] as const;

  protected readonly visibleSections = computed(() => {
    const role = this.appUser()?.accessRole;
    if (!role) {
      return [];
    }
    return this.sections.filter((section) => section.roles.includes(role));
  });

  protected readonly availableTabs = computed(() => {
    const tabs = new Set<DashboardTab>(['overview']);
    for (const section of this.visibleSections()) {
      tabs.add(section.tab);
    }
    return Array.from(tabs);
  });

  protected readonly currentSections = computed(() => {
    const activeTab = this.activeTab();
    if (activeTab === 'overview') {
      return this.visibleSections().slice(0, 4);
    }
    return this.visibleSections().filter((section) => section.tab === activeTab);
  });

  protected readonly scopeLabel = computed(() => {
    const user = this.appUser();
    if (!user) {
      return 'Loading scope';
    }
    if (user.assignedHotel?.name) {
      return user.assignedHotel.name;
    }
    if (user.assignedHotelGroup?.name) {
      return user.assignedHotelGroup.name;
    }
    if (user.requestedHotel?.name) {
      return `Requested: ${user.requestedHotel.name}`;
    }
    if (user.requestedHotelGroup?.name) {
      return `Requested: ${user.requestedHotelGroup.name}`;
    }
    return 'Platform-wide access';
  });

  protected readonly roleLabel = computed(() => {
    const role = this.appUser()?.accessRole ?? 'STAFF';
    return role.replaceAll('_', ' ');
  });

  protected readonly summaryText = computed(() => {
    const role = this.appUser()?.accessRole;
    switch (role) {
      case 'SUPERADMIN':
        return 'Control hotel groups, approve leadership roles, and monitor the full platform.';
      case 'HOTEL_GROUP_ADMIN':
      case 'ADMIN':
        return 'Manage hotels inside your group and keep approvals moving for hotel teams.';
      case 'HOTEL_ADMIN':
        return 'Coordinate staff, room coverage, and active guest requests for your hotel.';
      case 'STAFF':
        return 'Focus on live guest requests and the work queue assigned to your property.';
      default:
        return 'Role-aware tools appear here based on the access granted to this account.';
    }
  });

  protected readonly isSuperAdmin = computed(
    () => this.appUser()?.accessRole === 'SUPERADMIN'
  );

  protected timeGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 5)  return 'Good night.';
    if (hour < 12) return 'Good morning.';
    if (hour < 17) return 'Good afternoon.';
    if (hour < 21) return 'Good evening.';
    return 'Good night.';
  }

  protected readonly paletteReadout = computed(() => {
    const a = this.paletteHue();
    const s = this.successHue();
    const w = this.warningHue();
    const d = this.dangerHue();
    return [
      { label: '--o-accent',       swatch: `hsl(${a} 84% 67%)`,        value: `hsl(${a} 84% 67%)` },
      { label: '--o-accent-lt',    swatch: `hsl(${a} 87% 75%)`,        value: `hsl(${a} 87% 75%)` },
      { label: '--o-success',      swatch: `hsl(${s} 69% 45%)`,        value: `hsl(${s} 69% 45%)` },
      { label: '--o-success-dim',  swatch: `hsl(${s} 69% 45% / 0.5)`, value: `hsl(${s} 69% 45%/.12)` },
      { label: '--o-warning',      swatch: `hsl(${w} 93% 50%)`,        value: `hsl(${w} 93% 50%)` },
      { label: '--o-warning-dim',  swatch: `hsl(${w} 93% 50% / 0.5)`, value: `hsl(${w} 93% 50%/.12)` },
      { label: '--o-danger',       swatch: `hsl(${d} 84% 60%)`,        value: `hsl(${d} 84% 60%)` },
      { label: '--o-danger-dim',   swatch: `hsl(${d} 84% 60% / 0.5)`, value: `hsl(${d} 84% 60%/.12)` },
    ];
  });

  constructor() {
    addIcons({ homeOutline, sparklesOutline, bedOutline, peopleOutline, personAddOutline, businessOutline, chevronForwardOutline });
    effect(() => {
      const el = this.document.documentElement;
      el.style.setProperty('--orka-hue',          String(this.paletteHue()));
      el.style.setProperty('--orka-success-hue',   String(this.successHue()));
      el.style.setProperty('--orka-warning-hue',   String(this.warningHue()));
      el.style.setProperty('--orka-danger-hue',    String(this.dangerHue()));
      el.style.setProperty('--orka-neutral-hue',   String(this.neutralHue()));
      el.style.setProperty('--orka-d-bg-l',        String(this.darkBgL()));
      el.style.setProperty('--orka-d-surf-l',      String(this.darkSurfL()));
      el.style.setProperty('--orka-d-text-l',      String(this.darkTextL()));
      el.style.setProperty('--orka-d-border-a',    String(this.darkBorderA()));
      el.style.setProperty('--orka-l-bg-l',        String(this.lightBgL()));
      el.style.setProperty('--orka-l-surf-l',      String(this.lightSurfL()));
      el.style.setProperty('--orka-l-text-l',      String(this.lightTextL()));
      el.style.setProperty('--orka-l-border-a',    String(this.lightBorderA()));
    });
  }

  ngOnInit(): void {
    const load = (key: string, fallback: number): number => {
      const v = localStorage.getItem(key);
      return v !== null && Number.isFinite(+v) ? +v : fallback;
    };
    this.paletteHue.set(load('orka-hue-accent',    239));
    this.successHue.set(load('orka-hue-success',   142));
    this.warningHue.set(load('orka-hue-warning',    38));
    this.dangerHue.set( load('orka-hue-danger',      0));
    this.neutralHue.set(  load('orka-neutral-hue',  235));
    this.darkBgL.set(     load('orka-d-bg-l',         4));
    this.darkSurfL.set(   load('orka-d-surf-l',       9));
    this.darkTextL.set(   load('orka-d-text-l',      95));
    this.darkBorderA.set( load('orka-d-border-a',     7));
    this.lightBgL.set(    load('orka-l-bg-l',        97));
    this.lightSurfL.set(  load('orka-l-surf-l',     100));
    this.lightTextL.set(  load('orka-l-text-l',       5));
    this.lightBorderA.set(load('orka-l-border-a',     7));
    void this.loadAppUser();
  }

  protected setTab(tab: string | number | undefined): void {
    if (tab === 'overview' || tab === 'operations' || tab === 'admin') {
      this.activeTab.set(tab);
    }
  }

  protected updateHue(color: 'accent' | 'success' | 'warning' | 'danger', raw: string | number | null | undefined): void {
    const n = Math.max(0, Math.min(360, Math.round(Number(raw))));
    if (!Number.isFinite(n)) return;
    const keys: Record<string, [() => void, string]> = {
      accent:  [() => this.paletteHue.set(n), 'orka-hue-accent'],
      success: [() => this.successHue.set(n), 'orka-hue-success'],
      warning: [() => this.warningHue.set(n), 'orka-hue-warning'],
      danger:  [() => this.dangerHue.set(n),  'orka-hue-danger'],
    };
    const [setter, lsKey] = keys[color];
    setter();
    localStorage.setItem(lsKey, String(n));
  }

  protected updateSurface(key: string, raw: string | number | null | undefined, min: number, max: number): void {
    const n = Math.max(min, Math.min(max, Math.round(Number(raw))));
    if (!Number.isFinite(n)) return;
    const map: Record<string, WritableSignal<number>> = {
      'orka-neutral-hue': this.neutralHue,
      'orka-d-bg-l':      this.darkBgL,
      'orka-d-surf-l':    this.darkSurfL,
      'orka-d-text-l':    this.darkTextL,
      'orka-d-border-a':  this.darkBorderA,
      'orka-l-bg-l':      this.lightBgL,
      'orka-l-surf-l':    this.lightSurfL,
      'orka-l-text-l':    this.lightTextL,
      'orka-l-border-a':  this.lightBorderA,
    };
    map[key]?.set(n);
    localStorage.setItem(key, String(n));
  }

  protected resetPalette(): void {
    this.paletteHue.set(239);  this.successHue.set(142);
    this.warningHue.set(38);   this.dangerHue.set(0);
    this.neutralHue.set(235);
    this.darkBgL.set(4);    this.darkSurfL.set(9);
    this.darkTextL.set(95); this.darkBorderA.set(7);
    this.lightBgL.set(97);  this.lightSurfL.set(100);
    this.lightTextL.set(5); this.lightBorderA.set(7);
    [
      'orka-hue-accent','orka-hue-success','orka-hue-warning','orka-hue-danger',
      'orka-neutral-hue',
      'orka-d-bg-l','orka-d-surf-l','orka-d-text-l','orka-d-border-a',
      'orka-l-bg-l','orka-l-surf-l','orka-l-text-l','orka-l-border-a',
    ].forEach(k => localStorage.removeItem(k));
  }

  protected async logout(): Promise<void> {
    try {
      this.loggingOut.set(true);
      this.authError.set('');
      await this.pushNotifications.unregisterCurrentDeviceToken();
      await this.auth.signOutAndWaitForState();
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    } catch {
      this.authError.set('Unable to sign out right now.');
    } finally {
      this.loggingOut.set(false);
    }
  }

  private async loadAppUser(): Promise<void> {
    this.loadingProfile.set(true);
    this.authError.set('');

    try {
      const firebaseUser = this.auth.currentUser() ?? (await firstValueFrom(this.auth.authState$));
      if (!firebaseUser) {
        this.authError.set('No signed-in user found.');
        this.loadingProfile.set(false);
        return;
      }

      const appUser = await firstValueFrom(this.api.getAppUserByFirebaseUid(firebaseUser.uid));
      this.appUser.set(appUser);

      const availableTabs = this.availableTabs();
      if (!availableTabs.includes(this.activeTab())) {
        this.activeTab.set(availableTabs[0] ?? 'overview');
      }
    } catch {
      this.authError.set('Unable to load your role profile right now.');
    } finally {
      this.loadingProfile.set(false);
    }
  }

  private hslToHex(h: number, s: number, l: number): string {
    const hue = ((h % 360) + 360) % 360;
    const saturation = s / 100;
    const lightness = l / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
    const match = lightness - chroma / 2;

    let red = 0;
    let green = 0;
    let blue = 0;

    if (hue < 60) {
      red = chroma;
      green = x;
    } else if (hue < 120) {
      red = x;
      green = chroma;
    } else if (hue < 180) {
      green = chroma;
      blue = x;
    } else if (hue < 240) {
      green = x;
      blue = chroma;
    } else if (hue < 300) {
      red = x;
      blue = chroma;
    } else {
      red = chroma;
      blue = x;
    }

    const toHex = (channel: number): string =>
      Math.round((channel + match) * 255)
        .toString(16)
        .padStart(2, '0')
        .toUpperCase();

    return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
  }

  protected navigate(path: string): void {
    void this.router.navigateByUrl(path);
  }
}
