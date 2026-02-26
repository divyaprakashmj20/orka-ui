import { Injectable, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { User } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';
import { FirebaseAuthService } from '../auth/firebase-auth.service';
import { OrcaApiService } from '../services/orca-api.service';
import { PushEventsService } from './push-events.service';

type PushPlugin = {
  checkPermissions: () => Promise<{ receive?: string }>;
  requestPermissions: () => Promise<{ receive?: string }>;
  register: () => Promise<void>;
  addListener: (eventName: string, listener: (event: any) => void) => Promise<any>;
};

@Injectable({ providedIn: 'root' })
export class PushNotificationsService {
  private readonly auth = inject(FirebaseAuthService);
  private readonly api = inject(OrcaApiService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly events = inject(PushEventsService);

  private pushPlugin: PushPlugin | null = null;
  private started = false;
  private currentToken: string | null = null;
  private lastRegisteredKey: string | null = null;
  private syncInFlight = false;

  constructor() {
    this.auth.authState$.subscribe({
      next: (user) => {
        void this.handleAuthStateChange(user);
      }
    });
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;

    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      const loaded = await this.loadPushPlugin();
      if (!loaded) {
        return;
      }
      this.pushPlugin = loaded.plugin;

      await this.registerListeners();

      const permission = await this.pushPlugin.checkPermissions();
      let receive = permission.receive;

      if (receive === 'prompt') {
        receive = (await this.pushPlugin.requestPermissions()).receive;
      }

      if (receive !== 'granted') {
        console.warn('Push notifications permission not granted.');
        return;
      }

      await this.pushPlugin.register();
    } catch (error) {
      console.error('Push notification initialization failed.', error);
    }
  }

  async unregisterCurrentDeviceToken(): Promise<void> {
    if (!this.currentToken || !this.lastRegisteredKey) {
      return;
    }

    try {
      await firstValueFrom(this.api.unregisterDeviceToken({ fcmToken: this.currentToken }));
    } catch (error) {
      console.warn('Failed to unregister device token from backend.', error);
    } finally {
      this.lastRegisteredKey = null;
    }
  }

  private async loadPushPlugin(): Promise<{ plugin: PushPlugin } | null> {
    try {
      const module = await import('@capacitor/push-notifications');
      return { plugin: module.PushNotifications as unknown as PushPlugin };
    } catch (error) {
      console.warn(
        'Capacitor Push Notifications plugin is not installed yet. Native push is disabled.',
        error
      );
      return null;
    }
  }

  private async registerListeners(): Promise<void> {
    if (!this.pushPlugin) {
      return;
    }

    await this.pushPlugin.addListener('registration', (tokenEvent: { value?: string }) => {
      this.zone.run(() => {
        const token = tokenEvent?.value?.trim();
        if (!token) {
          return;
        }
        this.currentToken = token;
        void this.syncRegistration();
      });
    });

    await this.pushPlugin.addListener('registrationError', (error: unknown) => {
      console.error('Push registration error.', error);
    });

    await this.pushPlugin.addListener('pushNotificationReceived', (notification: any) => {
      this.zone.run(() => this.handleIncomingNotification(notification, 'foreground'));
    });

    await this.pushPlugin.addListener('pushNotificationActionPerformed', (action: any) => {
      this.zone.run(() => {
        this.handleIncomingNotification(action?.notification, 'tap');
        void this.router.navigateByUrl('/requests');
      });
    });
  }

  private async handleAuthStateChange(user: User | null): Promise<void> {
    if (!user) {
      await this.unregisterCurrentDeviceToken();
      return;
    }

    await this.syncRegistration();
  }

  private async syncRegistration(): Promise<void> {
    if (this.syncInFlight) {
      return;
    }
    if (!this.currentToken) {
      return;
    }

    const user = this.auth.currentUser();
    if (!user) {
      return;
    }

    const key = `${user.uid}:${this.currentToken}`;
    if (this.lastRegisteredKey === key) {
      return;
    }

    this.syncInFlight = true;
    try {
      await firstValueFrom(
        this.api.registerDeviceToken({
          firebaseUid: user.uid,
          fcmToken: this.currentToken,
          platform: 'ANDROID'
        })
      );
      this.lastRegisteredKey = key;
    } catch (error) {
      console.warn('Failed to register device token with backend.', error);
    } finally {
      this.syncInFlight = false;
    }
  }

  private handleIncomingNotification(
    notification: { data?: Record<string, unknown> } | null | undefined,
    source: 'foreground' | 'tap'
  ): void {
    const data = notification?.data ?? {};
    const eventType = String(data['eventType'] ?? '');
    if (eventType !== 'NEW_REQUEST') {
      return;
    }

    this.events.emit({
      kind: 'NEW_REQUEST',
      source,
      requestId: this.toNumber(data['requestId']),
      hotelId: this.toNumber(data['hotelId']),
      roomId: this.toNumber(data['roomId']),
      rawData: data
    });
  }

  private toNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
