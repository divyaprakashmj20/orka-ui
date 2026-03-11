import {
  AfterContentInit,
  ChangeDetectorRef,
  Component,
  ContentChildren,
  EventEmitter,
  forwardRef,
  Input,
  OnDestroy,
  Output,
  QueryList,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { OOptionComponent } from './o-option.component';

@Component({
  selector: 'o-select',
  standalone: true,
  imports: [],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => OSelectComponent),
      multi: true,
    },
  ],
  styleUrl: './o-select.component.scss',
  template: `
    <button
      type="button"
      class="o-select-trigger"
      [class.is-open]="isOpen()"
      (click)="toggle()"
    >
      <span class="o-select-value" [class.placeholder]="!hasSelection()">
        {{ displayLabel() }}
      </span>
      <svg class="o-select-arrow" width="16" height="16" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>

    @if (isOpen()) {
      <div class="o-select-backdrop" (click)="close()"></div>
      <div class="o-select-popup" (click)="$event.stopPropagation()">
        <div class="o-select-popup-inner">
          @for (opt of opts(); track $index) {
            <button
              type="button"
              class="o-select-item"
              [class.is-selected]="isSelected(opt.value)"
              (click)="pick(opt)"
            >{{ opt.label }}</button>
          }
        </div>
      </div>
    }
  `,
})
export class OSelectComponent implements ControlValueAccessor, AfterContentInit, OnDestroy {
  @ContentChildren(OOptionComponent) optionRefs!: QueryList<OOptionComponent>;
  @Output() change = new EventEmitter<any>();

  protected readonly isOpen = signal(false);
  protected readonly opts = signal<{ label: string; value: any }[]>([]);

  private _value: any = null;
  private _onChange: (v: any) => void = () => {};
  private _onTouched: () => void = () => {};
  private _sub?: any;
  private _syncTimer?: any;

  constructor(private cdr: ChangeDetectorRef) {}

  /** Support [value]="..." binding without ngModel */
  @Input() set value(v: any) {
    this._value = v;
  }

  ngAfterContentInit(): void {
    this.syncOptions();
    this._sub = this.optionRefs.changes.subscribe(() => this.scheduleSync());
  }

  ngOnDestroy(): void {
    this._sub?.unsubscribe();
    clearTimeout(this._syncTimer);
  }

  private scheduleSync(): void {
    clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => this.syncOptions(), 0);
  }

  private syncOptions(): void {
    this.opts.set(
      this.optionRefs.map((o) => ({
        value: o.value,
        label: o.el.nativeElement.textContent?.trim() ?? '',
      }))
    );
    this.cdr.markForCheck();
  }

  protected displayLabel(): string {
    const found = this.opts().find((o) => o.value === this._value);
    return found?.label ?? 'Select…';
  }

  protected hasSelection(): boolean {
    return this.opts().some((o) => o.value === this._value);
  }

  protected isSelected(val: any): boolean {
    return this._value === val;
  }

  protected toggle(): void {
    this.scheduleSync();
    this.isOpen.update((v) => !v);
    this._onTouched();
  }

  protected close(): void {
    this.isOpen.set(false);
  }

  protected pick(opt: { label: string; value: any }): void {
    this._value = opt.value;
    this._onChange(opt.value);
    this.change.emit(opt.value);
    this.isOpen.set(false);
    this.cdr.markForCheck();
  }

  /* ── ControlValueAccessor ── */
  writeValue(v: any): void {
    this._value = v;
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (v: any) => void): void {
    this._onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this._onTouched = fn;
  }
}
