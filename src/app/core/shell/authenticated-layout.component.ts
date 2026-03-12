import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ShellComponent } from './shell.component';
import { ShellHeaderService } from './shell-header.service';

@Component({
  selector: 'app-authenticated-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ShellComponent],
  template: `
    <app-shell [pageTitle]="pageTitle()" [pageSubtitle]="pageSubtitle()">
      <router-outlet></router-outlet>
    </app-shell>
  `
})
export class AuthenticatedLayoutComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly shellHeader = inject(ShellHeaderService);

  protected readonly pageTitle = signal('');
  protected readonly pageSubtitle = signal('');

  ngOnInit(): void {
    this.syncFromRoute();
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.syncFromRoute());
  }

  private syncFromRoute(): void {
    const snapshot = this.getDeepestPrimarySnapshot(this.router.routerState.snapshot.root);
    this.pageTitle.set(this.shellHeader.title() ?? snapshot.data['title'] ?? '');
    this.pageSubtitle.set(this.shellHeader.subtitle() ?? snapshot.data['subtitle'] ?? '');
  }

  private getDeepestPrimarySnapshot(snapshot: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
    let current = snapshot;

    while (true) {
      const next = current.children.find((child) => child.outlet === 'primary');
      if (!next) {
        return current;
      }
      current = next;
    }
  }
}
