import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ReportDayCount, ReportOverview, ReportTopRoom } from '../../core/models/orca.models';
import { OrcaApiService } from '../../core/services/orca-api.service';
import { ShellComponent } from '../../core/shell/shell.component';

@Component({
  selector: 'app-reports-page',
  standalone: true,
  host: { class: 'ion-page' },
  imports: [CommonModule, ShellComponent],
  templateUrl: './reports.page.html',
  styleUrl: './reports.page.scss'
})
export class ReportsPage implements OnInit {
  private readonly api = inject(OrcaApiService);

  protected readonly loading = signal(true);
  protected readonly error   = signal('');
  protected readonly data    = signal<ReportOverview | null>(null);

  /** Max value across the 7-day series, used to normalise bar heights. */
  protected readonly maxDayCount = computed(() => {
    const d = this.data();
    if (!d || d.requestsPerDay.length === 0) return 1;
    return Math.max(1, ...d.requestsPerDay.map(x => x.count));
  });

  /** Total for type % calculations */
  protected readonly totalByType = computed(() => {
    const d = this.data();
    if (!d) return 1;
    const sum = Object.values(d.byType).reduce((a, b) => a + (b ?? 0), 0);
    return sum || 1;
  });

  protected readonly requestTypes = ['HOUSEKEEPING', 'FOOD', 'MAINTENANCE', 'OTHER'] as const;
  protected readonly requestStatuses = ['NEW', 'ACCEPTED', 'COMPLETED', 'CANCELLED'] as const;

  ngOnInit(): void {
    this.api.getReportOverview().subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => { this.error.set('Could not load report data.'); this.loading.set(false); }
    });
  }

  protected barHeightPct(count: number): number {
    return Math.round((count / this.maxDayCount()) * 100);
  }

  protected typePct(type: string): number {
    const d = this.data();
    if (!d) return 0;
    return Math.round(((d.byType as any)[type] ?? 0) / this.totalByType() * 100);
  }

  protected dayLabel(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }

  protected typeLabel(type: string): string {
    const map: Record<string, string> = {
      HOUSEKEEPING: 'Housekeeping',
      FOOD: 'Food & Bev',
      MAINTENANCE: 'Maintenance',
      OTHER: 'Other'
    };
    return map[type] ?? type;
  }

  protected statusColor(status: string): string {
    const map: Record<string, string> = {
      NEW:       'hsl(38 90% 55%)',
      ACCEPTED:  'hsl(239 70% 60%)',
      COMPLETED: 'hsl(142 60% 45%)',
      CANCELLED: 'hsl(0 0% 55%)'
    };
    return map[status] ?? '#888';
  }

  protected minuteLabel(minutes: number | null): string {
    if (minutes === null || minutes === undefined) return '—';
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
}
