# FreelanceHub Postman Guide

## Files to import

The repository includes one complete Postman collection and one local environment:

```text
postman/FreelanceHub-API.postman_collection.json
postman/FreelanceHub-Local.postman_environment.json
```

The old authentication-only collection was replaced by the complete API collection.

## Import the collection

1. Open Postman.
2. Click **Import**.
3. Select:

   ```text
   postman/FreelanceHub-API.postman_collection.json
   ```

4. Click **Import**.

## Import the environment

1. Click **Import** again.
2. Select:

   ```text
   postman/FreelanceHub-Local.postman_environment.json
   ```

3. In the top-right environment selector, choose:

   ```text
   FreelanceHub - Local Complete
   ```

## Configure the environment

Open the environment and update:

| Variable | Value |
|---|---|
| `baseUrl` | `http://localhost:3000` |
| `adminEmail` | The seeded admin email |
| `adminPassword` | The seeded admin password |

The admin credentials must match the values used by the Prisma seed script.

The collection stores tokens and IDs as collection variables automatically:

```text
adminToken
saraToken
ahmedToken
laylaToken
saraId
ahmedId
laylaId
categoryId
projectId
proposalId
contractProjectId
```

## Start the API

From the repository root:

```powershell
cd D:\freelancehub-api
npm install
npm run start
```

The API will be available at:

```text
http://localhost:3000
```

Swagger is available at:

```text
http://localhost:3000/api/docs
```

## Run the requests in order

Run the folders in this order:

```text
1 - Auth
2 - Freelancers
3 - Admin and Categories
4 - Wallet
5 - Projects
6 - Proposals and Contract
7 - Deliveries
```

The request scripts save tokens and resource IDs after successful responses.

## Folder 1: Auth

Run:

1. Register Sara as `CLIENT`.
2. Register Ahmed as `FREELANCER`.
3. Register Layla as `FREELANCER`.
4. Login the seeded Admin.
5. Get the current Sara user.
6. Run the invalid registration request to verify validation.

Do not run the registration requests repeatedly with the same emails unless the
users have been removed or the email values have been changed. Duplicate emails
correctly return `409 Conflict`.

## Folder 2: Freelancers

Run:

1. Get Ahmed's public profile.
2. Update Ahmed's profile.
3. Upload an avatar for Ahmed.

For the avatar request:

1. Open the request.
2. Open **Body**.
3. Select **form-data**.
4. Select the `file` field.
5. Choose a PNG, JPEG, or WEBP image no larger than 2 MB.

## Folder 3: Admin and Categories

Run:

1. List users as Admin.
2. Create a category.
3. List categories.
4. Update the category.
5. Ban Ahmed.
6. Unban Ahmed.

The create-category request saves the returned category ID automatically.

## Folder 4: Wallet

Run:

1. Deposit `300.00` for Sara.
2. Get Sara's balance.
3. Get Sara's paginated wallet transactions.

Only a `CLIENT` can deposit. Deposit amounts must be positive, have at most
two decimal places, and must not exceed the configured limit.

## Folder 5: Projects

Run:

1. Create a project as Sara.
2. List projects.
3. Search and filter projects.
4. List Sara's projects.
5. Get one project.
6. Update the project.
7. Download the project attachment if one was uploaded.

The create and update requests use `multipart/form-data`.

Required project fields:

```text
title
description
categoryId
budget
```

The optional `attachment` must be an accepted image or PDF file no larger than
5 MB.

## Folder 6: Proposals and Contract

Run:

1. Create Ahmed's proposal.
2. Create Layla's proposal.
3. List proposals for the project as Sara.
4. List Ahmed's own pending proposals.
5. Update Ahmed's proposal while it is still pending.
6. Accept Ahmed's proposal as Sara.

The project must be `OPEN` for new proposals and acceptance. Once accepted:

```text
Project  -> IN_PROGRESS
Proposal -> ACCEPTED
Contract -> HELD
Other proposals -> REJECTED
```

Sara's wallet is charged by the proposal price.

## Folder 7: Deliveries

Run:

1. Upload a delivery as Ahmed.
2. Download the delivery as Sara or Ahmed.
3. Approve the delivery as Sara.

The delivery file must be a PDF or ZIP no larger than 20 MB.

After approval:

```text
Freelancer share = 90% of the contract amount
Platform fee     = remaining amount
Contract         = RELEASED
Project          = COMPLETED
```

The delivery approval endpoint is protected against double payment. A second
approval correctly returns `409 Conflict`.

## Upload requests

For every file upload:

1. Open the request.
2. Select **Body**.
3. Select **form-data**.
4. Select the file field.
5. Choose a valid file.
6. Send the request.

Do not manually set the `Content-Type` header for multipart requests. Postman
generates the correct boundary automatically.

## Common responses

| Status | Meaning |
|---|---|
| `200` | Successful read or update |
| `201` | Resource created |
| `400` | Invalid input or insufficient balance |
| `401` | Missing, invalid, or banned authentication |
| `403` | Authenticated user does not have permission |
| `404` | Resource does not exist |
| `409` | Current-state conflict, duplicate, or already-paid operation |
| `429` | Rate limit exceeded |

## Troubleshooting

### The request returns connection refused

Start the API:

```powershell
npm run start
```

### The admin login fails

Check `adminEmail` and `adminPassword` in the selected Postman environment.
They must match the seeded admin credentials.

### A request returns 401

Check that the correct environment is selected and that the request uses the
correct token variable.

### A request returns 409 for registration

The email already exists. Change the email or clean the development database.

### A file upload fails

Check the file type, file size, and form-data field name. The field names are:

```text
avatar request: file
project request: attachment
delivery request: file
```
