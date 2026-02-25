import { Injectable } from '@angular/core';
import { FirebaseOptions } from '@angular/fire/app';

@Injectable({ providedIn: 'root' })
export class FirebaseConfigService {
  private config: FirebaseOptions | null = null;

  async load(): Promise<void> {
    const response = await fetch('/firebase-config.json', { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error('Failed to load firebase-config.json');
    }
    this.config = (await response.json()) as FirebaseOptions;
  }

  getConfig(): FirebaseOptions {
    if (!this.config) {
      throw new Error('Firebase config not loaded');
    }
    return this.config;
  }
}
