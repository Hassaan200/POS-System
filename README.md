# Fabric Shop Management System

Abhi is zip mein sirf `backend/` hai (Node.js + Express + MySQL). Frontend agla step hai.

## Backend chalane ke steps

1. Zip extract karo, phir `backend` folder mein jao:
   cd fabric-shop/backend

2. Packages install karo:
   npm install

3. MySQL mein database aur user banao (MySQL client mein):
   CREATE DATABASE fabric_shop CHARACTER SET utf8mb4;
   CREATE USER 'fabric'@'localhost' IDENTIFIED BY 'apna_password';
   GRANT ALL ON fabric_shop.* TO 'fabric'@'localhost';

4. `.env.example` ko copy karke `.env` banao aur apni values likho (DB_PASSWORD, JWT_SECRET):
   cp .env.example .env

5. Tables banao:
   npm run migrate

6. Pehla shared login banao (password terminal mein poochega):
   npm run init-admin

7. Server chalao:
   npm run dev
   Check: http://localhost:4000/api/health  ->  {"ok":true}

## Tests chalane ke liye

Alag test database chahiye (apna data safe rehta hai, test is database ko saaf kar deta hai):
   CREATE DATABASE fabric_shop_test CHARACTER SET utf8mb4;
   GRANT ALL ON fabric_shop_test.* TO 'fabric'@'localhost';
   npm test

## Folder guide

- migrations/001_init.sql   -> poora database schema
- src/services/             -> asli business logic (purchases, sales, payments, reports)
- src/routes/               -> API endpoints
- tests/business.test.js    -> 35 tests
- scripts/init-admin.js     -> pehla login banane ki script
- scripts/backup.js         -> database backup (mysqldump chahiye)
