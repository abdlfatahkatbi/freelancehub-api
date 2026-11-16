# FreelanceHub API

FreelanceHub is a NestJS backend for a freelance marketplace. It provides
authentication, freelancer profiles, projects, proposals, wallets, contracts,
deliveries, admin controls, and an escrow-style payment workflow.

## Technology stack

- NestJS
- TypeScript
- Prisma 6
- PostgreSQL
- JWT authentication
- bcrypt password hashing
- class-validator
- Swagger
- Jest and Supertest

## Features

### Authentication

- Register as `CLIENT` or `FREELANCER`.
- Login with JWT access tokens.
- Load the user from the database on every authenticated request.
- Reject banned users immediately.
- Login rate limit: five attempts per minute per IP.

### Freelancer profiles

- View a public freelancer profile.
- Update the current freelancer profile.
- Upload or replace an avatar.
- Never expose the password or email in the public profile.

### Categories

- List categories with caching.
- Admin-only create, update, and delete operations.
- Unique category names.
- Prevent deleting categories that have projects.

### Projects

- Clients create projects with optional attachments.
- Paginated project listing.
- Category filtering.
- Case-insensitive title search.
- Sort by newest, budget ascending, or budget descending.
- Owner-only update and delete while the project is `OPEN`.
- Authenticated attachment downloads.

### Proposals and contracts

- Freelancers submit one proposal per project.
- Project owners view proposals for their projects.
- Freelancers view and filter their own proposals.
- Freelancers can update or delete only their own `PENDING` proposals while the
  project is `OPEN`.
- Clients accept proposals atomically.
- Accepted proposals create `HELD` contracts.
- Other proposals become `REJECTED`.

### Wallet and payments

- Every user receives a wallet at registration.
- Only clients can deposit.
- Wallet transactions are stored in a ledger.
- Proposal acceptance deducts the client balance atomically.
- Delivery approval pays 90% to the freelancer.
- The remaining amount is recorded as platform commission.
- Double payment is rejected.

### Deliveries

- Accepted freelancers upload PDF or ZIP deliveries.
- Deliveries can be replaced while the project is `IN_PROGRESS`.
- Only the contract client and freelancer can download a delivery.
- Clients approve deliveries while the contract is `HELD`.

### Administration

- Admin users list users with pagination.
- Admin users can ban and unban non-admin users.
- Admin users cannot be banned.

## Requirements

- Node.js
- npm
- PostgreSQL

## Project setup

From the repository root:

```powershell
npm install
```

Create a `.env` file with a PostgreSQL connection and JWT settings:

```env
DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/freelancehub"
JWT_SECRET="replace-with-a-long-random-secret"
JWT_EXPIRES_IN="1d"
PORT=3000
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="change-this-password"
ADMIN_NAME="FreelanceHub Admin"
```

Apply the Prisma schema:

```powershell
npx prisma db push
```

Seed the admin user and initial categories:

```powershell
npx prisma db seed
```

## Run the API

Development:

```powershell
npm run start:dev
```

Normal start:

```powershell
npm run start
```

Production build:

```powershell
npm run build
npm run start:prod
```

The API runs at:

```text
http://localhost:3000
```

Swagger documentation:

```text
http://localhost:3000/api/docs
```

## API modules

| Module | Main routes |
|---|---|
| Auth | `/auth/register`, `/auth/login`, `/auth/me` |
| Freelancers | `/freelancers/:id`, `/freelancers/me` |
| Admin | `/admin/users` |
| Categories | `/categories` |
| Projects | `/projects` |
| Proposals | `/projects/:projectId/proposals`, `/proposals` |
| Wallet | `/wallet` |
| Deliveries | `/projects/:projectId/delivery` |

All protected routes require:

```text
Authorization: Bearer <JWT>
```

## Postman

Import the complete collection:

```text
postman/FreelanceHub-API.postman_collection.json
```

Import the local environment:

```text
postman/FreelanceHub-Local.postman_environment.json
```

Select the environment named:

```text
FreelanceHub - Local Complete
```

Then run the folders in order:

```text
1 - Auth
2 - Freelancers
3 - Admin and Categories
4 - Wallet
5 - Projects
6 - Proposals and Contract
7 - Deliveries
```

For complete Postman instructions, read:

```text
docs/POSTMAN-GUIDE.md
```

## Testing

Build the project:

```powershell
npm run build
```

Run lint:

```powershell
npm run lint
```

Run unit tests:

```powershell
npm run test
```

## End-to-end acceptance test

The acceptance test follows section 8 of `docs/REQUIREMENTS.md` and verifies:

- Client deposit.
- Project creation.
- Proposal creation and duplicate protection.
- Atomic proposal acceptance.
- Insufficient balance rollback.
- Delivery upload and download.
- Freelancer payout and platform commission.
- Double-payment protection.
- Ownership checks.
- Banned-token rejection.
- Login rate limiting.

The test file is:

```text
test/acceptance.e2e-spec.ts
```

Use a separate PostgreSQL database for tests.

PowerShell:

```powershell
$env:TEST_DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/freelancehub_test"
$env:DATABASE_URL=$env:TEST_DATABASE_URL
npx prisma db push
npm run test:e2e -- --runInBand acceptance.e2e-spec.ts
```

Run all e2e tests:

```powershell
npm run test:e2e -- --runInBand
```

Never point `TEST_DATABASE_URL` at a development or production database. The
acceptance test cleans the configured test database before and after execution.

For a beginner-friendly explanation, read:

```text
docs/TESTING-GUIDE.md
docs/LAST-CHANGE-EXPLANATION.md
```

## Money and state rules

- Money uses Prisma `Decimal(12,2)`.
- JavaScript floating-point arithmetic is not used for money.
- Wallets contain available balance only.
- Held escrow money is represented by the `Contract`.
- Project states are `OPEN -> IN_PROGRESS -> COMPLETED`.
- Proposal states are `PENDING -> ACCEPTED` or `REJECTED`.
- Contract states are `HELD -> RELEASED`.
- Money-changing operations use Prisma transactions.

## Security

- Passwords are hashed with bcrypt.
- Password hashes are never returned.
- JWT users are reloaded from the database on every request.
- Banned users are rejected even when using an existing token.
- Ownership checks are performed in services.
- DTO validation uses whitelist and forbid-non-whitelisted behavior.
- File uploads use memory storage, size limits, MIME checks, magic-byte checks,
  and random UUID filenames.
- Stored file paths are validated against the uploads directory.

## Out of scope

The current requirements intentionally exclude:

- Real payment gateways.
- Cancellation and refunds.
- Freelancer withdrawals.
- Notifications.
- Reviews and ratings.

## Repository documentation

```text
docs/REQUIREMENTS.md
docs/POSTMAN-GUIDE.md
docs/TESTING-GUIDE.md
docs/LAST-CHANGE-EXPLANATION.md
```
