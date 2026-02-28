# Bitespeed Identity Reconciliation Service

A backend service that identifies and links customer contacts across multiple purchases using different email addresses and phone numbers.

## Tech Stack

- **Node.js** + **TypeScript**
- **Express.js** — HTTP framework
- **Prisma** — ORM
- **PostgreSQL** — Database

## Hosted Endpoint

> **Base URL**: `https://bitespeed-keh0.onrender.com`
>
> **POST** `/identify`


## Local Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 

### Steps

```bash
# 1. Clone & install
git clone <repo-url>
cd bitespeed
npm install

# 2. Configure database
# Edit .env with your PostgreSQL connection string:
# DATABASE_URL="postgresql://user:password@localhost:5432/bitespeed"

# 3. Run migrations
npx prisma migrate dev --name init

# 4. Start the server
npm run dev
```

Server starts at `http://localhost:3000`.

## API

### `POST /identify`

**Request Body** (JSON):
```json
{
  "email": "mcfly@hillvalley.edu",
  "phoneNumber": "123456"
}
```

At least one of `email` or `phoneNumber` is required.

**Response** (`200 OK`):
```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [23]
  }
}
```

## Project Structure

```
src/
├── index.ts                       # Express app entry point
├── prisma.ts                      # Prisma client singleton
├── controllers/
│   └── identify.controller.ts     # Request handling & validation
├── routes/
│   └── identify.ts                # Route definitions
└── services/
    └── contact.service.ts         # Identity reconciliation logic
prisma/
└── schema.prisma                  # Database schema
```
