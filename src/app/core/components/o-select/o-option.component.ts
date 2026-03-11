import { Component, ElementRef, Input } from '@angular/core';

@Component({
  selector: 'o-option',
  standalone: true,
  template: '<ng-content />',
  host: { style: 'display:none' },
})
export class OOptionComponent {
  @Input() value: any = null;
  constructor(public el: ElementRef<HTMLElement>) {}
}
