import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ShellHeaderService {
  readonly title = signal<string | null>(null);
  readonly subtitle = signal<string | null>(null);

  setHeader(input: { title?: string | null; subtitle?: string | null }): void {
    if (input.title !== undefined) {
      this.title.set(input.title ?? null);
    }
    if (input.subtitle !== undefined) {
      this.subtitle.set(input.subtitle ?? null);
    }
  }

  clear(): void {
    this.title.set(null);
    this.subtitle.set(null);
  }
}
