# Backend Express.js

Backend sederhana menggunakan Express.js.

## Menjalankan project

1. Install dependency:

```bash
npm install
```

2. Copy environment file:

```bash
copy .env.example .env
```

3. Jalankan mode development:

```bash
npm run dev
```

4. Jalankan mode production:

```bash
npm start
```

## Setup Prisma + PostgreSQL

1. Pastikan sudah punya database PostgreSQL bernama `ms`.
2. Copy environment file:

```bash
copy .env.example .env
```

3. Sesuaikan nilai `DATABASE_URL` di `.env` jika user/password/port berbeda.
4. Generate Prisma Client:

```bash
npm run prisma:generate
```

5. Push schema ke database (tanpa migration file):

```bash
npm run prisma:push
```

6. Atau gunakan migration (disarankan untuk tim):

```bash
npm run prisma:migrate -- --name init
```

Perintah tambahan:

- `npm run prisma:studio` -> buka Prisma Studio
- `npm run prisma:migrate:deploy` -> jalankan migration di environment deploy

## Endpoint awal

- `GET /` -> pesan status backend
- `GET /api/health` -> health check service
