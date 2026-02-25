import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app.routes';
import { firebaseWebConfig } from './core/firebase/firebase.config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideRouter(routes),
    provideIonicAngular({}),
    provideFirebaseApp(() => initializeApp(firebaseWebConfig)),
    provideAuth(() => getAuth())
  ]
};
