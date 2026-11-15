# FreelanceHub API — Copilot instructions

Backend only (NestJS + Prisma + PostgreSQL). A separate team builds the frontend, so the API contract must be clean and documented with Swagger.

## Stack
NestJS (TypeScript strict), Prisma 6, PostgreSQL, JWT (passport-jwt), bcrypt, class-validator, @nestjs/throttler, cache-manager, @nestjs/swagger.

## Source of truth
- Read `docs/REQUIREMENTS.md` before implementing anything. Schema is in `prisma/schema.prisma`.
- If something is unclear, follow the "Decisions" section. Do not invent new behavior — ask me instead.

## Architecture rules
- One module per feature: controller (HTTP only) -> service (business logic) -> PrismaService. No Prisma calls in controllers.
- Every input has a DTO with class-validator decorators. Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- Never return the password hash. Use explicit `select` or response DTOs.
- Auth: global `JwtAuthGuard` + `@Public()` decorator for public routes; `RolesGuard` + `@Roles()`.
- `JwtStrategy.validate` must load the user from DB and reject if missing or `isBanned`.
- Ownership checks live in services: compare the resource owner id with `req.user.id`. Never trust user ids from the request body. Ownership violation -> 403, missing resource -> 404.
- Money: Prisma `Decimal(12,2)` only. Never use JS `number` arithmetic for money; use `Prisma.Decimal`.
- Any operation that touches money or several tables must run in `prisma.$transaction(async tx => ...)`. Use conditional `updateMany` (where on status / balance) and check `count` to prevent race conditions and double spending.
- Pagination response: `{ data, meta: { total, page, limit, totalPages } }`, `limit` max 50.
- File uploads: multer `memoryStorage` with size limits; validate mimetype AND magic bytes; save with a random UUID filename; never use the original filename in a path.
- Errors: throw Nest `HttpException` subclasses with clear English messages.
- Add Swagger decorators (`@ApiTags`, `@ApiBearerAuth`, `@ApiProperty` on DTOs) to every controller/DTO.

## Style
- TypeScript strict, no `any`, small functions, files named `create-x.dto.ts`, `x.service.ts`.
- Do not add dependencies without telling me which and why.
- Do not generate tests or docs unless I ask.
- When I ask for a module, implement only that module (plus the minimal edits elsewhere) and list the files you changed.
