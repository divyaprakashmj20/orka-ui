import { Routes } from '@angular/router';
import {
  authGuard,
  guestGuard,
  hotelAdminGuard,
  hotelGroupAdminGuard,
  superAdminGuard
} from './core/auth/auth.guards';
import { AuthenticatedLayoutComponent } from './core/shell/authenticated-layout.component';

export const routes: Routes = [
  {
    path: 'guest/request',
    loadComponent: () =>
      import('./pages/guest-request/guest-request.page').then((m) => m.GuestRequestPage)
  },
  {
    path: 'guest/request/:token',
    loadComponent: () =>
      import('./pages/guest-request/guest-request.page').then((m) => m.GuestRequestPage)
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage)
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/register/register.page').then((m) => m.RegisterPage)
  },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./pages/forgot-password/forgot-password.page').then((m) => m.ForgotPasswordPage)
  },
  {
    path: 're-apply',
    loadComponent: () =>
      import('./pages/re-apply/re-apply.page').then((m) => m.ReApplyPage)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => Promise.resolve(AuthenticatedLayoutComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        data: { title: 'Dashboard', subtitle: 'Operational overview for your role.' },
        loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage)
      },
      {
        path: 'app-users',
        canActivate: [hotelAdminGuard],
        data: { title: 'Users', subtitle: 'Review approvals and grant scoped access.' },
        loadComponent: () => import('./pages/app-users/app-users.page').then((m) => m.AppUsersPage)
      },
      {
        path: 'staff',
        canActivate: [hotelAdminGuard],
        data: { title: 'Staff', subtitle: 'Manage your active team and location scope.' },
        loadComponent: () => import('./pages/staff/staff.page').then((m) => m.StaffPage)
      },
      {
        path: 'hotel-groups',
        canActivate: [superAdminGuard],
        data: { title: 'Hotel Groups', subtitle: 'Define the platform ownership structure.' },
        loadComponent: () =>
          import('./pages/hotel-groups/hotel-groups.page').then((m) => m.HotelGroupsPage)
      },
      {
        path: 'hotels',
        canActivate: [hotelGroupAdminGuard],
        data: { title: 'Hotels', subtitle: 'Organize properties and keep their metadata clean.' },
        loadComponent: () => import('./pages/hotels/hotels.page').then((m) => m.HotelsPage)
      },
      {
        path: 'rooms',
        canActivate: [hotelAdminGuard],
        data: { title: 'Rooms', subtitle: 'Maintain room records, guest links, and QR access.' },
        loadComponent: () => import('./pages/rooms/rooms.page').then((m) => m.RoomsPage)
      },
      {
        path: 'requests',
        data: { title: 'Requests', subtitle: 'Track incoming guest work and act fast.' },
        loadComponent: () => import('./pages/requests/requests.page').then((m) => m.RequestsPage)
      },
      {
        path: 'profile',
        data: { title: 'Profile', subtitle: 'Manage your details and notification preferences.' },
        loadComponent: () => import('./pages/profile/profile.page').then((m) => m.ProfilePage)
      },
      {
        path: 'reports',
        canActivate: [hotelAdminGuard],
        data: { title: 'Reports', subtitle: 'See performance metrics scoped to your access.' },
        loadComponent: () => import('./pages/reports/reports.page').then((m) => m.ReportsPage)
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
