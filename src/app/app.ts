import { Component, ViewChild } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { App as CapApp } from '@capacitor/app';
import { PushNotificationsService } from './core/notifications/push-notifications.service';
import { LazyRouteRecoveryService } from './core/services/lazy-route-recovery.service';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  @ViewChild(IonRouterOutlet, { static: true })
  private routerOutlet?: IonRouterOutlet;

  constructor(
    private readonly pushNotifications: PushNotificationsService,
    private readonly lazyRouteRecovery: LazyRouteRecoveryService
  ) {
    void this.pushNotifications.start();
    void this.lazyRouteRecovery.warmRoutes();
    this.registerBackButton();
  }

  private registerBackButton(): void {
    void CapApp.addListener('backButton', () => {
      if (this.routerOutlet?.canGoBack()) {
        void this.routerOutlet.pop();
      } else {
        void CapApp.exitApp();
      }
    });
  }
}
