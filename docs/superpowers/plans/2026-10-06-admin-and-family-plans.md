# Admin account and Family & friends plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make tobioluwadare@gmail.com an admin with every avatar, no code limit and an Admin page to give/remove a Family & friends plan (100 codes a day, 11 avatars) by email.

**Architecture:** Role is decided on the server only: `lib/roles.js` reads `SW_ADMIN_EMAILS` and a new `plan_grants` table. `/api/me` reports the role; sync validation and the booking gate use it. The client shows avatars/plan by role and adds an Admin view in `public/account-ui.js`.

**Tech Stack:** Node serverless (`api/`, `lib/`), Supabase PostgREST via `lib/auth/db.js`, plain ES5 in `public/`, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-06-admin-and-family-plans-design.md`

## Global Constraints
- Owner-only avatars: `afro`, `storm`, `lich`. FF avatars: `fire, 8bit, 2bit, lino, glass, halo, gold, holo, graffiti, lowpoly, clay`. Free: first 6.
- FF code limit: 100 a day. Admin: no limit, not counted. Free: unchanged.
- Admin only from env `SW_ADMIN_EMAILS` (comma list, compared lower-cased, trimmed). Never from client data.
- Grants keyed by lower-cased email; forever until revoked.
- Plain ES5 in `public/`; token colours only in `account-ui.js`; copy sentence case, no em dashes; "Soccerwizard" one word.
- `npm test` green before each commit; after `public/index.html` edits run `node scripts/graphify-inline.js`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. A non-admin calling the grant/revoke/list endpoints gets 403 and nothing changes.
2. A free user posting `prefs.avatar="afro"` (or any FF skin) is refused by the server.
3. A session read failure during booking must not block booking (fail open to today's device/IP rules).
4. An FF user's 100/day is counted per account, not per device (two phones share it).
5. A revoked grant stops applying on the next request (no long cache).

---

### Task 1: Roles core and the grants table
**Files:** Create `sql/plan_grants.sql`, `lib/roles.js`, `test/roles.test.js`. Modify `lib/auth/db.js` (+ `grantFor(email)`, `listGrants()`, `upsertGrant(email, byUserId)`, `revokeGrant(email, nowIso)`).
**Produces:** `R.roleOf(db, user, env) -> Promise<"admin"|"ff"|"free">` (user = `{id,email}`), `R.avatarsFor(role) -> string[]`, `R.codeLimitFor(role) -> number|null` (admin `Infinity`, ff `100`, free `null`), `R.planLabel(role)` ("Admin" | "Family & friends" | "Free plan"), `R.normEmail(s)`, constants `R.FF_AVATARS`, `R.OWNER_AVATARS`.
- SQL (follow `sql/accounts.sql` style):
```sql
create table if not exists public.plan_grants (
  email text primary key,
  plan text not null default 'ff',
  granted_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.plan_grants enable row level security;
```
- db helpers use `one/many/insert/patch` with `encodeURIComponent` on email; `upsertGrant` = POST with `Prefer: resolution=merge-duplicates,return=representation` setting `revoked_at:null`; `grantFor` returns the row only when `revoked_at` is null.
- `roleOf`: admin if `normEmail(user.email)` is in the env list; else `ff` if `db.grantFor(email)` returns a live row; else free. A db error -> "free" (never throws).
- Tests: admin from env (case/space-insensitive), ff from grant, revoked grant -> free, db throw -> free, avatarsFor sizes 14/11/6 and that ff excludes afro/storm/lich, codeLimitFor values, planLabel.

### Task 2: /api/me role + role-aware avatar validation
**Files:** Modify `api/me.js`, `lib/sync.js`, tests `test/syncprefs.test.js`, `test/me*.test.js` (whichever covers /api/me; grep).
- `Y.validate(data, opts)`: optional `opts.avatars` (array) replaces `FREE_AVATARS` for the `avatar` pref check; default unchanged.
- `api/me.js`: compute `role = await R.roleOf(db, user, process.env)` once per request; GET adds `role`, `plan: R.planLabel(role)`, `codeLimit` (`null` | 100 | `"none"` for admin); POST passes `{avatars: R.avatarsFor(role)}` to `Y.validate` (and to merge if merge re-validates).
- Tests: free user posting `afro` dropped; ff posting `gold` kept, `afro` dropped; admin posting `afro` kept; GET carries role/plan.

### Task 3: Booking gate by role
**Files:** Modify `lib/bookgate.js`, `api/book.js`, test `test/bookgate*.test.js` (grep the existing one; add cases).
- `makeGate(opts)` / `makeRecorder(opts)`: new optional `opts.roleOf(req) -> Promise<{role, userId}|null>`. In gate: call it first inside try/catch; `admin` -> return open (no count, no record); `ff` -> subject `"u:"+userId`, tier `"user"`, limit `opts.userLimit` (100); otherwise (null/free/error) -> existing device/IP path unchanged. Recorder mirrors it (admin records nothing; ff records under `u:<id>`).
- `api/book.js`: `userLimit: 100`, `roleOf: async (req) => { const s = await S.readSession(db, req, Date.now()); if (s.state!=="ok") return null; const u = await db.userById(s.userId); return u ? { role: await R.roleOf(db, u, process.env), userId: u.id } : null; }` (use the auth db module, not the quota db).
- `X-Sw-Quota-Limit` stays the number for ff; for admin no quota headers (page hides "Codes today" -> account UI shows "No limit" from /api/me instead).
- Tests: admin open and not recorded; ff counted under `u:` with limit 100; roleOf throwing -> device path; free -> device path.

### Task 4: Admin grant endpoints
**Files:** Modify `api/account.js`; test `test/accountapi*.test.js` (grep existing; else create `test/grants.test.js` using the handler factory with a fake db like other API tests).
- Actions: `grants` (GET), `grant` (POST `{email}`), `revoke` (POST `{email}`). POSTs use `H.guardPost`. All require a signed-in session AND `roleOf(...) === "admin"` else 403 `{error:"forbidden"}`. Email: `R.normEmail`, must match the email-sign-in validator (reuse it from `lib/auth/emailcode.js` if exported; else the same regex), max 254; bad -> 400 `{error:"bad_email"}`. Granting the admin's own email is allowed but pointless; fine.
- Responses: `grants` -> `{grants:[{email, created_at}]}` (live only, newest first); `grant`/`revoke` -> `{ok:true}`.
- Tests: non-admin 403 for all three (and nothing written), admin list/grant/revoke round-trip on the fake db, bad email 400, missing CSRF header rejected.

### Task 5: Client: plan, avatars by role, Admin view
**Files:** Modify `public/index.html` (swAccount stores `sw.role`, `sw.plan`, `sw.codeLimit` from `/api/me` GET; `swAvatarKey` allows the role set), `public/account-ui.js`, `test/accountui.test.js`.
- `swAvatarKey`: allowed = free 6, plus FF list when `sw.role` is ff/admin, plus owner 3 when admin.
- Picker (`pickerHtml(cur, role)`): free -> free 6 + "Skins / Unlock with plans" with the 5 FF-only skins locked (owner 3 never shown); ff -> all 11 selectable, no locked row; admin -> all 14 selectable.
- Menu + Subscription: plan label from `sw.plan` (admin label in gold); codes line: admin "No limit"; ff "N of 100" from swQuotaToday when known.
- Menu item "Admin" (shield icon) only when `sw.role==="admin"`, opening `admin()` view: email input + "Give Family & friends" button (POST grant; on 200 clear field, reload list; errors in a status line), then the list (GET grants) of rows "email / since <date>" each with "Remove" (POST revoke, then reload). Escape all emails.
- Tests: pickerHtml per role (counts; owner 3 absent for free/ff; locked row only for free), menu shows Admin only for admin, adminHtml escapes, endpoints referenced.

### Task 6: Ship gate
- `node scripts/graphify-inline.js && npm test` green; design detector on `public/account-ui.js`; browser pass with stubbed `/api/me` roles (admin / ff / free) screenshots; owner runs `sql/plan_grants.sql` and sets `SW_ADMIN_EMAILS`; deploy on owner's yes; live check.
