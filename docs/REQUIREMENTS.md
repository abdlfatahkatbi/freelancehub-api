# FreelanceHub — Backend Requirements (source of truth)

Backend API only. A separate team builds the frontend, so the contract must be clean and documented (Swagger).
Stack: NestJS, Prisma 6, PostgreSQL, JWT, bcrypt, class-validator, @nestjs/throttler, cache-manager, @nestjs/swagger.

## 1. Roles

| Role | Can do |
|---|---|
| CLIENT (project owner) | Publish/edit/delete own OPEN projects, view proposals on own projects, accept a proposal, deposit to wallet, approve delivery |
| FREELANCER | Edit own profile, browse projects, submit/edit/delete own PENDING proposals, upload delivery |
| ADMIN | Manage categories, ban/unban users |

- Register accepts only `CLIENT` or `FREELANCER`. Reject `ADMIN`. The admin is created by a seed script.

## 2. Decisions (ambiguities resolved — copy into the final README)

1. Money type: `Decimal(12,2)`, currency USD. Never use JS float arithmetic (use `Prisma.Decimal`).
2. Authentication: JWT access token (e.g. 1 day). On EVERY request the user is re-loaded from DB; if missing or `isBanned` → 401. This is what makes a ban effective immediately.
3. Ownership violation → 403 Forbidden. Non-existing resource → 404. Ids always come from the URL/JWT, never trusted from body.
4. Login rate limit: 5 attempts/minute per IP on `POST /auth/login` only (not global).
5. Passwords hashed with bcrypt (cost 10–12). Same generic error for wrong email or wrong password.
6. A FREELANCER profile is created automatically at registration (empty). A CLIENT has no profile.
7. Public profile (`GET /freelancers/:id`) is available to any authenticated user and NEVER exposes email or password.
8. Every user gets a Wallet (balance 0) at registration, created in the same transaction as the user.
9. Platform commission goes to the ADMIN user's wallet (seeded admin).
10. Only CLIENT can deposit. Amount must be > 0 and max 2 decimals (also set a sane upper limit, e.g. 100000).
11. Category name is unique. Deleting a category that has projects → 409 Conflict (Restrict).
12. Categories are cached (GET list). Cache is invalidated immediately on create/update/delete by admin. Long TTL as a safety net.
13. Project edit/delete only while `OPEN` and only by its owner. Deleting a project deletes its proposals (cascade) and its attachment file.
14. A proposal can be edited/deleted by its freelancer only while it is `PENDING` and the project is `OPEN`.
15. Proposal price is free (any value > 0, not tied to project budget).
16. Wallet holds only AVAILABLE balance. Held (escrow) money lives in the `Contract` record (status HELD) — not in any wallet.
17. One delivery per contract; the freelancer may re-upload (replace) while contract is HELD. There is no "reject delivery" flow in this version.
18. Delivery file: PDF or ZIP, max 20 MB. Only the contract's client and freelancer can download it.
19. Commission math: `freelancerShare = round(amount * 0.90, 2)`, `commission = amount - freelancerShare` (so the sum is always exact).
20. Out of scope: cancellation/refund, freelancer withdrawal, real payment gateway, notifications, reviews.
21. Pagination: `page` (default 1), `limit` (default 10, max 50). Response: `{ data, meta: { total, page, limit, totalPages } }`.
22. Projects list/search/filter: authenticated users. Search is case-insensitive `contains` on title.

## 3. Entities (see prisma/schema.prisma)

User, FreelancerProfile, Category, Project, Proposal, Wallet, Transaction (ledger), Contract (escrow), Delivery.

State machines:
- Project: `OPEN → IN_PROGRESS → COMPLETED`
- Proposal: `PENDING → ACCEPTED | REJECTED`
- Contract: `HELD → RELEASED`

Transaction types (amount is signed): `DEPOSIT (+)`, `ESCROW_HOLD (−)`, `PAYOUT (+)`, `COMMISSION (+)`. Each row stores `balanceAfter`.

## 4. Endpoints

### Auth
- `POST /auth/register` — name, email (unique → 409), password (min 8), role (CLIENT|FREELANCER)
- `POST /auth/login` — throttled 5/min; banned user cannot log in
- `GET /auth/me`

### Freelancer profile
- `GET /freelancers/:id` — public profile (name, avatar url, bio, hourlyRate)
- `PATCH /freelancers/me` — bio, hourlyRate (FREELANCER)
- `POST /freelancers/me/avatar` — multipart, image only (png/jpeg/webp), ≤ 2 MB

### Categories
- `GET /categories` — cached
- `POST /categories`, `PATCH /categories/:id`, `DELETE /categories/:id` — ADMIN

### Projects
- `POST /projects` — CLIENT; multipart: title, description, categoryId, budget, optional `attachment` (image or PDF, ≤ 5 MB)
- `GET /projects` — paginated; query: `page, limit, categoryId, search, sort` where sort ∈ `newest | budget_asc | budget_desc`
- `GET /projects/mine` — owner's projects
- `GET /projects/:id`
- `PATCH /projects/:id`, `DELETE /projects/:id` — owner, only OPEN
- `GET /projects/:id/attachment` — authenticated download

### Proposals
- `POST /projects/:projectId/proposals` — FREELANCER; project must be OPEN; one per freelancer per project (DB unique → 409); body: price, durationDays (int ≥ 1), message
- `GET /projects/:projectId/proposals` — owner of the project only
- `GET /proposals/mine` — freelancer's own proposals with status
- `PATCH /proposals/:id`, `DELETE /proposals/:id` — owner freelancer, PENDING only
- `POST /proposals/:id/accept` — CLIENT who owns the project (see §5)

### Wallet
- `GET /wallet` — balance
- `POST /wallet/deposit` — CLIENT; body: amount
- `GET /wallet/transactions` — paginated, newest first

### Delivery
- `POST /projects/:projectId/delivery` — the accepted freelancer; project IN_PROGRESS; multipart `file` (PDF/ZIP ≤ 20 MB)
- `GET /projects/:projectId/delivery` — download (client or freelancer of that contract)
- `POST /projects/:projectId/delivery/approve` — the owner CLIENT (see §6)

### Admin
- `GET /admin/users` — paginated
- `PATCH /admin/users/:id/ban`, `PATCH /admin/users/:id/unban` — cannot ban an ADMIN

## 5. Accept proposal — ONE atomic transaction (all or nothing)

Inside `prisma.$transaction` (interactive):
1. Load proposal + project. Verify: caller owns the project, project is `OPEN`, proposal is `PENDING`.
2. Atomically deduct balance: `wallet.updateMany({ where: { userId: client, balance: { gte: price } }, data: { balance: { decrement: price } } })`. If `count === 0` → throw 400 "Insufficient balance" (transaction rolls back).
3. Lock the project state: `project.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'IN_PROGRESS' } })`. If `count === 0` → throw 409 (someone else accepted first).
4. Create `Contract` (status HELD, amount = proposal.price, client, freelancer, project, proposal).
5. Proposal → `ACCEPTED`; all other proposals of this project → `REJECTED` (`updateMany`).
6. Insert `Transaction` `ESCROW_HOLD` (negative amount, balanceAfter) for the client wallet.

Any thrown error = nothing is saved.

## 6. Approve delivery — ONE atomic transaction

1. Verify: caller owns project, project `IN_PROGRESS`, a delivery exists.
2. `contract.updateMany({ where: { id, status: 'HELD' }, data: { status: 'RELEASED', releasedAt: now, commission } })`. If `count === 0` → 409 (already paid; protects against double click / double payout).
3. Freelancer wallet `+ freelancerShare`; admin wallet `+ commission`.
4. Insert `PAYOUT` and `COMMISSION` transactions.
5. Project → `COMPLETED`.

## 7. Security checklist

- bcrypt hash; never return `password`.
- Global `JwtAuthGuard` + `@Public()` for register/login; `RolesGuard` + `@Roles()`.
- Ownership checks in services (IDOR protection).
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- Uploads: multer memoryStorage + size limit → validate mimetype AND magic bytes (PNG `89 50 4E 47`, JPEG `FF D8 FF`, WEBP `RIFF....WEBP`, PDF `25 50 44 46`, ZIP `50 4B 03 04`) → save with random UUID filename → never use original filename in a path.
- Throttle login only.
- Helmet + CORS configured.

## 8. Acceptance scenario (must pass as an e2e test)

1. Sara (CLIENT) deposits 300 → balance 300.
2. Sara publishes "logo design" in category Design.
3. Ahmed and Layla (FREELANCERs) each submit a proposal. A second proposal from Ahmed → 409.
4. Sara accepts Ahmed's 200 proposal → Sara balance 100; Layla's proposal REJECTED; project IN_PROGRESS; contract HELD 200.
5. Accepting with insufficient balance → 400 and NOTHING changes.
6. Ahmed uploads delivery; Sara approves → Ahmed +180, admin +20, project COMPLETED, contract RELEASED.
7. Approving twice → 409, no extra money moves.
8. Ahmed tries to edit Layla's proposal → 403. Sara tries to edit another client's project → 403.
9. Banned user's existing token → 401 on next request.
10. 6th login attempt within a minute → 429.

## 9. Deliverables

- Working API, Swagger at `/api/docs`, seed script (admin + categories), ERD, README with run steps + the Decisions section above.
