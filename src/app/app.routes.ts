import { Routes } from '@angular/router';
import {
  authGuard,
  guestGuard,
  hotelAdminGuard,
  hotelGroupAdminGuard,
  superAdminGuard
} from './core/auth/auth.guards';

export const routes: Routes = [
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
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage)
  },
  {
    path: 'app-users',
    canActivate: [hotelAdminGuard],
    loadComponent: () => import('./pages/app-users/app-users.page').then((m) => m.AppUsersPage)
  },
  {
    path: 'staff',
    canActivate: [hotelAdminGuard],
    loadComponent: () => import('./pages/staff/staff.page').then((m) => m.StaffPage)
  },
  {
    path: 'hotel-groups',
    canActivate: [superAdminGuard],
    loadComponent: () =>
      import('./pages/hotel-groups/hotel-groups.page').then((m) => m.HotelGroupsPage)
  },
  {
    path: 'hotels',
    canActivate: [hotelGroupAdminGuard],
    loadComponent: () => import('./pages/hotels/hotels.page').then((m) => m.HotelsPage)
  },
  {
    path: 'rooms',
    canActivate: [hotelAdminGuard],
    loadComponent: () => import('./pages/rooms/rooms.page').then((m) => m.RoomsPage)
  },
  {
    path: 'requests',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/requests/requests.page').then((m) => m.RequestsPage)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
