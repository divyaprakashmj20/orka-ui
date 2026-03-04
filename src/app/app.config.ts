import { APP_INITIALIZER, ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { IonicRouteStrategy } from '@ionic/angular/common';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';

import { routes } from './app.routes';
import { firebaseAuthInterceptor } from './core/auth/firebase-auth.interceptor';
import { FirebaseConfigService } from './core/firebase/firebase-config.service';

const firebaseConfigInitializer = () => {
  const configService = inject(FirebaseConfigService);
  return () => configService.load();
};

const isAndroid = Capacitor.getPlatform() === 'android';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([firebaseAuthInterceptor])),
    provideRouter(routes),
    provideIonicAngular({ mode: 'md', animated: !isAndroid }),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    {
      provide: APP_INITIALIZER,
      useFactory: firebaseConfigInitializer,
      multi: true
    },
    provideFirebaseApp(() => initializeApp(inject(FirebaseConfigService).getConfig())),
    provideAuth(() => getAuth())
  ]
};
