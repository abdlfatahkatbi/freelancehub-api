# FreelanceHub Testing Guide

## What is a software test?

A software test is code that checks whether another part of the application behaves
as expected.

Instead of manually checking:

1. Register a user.
2. Deposit money.
3. Create a project.
4. Submit proposals.
5. Accept a proposal.
6. Upload and approve a delivery.

the test performs these actions automatically and verifies the results.

For example:

```text
Expected: Sara balance becomes 100 after accepting a 200 USD proposal.
Actual:   The API returns balance 100.
Result:   Pass.
```

If the actual result is different, the test fails and shows where the behavior
is incorrect.

## Why tests matter for this project

FreelanceHub contains money, ownership rules, authentication, and state changes.
A manual test can miss an important case, especially:

- A client spending more money than their balance.
- A freelancer editing another freelancer's proposal.
- A contract being paid twice.
- A banned user continuing to use an old token.
- Two proposals being accepted for the same project.

The automated tests repeat these checks consistently before delivery.

## Types of tests

### Unit test

A unit test checks one small piece of code in isolation.

Example:

```text
Check that 90% of 200 equals 180.
```

It usually tests one service or one helper and may mock the database.

### Integration test

An integration test checks that multiple parts work together.

Example:

```text
WalletService + PrismaService + PostgreSQL
```

It is more realistic than a unit test because it uses real dependencies.

### End-to-end test

An end-to-end test checks the application from the outside, like a real client.

It sends HTTP requests to the running NestJS application:

```text
HTTP request -> Controller -> Service -> Prisma -> PostgreSQL
```

The test then checks the HTTP status, response body, and database state.

The acceptance test in this project is an end-to-end test.

## What is Supertest?

Supertest is a library that sends HTTP requests from JavaScript or TypeScript
tests.

Example:

```ts
await request(app.getHttpServer())
  .get('/wallet')
  .set('Authorization', `Bearer ${token}`)
  .expect(200);
```

This means:

1. Send `GET /wallet`.
2. Add the JWT authorization header.
3. Expect HTTP status `200`.

## The acceptance test file

The main test file is:

```text
test/acceptance.e2e-spec.ts
```

It follows the acceptance scenario in section 8 of `docs/REQUIREMENTS.md`.

The test:

1. Uses a separate PostgreSQL test database.
2. Starts the NestJS application.
3. Registers Sara, Ahmed, Layla, and Bob.
4. Creates a test admin.
5. Deposits 300 USD into Sara's wallet.
6. Creates a project.
7. Creates proposals from Ahmed and Layla.
8. Verifies that Ahmed cannot submit a duplicate proposal.
9. Accepts Ahmed's 200 USD proposal.
10. Verifies the balance, contract, project, and proposal states.
11. Verifies insufficient balance behavior.
12. Uploads a PDF delivery.
13. Verifies that both contract parties can download it.
14. Approves the delivery.
15. Verifies the 90% freelancer payout and platform commission.
16. Verifies that the delivery cannot be paid twice.
17. Verifies ownership protection.
18. Verifies that a banned user's old token is rejected.
19. Verifies the login rate limit.

## Important status codes

The test checks that the API returns the correct HTTP status:

| Status | Meaning | Example |
|---|---|---|
| 200 | Request succeeded | Read wallet balance |
| 201 | Resource was created | Register or create project |
| 400 | Input or business rule is invalid | Insufficient balance |
| 401 | Authentication is missing or invalid | Banned user's old token |
| 403 | User is authenticated but not allowed | Editing another user's project |
| 404 | Resource does not exist | Missing project |
| 409 | Conflict with current state | Duplicate proposal or second payment |
| 429 | Too many requests | Sixth login attempt |

## Test database safety

The acceptance test requires:

```text
TEST_DATABASE_URL
```

This must point to a separate database. Do not point it to your development or
production database.

The test cleans the configured test database before and after the scenario.
This is safe only when the configured database is dedicated to testing.

## How to run the test

### 1. Set the test database URL

PowerShell:

```powershell
$env:TEST_DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/freelancehub_test"
```

### 2. Prepare the database schema

```powershell
$env:DATABASE_URL=$env:TEST_DATABASE_URL
npx prisma db push
```

### 3. Run all end-to-end tests

```powershell
npm run test:e2e -- --runInBand
```

### 4. Run only the acceptance scenario

```powershell
npx jest --config ./test/jest-e2e.json --runInBand test/acceptance.e2e-spec.ts
```

## How to read a test

Most tests follow this structure:

```ts
it('describes the behavior', async () => {
  // Arrange: prepare users, data, or the database.
  // Act: send a request or call the application.
  // Assert: verify the response and final state.
});
```

These three steps are often called AAA:

- **Arrange**: prepare the situation.
- **Act**: perform the action.
- **Assert**: check the result.

Example:

```ts
await request(app.getHttpServer())
  .post('/wallet/deposit')
  .set('Authorization', bearer(saraToken))
  .send({ amount: '300.00' })
  .expect(201);
```

In this example:

- Arrange: Sara already has a valid JWT token.
- Act: send a deposit request.
- Assert: the API returns `201 Created`.

## What to study to understand tests

Study these topics in this order:

1. JavaScript and TypeScript `async` and `await`.
2. HTTP methods: `GET`, `POST`, `PATCH`, and `DELETE`.
3. HTTP status codes.
4. Jest: `describe`, `it`, `expect`, `beforeAll`, and `afterAll`.
5. Supertest: `.get()`, `.post()`, `.send()`, `.set()`, `.attach()`, and `.expect()`.
6. JWT authentication and the `Authorization: Bearer ...` header.
7. Prisma database queries and transactions.
8. End-to-end testing and test database isolation.

## What passing and failing mean

### Passing test

A passing test means the tested behavior matched the expected result for the
scenario covered by the test.

It does not prove that every possible bug is impossible, but it gives strong
confidence for the important workflow.

### Failing test

A failing test means at least one expected behavior did not happen.

Read:

1. The test name.
2. The expected status or value.
3. The actual status or value.
4. The line number reported by Jest.

Then fix the application or update the test only if the requirements changed.

## Files related to testing

```text
test/acceptance.e2e-spec.ts  Full business-flow acceptance test
test/app.e2e-spec.ts         Basic authentication smoke test
test/jest-e2e.json           Jest configuration for e2e tests
docs/REQUIREMENTS.md         Source of truth for expected behavior
```

## Current validation status

The following checks passed:

```text
npm run build
npm run lint
test/app.e2e-spec.ts
```

The full acceptance scenario must be run with a configured PostgreSQL
`TEST_DATABASE_URL`.
