import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export type PushRequestEventKind = 'NEW_REQUEST' | 'APP_RESUMED';
export type PushEventSource = 'foreground' | 'tap' | 'resume';

export interface PushRequestEvent {
  kind: PushRequestEventKind;
  source: PushEventSource;
  requestId?: number | null;
  hotelId?: number | null;
  roomId?: number | null;
  rawData?: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class PushEventsService {
  private readonly subject = new Subject<PushRequestEvent>();

  readonly events$: Observable<PushRequestEvent> = this.subject.asObservable();

  emit(event: PushRequestEvent): void {
    this.subject.next(event);
  }
}
