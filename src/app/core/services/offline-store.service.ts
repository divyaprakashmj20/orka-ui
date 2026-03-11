import { Injectable } from '@angular/core';
import { GuestRequestCreatePayload, GuestSessionBootstrapResult, ProfileUpdatePayload, RequestWritePayload } from '../models/orca.models';

export type OfflineMutationKind = 'guest-request-create' | 'request-update' | 'profile-update';
export type OfflineMutationStatus = 'pending' | 'failed';

export type OfflineMutation = {
  id: string;
  kind: OfflineMutationKind;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  status: OfflineMutationStatus;
  lastError?: string | null;
  payload:
    | { token: string; input: GuestRequestCreatePayload }
    | { requestId: number; input: RequestWritePayload }
    | { input: ProfileUpdatePayload };
};

type CacheEnvelope<T> = {
  savedAt: string;
  data: T;
};

@Injectable({ providedIn: 'root' })
export class OfflineStoreService {
  private readonly cachePrefix = 'orka-cache:';
  private readonly queueKey = 'orka-offline-queue';

  getCache<T>(key: string): T | null {
    const envelope = this.getCacheEnvelope<T>(key);
    return envelope?.data ?? null;
  }

  getCacheSavedAt(key: string): string | null {
    return this.getCacheEnvelope(key)?.savedAt ?? null;
  }

  setCache<T>(key: string, data: T): void {
    this.write(this.cachePrefix + key, <CacheEnvelope<T>>{
      savedAt: new Date().toISOString(),
      data
    });
  }

  removeCache(key: string): void {
    this.remove(this.cachePrefix + key);
  }

  listMutations(): OfflineMutation[] {
    return this.read<OfflineMutation[]>(this.queueKey) ?? [];
  }

  enqueueMutation(mutation: Omit<OfflineMutation, 'id' | 'createdAt' | 'updatedAt' | 'attempts' | 'status'>): OfflineMutation {
    const now = new Date().toISOString();
    const next: OfflineMutation = {
      ...mutation,
      id: this.makeId(),
      createdAt: now,
      updatedAt: now,
      attempts: 0,
      status: 'pending'
    };
    const queue = this.listMutations();
    queue.push(next);
    this.write(this.queueKey, queue);
    return next;
  }

  updateMutation(id: string, patch: Partial<OfflineMutation>): void {
    const next = this.listMutations().map((item) =>
      item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item
    );
    this.write(this.queueKey, next);
  }

  removeMutation(id: string): void {
    this.write(
      this.queueKey,
      this.listMutations().filter((item) => item.id !== id)
    );
  }

  replaceGuestSessionSnapshot(token: string, snapshot: GuestSessionBootstrapResult): void {
    this.setCache(`guest-session:${token}`, snapshot);
  }

  private getCacheEnvelope<T>(key: string): CacheEnvelope<T> | null {
    return this.read<CacheEnvelope<T>>(this.cachePrefix + key);
  }

  private read<T>(key: string): T | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private write<T>(key: string, value: T): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore quota / private-mode failures.
    }
  }

  private remove(key: string): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage failures.
    }
  }

  private makeId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
