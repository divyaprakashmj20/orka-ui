import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonSegment,
  IonSegmentButton,
  IonToolbar
} from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { FirebaseAuthService } from '../../core/auth/firebase-auth.service';
import { AppUser, AccessRole } from '../../core/models/orca.models';
import { PushNotificationsService } from '../../core/notifications/push-notifications.service';
import { OrcaApiService } from '../../core/services/orca-api.service';

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
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonChip,
    IonIcon,
    IonTitle,
    IonContent,
    IonSegment,
    IonSegmentButton
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
  protected readonly paletteHue = signal(20);

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

  protected readonly paletteReadout = computed(() => {
    const hue = this.paletteHue();
    return [
      { label: '--orka-hue', value: `${hue}`, swatch: `hsl(${hue} 61% 46%)` },
      {
        label: '--orka-accent',
        value: this.hslToHex(hue, 61, 46),
        swatch: `hsl(${hue} 61% 46%)`
      },
      {
        label: '--orka-accent-deep',
        value: this.hslToHex(hue, 66, 34),
        swatch: `hsl(${hue} 66% 34%)`
      },
      {
        label: '--orka-secondary',
        value: this.hslToHex((hue + 142) % 360, 39, 32),
        swatch: `hsl(${(hue + 142) % 360} 39% 32%)`
      },
      {
        label: '--orka-bg-start',
        value: this.hslToHex(30, 42, 91),
        swatch: 'hsl(30 42% 91%)'
      },
      {
        label: '--orka-bg-end',
        value: this.hslToHex(42, 53, 98),
        swatch: 'hsl(42 53% 98%)'
      }
    ];
  });

  constructor() {
    effect(() => {
      this.document.documentElement.style.setProperty('--orka-hue', String(this.paletteHue()));
    });
  }

  ngOnInit(): void {
    void this.loadAppUser();
  }

  protected setTab(tab: string | number | undefined): void {
    if (tab === 'overview' || tab === 'operations' || tab === 'admin') {
      this.activeTab.set(tab);
    }
  }

  protected updatePaletteHue(value: string | number | null | undefined): void {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return;
    }
    this.paletteHue.set(Math.max(0, Math.min(360, Math.round(numeric))));
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
}
