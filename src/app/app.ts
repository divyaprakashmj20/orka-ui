import { Component, ViewChild } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { App as CapApp } from '@capacitor/app';
import { PushNotificationsService } from './core/notifications/push-notifications.service';

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
    private readonly pushNotifications: PushNotificationsService
  ) {
    void this.pushNotifications.start();
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
