# Admin account and Family & friends plans: design

Date: 6 Oct 2026. Owner decisions recorded in memory `admin-god-account`.

## What the owner asked for
"I want all the privileges: tobioluwadare@gmail.com is my email. I want to be
able to give plans and almost unlimited access to family and friends. My
account is the God account." Afrofuturist, Storm caller and Frost lich are his
alone.

## Roles
| Role | Who | Codes a day | Avatars |
|---|---|---|---|
| admin | email in server setting `SW_ADMIN_EMAILS` (comma list; today `tobioluwadare@gmail.com`) | no limit, not counted | all 14 |
| ff (Family & friends) | an active row in `grants` for the account's email | 100 | 11: the free 6 + gold, holo, graffiti, lowpoly, clay |
| free | everyone else | today's device/IP limit (10) | the free 6 |

Owner-only avatars: `afro`, `storm`, `lich`. Admin is decided only on the
server from the env setting; nothing a browser sends can make an account admin.

## Grants
- Table `public.plan_grants(email text primary key, plan text not null default 'ff', granted_by uuid references users(id) on delete set null, created_at timestamptz default now(), revoked_at timestamptz)`, RLS on, no policies (service role only), like the other account tables.
- Keyed by lower-cased email so a friend can be granted before signing up; it applies the moment they sign in with that email.
- Forever until revoked (revoking sets `revoked_at`; granting again clears it).

## Server
- `lib/roles.js`: `roleOf(db, user, env)` -> "admin" | "ff" | "free"; `avatarsFor(role)`; `codeLimitFor(role)` (admin Infinity, ff 100, free null = use the device/IP limit).
- `GET /api/me` adds `role` and `plan` ("Admin" | "Family & friends" | "Free").
- `POST /api/me` validates synced prefs with the caller's role: `avatar` must be in `avatarsFor(role)`.
- Booking quota (`lib/bookgate.js`): when the request carries a valid session, the role decides: admin -> open (not counted); ff -> counted per user (`u:<userId>`) against 100; free -> unchanged device/IP rules. Session read failures fall back to the existing device/IP path (fail open as today).
- `GET /api/account?action=grants` (admin only): list rows. `POST /api/account?action=grant {email}`, `POST /api/account?action=revoke {email}` (admin only, CSRF header like other POSTs). Non-admin -> 403. Emails validated with the same rule as email sign-in.

## Client
- `sw.role` stored from `/api/me`; `swAvatarKey()` allows the role's set; the picker shows: free users the free 6 plus the 5 plan skins locked ("Unlock with plans"); ff the 11 unlocked; admin all 14. The owner's 3 never appear for anyone else.
- Menu and Profile Subscription show the plan: "Admin" (gold) / "Family & friends" / "Free plan"; Codes today shows "No limit" for admin, "of 100" for ff.
- Admin item in the account menu (admin only) opens an Admin view: email field + "Give Family & friends" button, then the list of grants (email, date) each with "Remove".

## Owner actions
1. Run `sql/plan_grants.sql` in Supabase.
2. `vercel env add SW_ADMIN_EMAILS production` = `tobioluwadare@gmail.com` (or Claude runs it if the CLI is signed in).

## Out of scope
Paid plans, payments, more plan types, admin seeing all users, audit log UI.
