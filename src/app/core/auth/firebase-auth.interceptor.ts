import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { FirebaseAuthService } from './firebase-auth.service';

export const firebaseAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(FirebaseAuthService);
  const currentUser = auth.currentUser();

  if (!currentUser) {
    return next(req);
  }

  return from(currentUser.getIdToken()).pipe(
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
};
