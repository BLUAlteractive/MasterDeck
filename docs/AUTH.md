# Identity and authorization — B005

Backend implementation with isolated signed-token/HTTP/socket/PostgreSQL tests. Real development Supabase anonymous sign-in and identity-linking verification is still pending provider configuration. No production credentials, auth bypass, player grants or mobile sign-in UI are added here.

## Configure a development provider

B003 selected Supabase Auth behind a server adapter. Use a separate **development** project with anonymous sign-in enabled and asymmetric signing keys. Check provider settings for identity linking, redirect URLs and abuse protection before testing OAuth/email conversion. Do not send service-role keys, passwords or production tokens to the repository or chat. Public project URL/JWKS and publishable keys are configuration, not administrative access.

Keep the local database migrated (`pnpm db:deploy`) using root CLI DATABASE_URL as described in the [database guide](../prisma/README.md). Then configure ignored `services/api/.env` with the development DATABASE_URL and public identity settings from its template:

```dotenv
AUTH_ISSUER=https://your-development-project.supabase.co/auth/v1
AUTH_AUDIENCE=authenticated
AUTH_JWKS_URL=https://your-development-project.supabase.co/auth/v1/.well-known/jwks.json
```

Issuer/JWKS must be HTTPS and share the configured origin. URLs are trusted operator configuration; token headers never select a key endpoint. Omitting both issuer/JWKS leaves public health available and private routes fail with 503 AUTH_NOT_CONFIGURED. Partial/invalid configuration fails startup. Never use a service-role/anonymous API key as a user's bearer session token. The adapter accepts only signed ES256/RS256 user tokens with authenticated role, UUID subject/session ID, expiry/issued-at, anonymous flag and assurance level. Local test JWKS/signing keys are supplied directly by tests, never by a production configuration bypass.

## Authenticated flow

1. The client obtains an anonymous or permanent user access token from the managed provider. Tokens/refresh credentials belong in platform-appropriate secure storage; no token is placed in a URL or log.
2. `POST /v1/auth/session` with Authorization Bearer token and empty JSON object establishes the internal user/identity/session. Concurrent retries create one internal user per issuer/subject. There are no card grants here. It returns `{userId,isGuest,role}`.
3. `GET /v1/me` and `GET /v1/cards?limit=50&cursor=...` require that active binding/session. Inventory always uses the verified internal user; owner selectors and unknown query fields are rejected. Cards are an owner-only minimal backend projection, not the B010 gallery or B008 provenance feature.
4. Link the managed anonymous identity to a permanent identity through the provider, then refresh the token. Call `POST /v1/auth/guest-link` using the new permanent token and `{expectedUserId,idempotencyKey}`. The API checks that this is the same internal principal; it changes guest status atomically, stores the replay result and audit event, and never copies/reassigns inventory. Different subjects/accounts are not merged. A mismatched expected user is rejected with 409; an anonymous token is rejected with 403. Old anonymous tokens cannot gain permanent capabilities after linking.
5. `POST /v1/auth/logout` revokes the local provider-session binding durably. Retrying bootstrap with that same session cannot resurrect it. The client must also call the provider's sign-out to end its refresh session. Logout elsewhere at the provider is not claimed to invalidate every already-issued JWT immediately; local revocation, database suspension and expiry are the enforced boundaries here.
6. `POST /v1/me/deletion-request` queues a deletion request, suspends local access and revokes local sessions atomically. A 202 pending result is **not** a completed privacy purge. B051 owns provider deletion, retention/anonymization, export and actual completion.

B005 does not automatically merge an existing registered account into a guest account based on email. That path requires proof of both identities and reviewed inventory-preservation rules. Native sign-in/deep links and actual provider account conversion remain integration evidence to obtain, not outcomes inferred from signed fixtures.

## Admin, sockets and limits

Admin authorization reads the local database role; client fields, `user_metadata`, `app_metadata` role labels and provider `authenticated` role do not grant admin permissions. `/v1/admin/access` is a capability probe requiring a non-guest local ADMIN and verified aal2 token. It does not implement catalog editing or role assignment. No public endpoint can promote a role; B044/B045 own audited administrative tools and operational provisioning.

Socket.IO namespace `/rooms` authenticates through `handshake.auth.token`. Query-string tokens are refused. Identity/status/revocation are checked on every incoming packet, and sockets disconnect when their token expires. Reconnect with a fresh token to refresh authentication. No room access or game command is authorized yet: after authentication, room/game requests return ROOM_UNAVAILABLE until B018 supplies authoritative membership/actors. Future broadcasts must recheck recipient authorization and project safe state; no private match stream is implemented here.

HTTP requests retain 60/IP/minute limits and 16 KiB JSON parsing. Socket handshakes use a bounded 60-second/60-attempt source limiter, exact browser-origin checks and a 16 KiB transport bound; each connection accepts at most 60 packets/minute. Native clients may omit Origin but still require a valid token. Transient source buckets are never logged and expire; no raw token, issuer subject, claim payload or connection URL is logged. Safe rejection logs include only error code, status and server request ID; session success logs contain a fixed operation/status event.

## Data and recovery

The auth migration adds a server-owned UserRole, durable session revocation tombstones, append-only minimal auth audit and pending deletion queue. Session identity/revocation cannot be rewritten, and revoked sessions are retained until a reviewed retention policy safely outlives their tokens. Keep future privacy deletion/anonymization compatible with permanent card provenance; do not cascade-delete inventory/history to remove an identity.

The disposable DB runner applies all migrations, runs foundation and auth tests, executes test reversal scripts in reverse migration order, resets/reseeds and runs tests again. New auth reversal SQL drops only auth additions before the foundation reversal. These files are destructive test fixtures, not production rollback commands. Production recovery uses the reviewed forward-repair/restore process in the database guide. No production data operation is included.

## Verification and outstanding acceptance

Run `pnpm ci:quality`, `pnpm ci:database`, `pnpm ci:audit`. The database suite uses temporary local JWKS keys/HTTP listeners and a newly owned PostgreSQL container; no developer Supabase account or credentials are required. It exercises real signature verification and database transactions rather than trusting decoded token objects. The Prisma reset consent rules remain in the database guide.

Before marking B005/M0 fully accepted, verify the actual development provider flow: anonymous sign-in, session bootstrap, permanent linking retaining the same subject/internal user/inventory, expiry and signing-key rotation, sign-out and denial, and administrative MFA configuration. No development issuer configuration was present in the inspected workspace. Provide the development project URL and public publishable key through appropriate development configuration to complete that check; no admin secret is needed for the basic anonymous flow.

References: [Supabase anonymous users](https://supabase.com/docs/guides/auth/auth-anonymous), [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking), [JWT claim fields](https://supabase.com/docs/guides/auth/jwt-fields), [JOSE remote JWKS](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md).

B010 now supplies an optional public-configured managed guest/restore/refresh/disconnect host using the official SDK. Native credentials are stored with bounded atomic SecureStore chunks scoped to provider origin; web is tab-scoped. Backend session binding still verifies the managed JWT. No project configuration was supplied/contacted here, and linking/email/social/MFA/device acceptance remains open. See [gallery session setup and limits](COLLECTION_GALLERY.md).
