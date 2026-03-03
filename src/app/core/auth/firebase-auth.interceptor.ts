import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { FirebaseAuthService } from './firebase-auth.service';

export const firebaseAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(FirebaseAuthService);

  // Resolve the current Firebase user — either synchronously (already initialized)
  // or by waiting for authState$ to emit (first load, SDK not yet rehydrated).
  const user$ = auth.currentUser()
    ? from(Promise.resolve(auth.currentUser()))
    : auth.authState$.pipe(filter((u) => u !== null), take(1));

  return user$.pipe(
    switchMap((user) => {
      if (!user) {
        return next(req);
      }
      return from(user!.getIdToken()).pipe(
        switchMap((token) =>
          next(
            req.clone({
              setHeaders: {
                Authorization: `Bearer ${token}`
              }
            })
          )
        )
      );
    })
  );
};
