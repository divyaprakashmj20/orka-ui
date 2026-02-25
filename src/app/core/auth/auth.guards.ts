import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, from, map, of, switchMap, take } from 'rxjs';
import { OrcaApiService } from '../services/orca-api.service';
import { FirebaseAuthService } from './firebase-auth.service';
import { AppUser } from '../models/orca.models';

function loginRedirect(router: Router, extras?: Record<string, string>) {
  return router.createUrlTree(['/login'], {
    queryParams: extras
  });
}

function requireActiveAppUser(stateUrl: string | undefined) {
  const auth = inject(FirebaseAuthService);
  const router = inject(Router);
  const api = inject(OrcaApiService);
  const currentUser = auth.currentUser();

  const firebaseUser$ = currentUser ? of(currentUser) : auth.authState$.pipe(take(1));

  return firebaseUser$.pipe(
    take(1),
    switchMap((user) => {
      if (!user) {
        return of(
          {
            ok: false as const,
            redirect: loginRedirect(router, {
              redirectTo: stateUrl || '/'
            })
          }
        );
      }

      return api.getAppUserByFirebaseUid(user.uid).pipe(
        switchMap((appUser) => {
          if (appUser.status === 'ACTIVE') {
            return of({ ok: true as const, appUser });
          }

          return from(auth.signOutAndWaitForState()).pipe(
            map(() => ({
              ok: false as const,
              redirect: loginRedirect(router, { reason: appUser.status || 'NOT_ACTIVE' })
            })),
            catchError(() =>
              of({
                ok: false as const,
                redirect: loginRedirect(router, { reason: appUser.status || 'NOT_ACTIVE' })
              })
            )
          );
        }),
        catchError(() =>
          from(auth.signOutAndWaitForState()).pipe(
            map(() => ({
              ok: false as const,
              redirect: loginRedirect(router, { reason: 'PROFILE_MISSING' })
            })),
            catchError(() =>
              of({
                ok: false as const,
                redirect: loginRedirect(router, { reason: 'PROFILE_MISSING' })
              })
            )
          )
        )
      );
    })
  );
}

export const authGuard: CanActivateFn = (_route, state) => {
  return requireActiveAppUser(state.url).pipe(
    map((result) => (result.ok ? true : result.redirect))
  );
};

export const superAdminGuard: CanActivateFn = (_route, state) => {
  return roleGuard(['SUPERADMIN'])(_route, state);
};

export const hotelGroupAdminGuard: CanActivateFn = (_route, state) => {
  return roleGuard(['SUPERADMIN', 'HOTEL_GROUP_ADMIN', 'ADMIN'])(_route, state);
};

export const hotelAdminGuard: CanActivateFn = (_route, state) => {
  return roleGuard(['SUPERADMIN', 'HOTEL_GROUP_ADMIN', 'HOTEL_ADMIN', 'ADMIN'])(_route, state);
};

function roleGuard(allowedRoles: AppUser['accessRole'][]): CanActivateFn {
  return (_route, state) => {
    const router = inject(Router);

    return requireActiveAppUser(state.url).pipe(
      map((result) => {
        if (!result.ok) {
          return result.redirect;
        }

        const appUser: AppUser = result.appUser;
        return allowedRoles.includes(appUser.accessRole ?? null)
          ? true
          : router.createUrlTree(['/'], { queryParams: { reason: 'INSUFFICIENT_ROLE' } });
      })
    );
  };
}

export const guestGuard: CanActivateFn = (route) => {
  const auth = inject(FirebaseAuthService);
  const router = inject(Router);

  return auth.authState$.pipe(
    take(1),
    map((user) => {
      if (!user) {
        return true;
      }

      const redirectTo = route.queryParamMap.get('redirectTo');
      return redirectTo ? router.parseUrl(redirectTo) : router.createUrlTree(['/']);
    })
  );
};
