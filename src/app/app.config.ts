import { APP_INITIALIZER, ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app.routes';
import { firebaseAuthInterceptor } from './core/auth/firebase-auth.interceptor';
import { FirebaseConfigService } from './core/firebase/firebase-config.service';

const firebaseConfigInitializer = () => {
  const configService = inject(FirebaseConfigService);
  return () => configService.load();
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([firebaseAuthInterceptor])),
    provideRouter(routes),
    provideIonicAngular({}),
    {
      provide: APP_INITIALIZER,
      useFactory: firebaseConfigInitializer,
      multi: true
    },
    provideFirebaseApp(() => initializeApp(inject(FirebaseConfigService).getConfig())),
    provideAuth(() => getAuth())
  ]
};
