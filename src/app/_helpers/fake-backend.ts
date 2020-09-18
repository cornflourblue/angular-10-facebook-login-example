import { Injectable } from '@angular/core';
import { HttpRequest, HttpResponse, HttpHandler, HttpEvent, HttpInterceptor, HTTP_INTERCEPTORS } from '@angular/common/http';
import { Observable, of, throwError, from } from 'rxjs';
import { delay, materialize, dematerialize, concatMap } from 'rxjs/operators';

// array in local storage for accounts
const accountsKey = 'angular-10-facebook-login-accounts';
let accounts = JSON.parse(localStorage.getItem(accountsKey)) || [];

@Injectable()
export class FakeBackendInterceptor implements HttpInterceptor {
    intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        const { url, method, headers, body } = request;

        // wrap in delayed observable to simulate server api call
        return handleRoute();

        function handleRoute() {
            switch (true) {
                case url.endsWith('/accounts/authenticate') && method === 'POST':
                    return authenticate();
                case url.endsWith('/accounts') && method === 'GET':
                    return getAccounts();
                case url.match(/\/accounts\/\d+$/) && method === 'GET':
                    return getAccountById();
                case url.match(/\/accounts\/\d+$/) && method === 'PUT':
                    return updateAccount();
                case url.match(/\/accounts\/\d+$/) && method === 'DELETE':
                    return deleteAccount();
                default:
                    // pass through any requests not handled above
                    return next.handle(request);
            }
        }

        // route functions

        function authenticate() {
            const { accessToken } = body;

            return from(new Promise(resolve => {
                fetch(`https://graph.facebook.com/v8.0/me?access_token=${accessToken}`)
                    .then(response => resolve(response.json()));
            })).pipe(concatMap((data: any) => {
                if (data.error) return unauthorized(data.error.message);

                let account = accounts.find(x => x.facebookId === data.id);
                if (!account) {
                    // create new account if first time logging in
                    account = {
                        id: newAccountId(),
                        facebookId: data.id,
                        name: data.name,
                        extraInfo: `This is some extra info about ${data.name} that is saved in the API`
                    }
                    accounts.push(account);
                    localStorage.setItem(accountsKey, JSON.stringify(accounts));
                }

                return ok({
                    ...account,
                    token: generateJwtToken(account)
                });
            }));
        }

        function getAccounts() {
            if (!isLoggedIn()) return unauthorized();
            return ok(accounts);
        }

        function getAccountById() {
            if (!isLoggedIn()) return unauthorized();

            let account = accounts.find(x => x.id === idFromUrl());
            return ok(account);
        }

        function updateAccount() {
            if (!isLoggedIn()) return unauthorized();

            let params = body;
            let account = accounts.find(x => x.id === idFromUrl());

            // update and save account
            Object.assign(account, params);
            localStorage.setItem(accountsKey, JSON.stringify(accounts));

            return ok(account);
        }

        function deleteAccount() {
            if (!isLoggedIn()) return unauthorized();

            // delete account then save
            accounts = accounts.filter(x => x.id !== idFromUrl());
            localStorage.setItem(accountsKey, JSON.stringify(accounts));
            return ok();
        }
        
        // helper functions

        function ok(body?) {
            return of(new HttpResponse({ status: 200, body }))
                .pipe(delay(500));
        }

        function unauthorized(message = 'Unauthorized') {
            return throwError({ status: 401, error: { message } })
                .pipe(materialize(), delay(500), dematerialize());
        }

        function isLoggedIn() {
            return headers.get('Authorization')?.startsWith('Bearer fake-jwt-token');
        }

        function idFromUrl() {
            const urlParts = url.split('/');
            return parseInt(urlParts[urlParts.length - 1]);
        }

        function newAccountId() {
            return accounts.length ? Math.max(...accounts.map(x => x.id)) + 1 : 1;
        }

        function generateJwtToken(account) {
            // create token that expires in 15 minutes
            const tokenPayload = { 
                exp: Math.round(new Date(Date.now() + 15*60*1000).getTime() / 1000),
                id: account.id
            }
            return `fake-jwt-token.${btoa(JSON.stringify(tokenPayload))}`;
        }
    }
}

export let fakeBackendProvider = {
    // use fake backend in place of Http service for backend-less development
    provide: HTTP_INTERCEPTORS,
    useClass: FakeBackendInterceptor,
    multi: true
};