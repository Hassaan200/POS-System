# Durrani Fabric Shop – Management System

A full-stack web app that runs the daily business of a fabric (cloth) shop in Karachi: stock in yards, purchases from a China supplier in Yuan, sales to Pakistani customers in Rupees, customer and supplier credit (udhar), expenses, container deliveries, reports and a dashboard.

> **Who this README is for:** me (Hassan), a few months from now, with no AI helping.
> The goal is that after reading it I can explain every part of this system, debug it, and extend it for the next client requirement. Most sections follow the same pattern: **what it is → where it lives → why it was built this way**.

---

## Table of contents

1. [The 10-line mental model](#1-the-10-line-mental-model)
2. [Business context (why the app looks like this)](#2-business-context-why-the-app-looks-like-this)
3. [Tech stack and why](#3-tech-stack-and-why)
4. [Repository map](#4-repository-map)
5. [Architecture and request lifecycle](#5-architecture-and-request-lifecycle)
6. [Run it locally](#6-run-it-locally)
7. [Database](#7-database)
8. [Core concepts you must be able to explain](#8-core-concepts-you-must-be-able-to-explain)
9. [Features: client need → solution → where → why](#9-features-client-need--solution--where--why)
10. [Frontend guide](#10-frontend-guide)
11. [API reference](#11-api-reference)
12. [Tests](#12-tests)
13. [Deployment (Vercel + Aiven)](#13-deployment-vercel--aiven)
14. [Backups and disaster recovery](#14-backups-and-disaster-recovery)
15. [Recipes: how to add or change things](#15-recipes-how-to-add-or-change-things)
16. [Known limits, gotchas and ideas](#16-known-limits-gotchas-and-ideas)
17. [Interview cheat sheet](#17-interview-cheat-sheet)
18. [Glossary](#18-glossary)

---

## 1. The 10-line mental model

1. The browser runs a **React** single-page app (`frontend/`). It only shows screens and sends JSON to the API.
2. The **Express** API (`backend/`) holds all business rules. The frontend is never trusted.
3. Data lives in **MySQL** (Aiven in production). Schema changes are numbered SQL files in `backend/migrations/`.
4. Login gives a **JWT**. Every `/api/*` route except `/health` and `/auth/login` needs it.
5. Every money or stock change runs inside **one database transaction**, with the affected rows **locked**.
6. **Nothing important is ever deleted.** Purchases and sales are *cancelled*, payments are *voided*. Stock changes are reversed by new rows.
7. Every stock change also writes a row in **`stock_movements`** (a ledger). `products.stock_qty/stock_value` is a fast copy of that ledger, and an **integrity check** proves the two agree.
8. Stock is stored in **yards**. Rates can be per yard or per meter. Supplier bills are in **Yuan (¥)**, stock cost is in **PKR**.
9. Every create-POST carries an **Idempotency-Key** so a double click or a retry cannot create two records.
10. A GitHub Action takes an **encrypted database backup every 6 hours**.

If you only remember one thing: *every feature is a small copy of the same pattern – route (validate) → service (transaction, lock, write, audit) → response.*

---

## 2. Business context (why the app looks like this)

**Client:** Durrani Fabric Shop (Karachi). Two people use one shared login.

**How the shop works**

- Fabric comes from a supplier in **China**, paid in **Yuan**. Bills are computed on **meters**.
- The shop thinks and sells in **yards**.
- A fabric **design is a set of three parts: Front, Back, Dupatta**. A set arrives as several **thaans** (rolls); each thaan has its own length for each part. Front, Back and Dupatta are priced differently (example from the client: Front 1000, Back 800, Dupatta 500).
- Goods arrive in **containers** (shipping containers). A **clearing agent** at the port is paid to get them out. Several fabric types can be in one container, so clearing is paid as one lump sum.
- Pakistani customers buy in **PKR**, often on credit.
- The owners want a daily "rough book": sales and expenses (chai, food, salaries, advances) side by side.

Every table and screen in this project exists because of one of those facts. When a new requirement comes, first ask: *which of these facts changes?*

**Requirement timeline (so I remember why things exist)**

| Order | Client request | Result |
|---|---|---|
| 1 | Basic shop system: stock, purchases, sales, credit, reports | Core system (migration 001) |
| 2 | Daily rough book with expenses | `expenses`, Daily Book page (002) |
| 3 | Sets of Front/Back/Dupatta, each thaan length, yard + meter rates | Product sets, `purchase_line_pieces`, `rate_unit` (003) |
| 4 | China side in Yuan, advance payments, shipping and tax | Currency, exchange rate, landed cost (004) |
| 5 | Delete all test data; fix wrong supplier currency | Settings "Delete all data"; currency editable until first entry |
| 6 | Clearing payments, separate from fabric cost | `clearing_payments` + Payments tab (005) |
| 7 | **Separate rate** for Front / Back / Dupatta | Per-part rate boxes in the purchase grid |
| 8 | Container register (date, container no., name, KG, bales) | `containers` + Containers page (006) |

---

## 3. Tech stack and why

| Layer | Tech | Why |
|---|---|---|
| Frontend | React 18 + Vite | Fast dev server, simple build, I already know it |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite`) | Design tokens in CSS (`@theme`), no separate CSS files per page |
| Routing | react-router-dom v6 | One route per sidebar item |
| Fonts | `@fontsource-variable` (Bodoni Moda, Hanken Grotesk, Noto Nastaliq Urdu) | Fonts shipped with the app (no Google request at runtime) |
| Backend | Node.js + Express 4, **ES modules** | Simple, same language as frontend |
| DB driver | `mysql2/promise` (pool) | Promises, prepared statements, transactions |
| Validation | `zod` | One schema = type check + clean data + error message |
| Auth | `jsonwebtoken` + `bcryptjs` | Stateless login; passwords stored as hashes |
| Security | `helmet`, `cors`, `express-rate-limit` | Standard headers, origin allow-list, login throttle |
| Exports | `exceljs`, `pdfkit` | Excel and PDF reports |
| Database | MySQL (Aiven in prod, MariaDB/MySQL locally) | Relational data with strict money rules |
| Hosting | Vercel (frontend and backend as two projects) | Free/cheap, deploy from GitHub |
| Backups | GitHub Actions + `mysqldump` + `openssl` | Automatic, encrypted, off the server |

**Why a relational DB and not MongoDB?** The data is full of relationships (purchase → lines → products → movements) and needs **transactions** and **constraints** (`CHECK`, foreign keys). Money must never be half-saved.

**Why not store money as floats?** Columns are `DECIMAL`, and the code rounds with `r2()` ([`utils/money.js`](backend/src/utils/money.js)). JavaScript floats (`0.1 + 0.2`) are never saved raw.

---

## 4. Repository map

```
pos system/                      <- root folder
├── README.md                    <- this file
├── .github/workflows/
│   └── db-backup.yml            <- encrypted DB backup every 6 hours
├── backend/                     <- Express API (deployed as its own Vercel project)
│   ├── package.json             <- scripts: start, dev, migrate, init-admin, backup, test
│   ├── .env.example             <- all environment variables (copy to .env)
│   ├── migrations/              <- numbered SQL files = the history of the schema
│   │   ├── 001_init.sql         <- core tables + default settings/categories
│   │   ├── 002_expenses.sql
│   │   ├── 003_sets_and_pieces.sql
│   │   ├── 004_currency.sql
│   │   ├── 005_clearing.sql
│   │   └── 006_containers.sql
│   ├── scripts/
│   │   ├── init-admin.js        <- creates the first (shared) login
│   │   └── backup.js            <- manual local backup (mysqldump → .sql.gz)
│   ├── src/
│   │   ├── server.js            <- starts the HTTP server, graceful shutdown
│   │   ├── app.js               <- builds the Express app, mounts all routers
│   │   ├── migrate.js           <- runs pending migrations (npm run migrate)
│   │   ├── config/
│   │   │   ├── env.js           <- reads and validates environment variables
│   │   │   └── db.js            <- connection pool + withTransaction()
│   │   ├── middleware/
│   │   │   ├── auth.js          <- signToken(), requireAuth
│   │   │   └── error.js         <- ONE place that turns errors into JSON
│   │   ├── routes/              <- THIN: validate input, call a service, return JSON
│   │   │   ├── auth.js  catalog.js  products.js  parties.js (customers+suppliers)
│   │   │   ├── transactions.js  (purchases + sales + payments)
│   │   │   ├── expenses.js  clearing.js  containers.js
│   │   │   ├── reports.js  (dashboard + reports + export)
│   │   │   └── settings.js
│   │   ├── services/            <- ALL business logic lives here
│   │   │   ├── common.js        <- settings, refs, audit, row locks, idempotency helpers
│   │   │   ├── products.js      <- products, sets, stock integrity check
│   │   │   ├── purchases.js     <- purchases, cancel, landed costs
│   │   │   ├── sales.js         <- sales, discount split, cancel
│   │   │   ├── payments.js      <- customer and supplier payments, void
│   │   │   ├── ledger.js        <- party balances and statements
│   │   │   ├── expenses.js  clearing.js  containers.js
│   │   │   ├── dashboard.js  reports.js  export.js
│   │   │   └── reset.js         <- "Delete all data"
│   │   └── utils/
│   │       ├── money.js         <- r2() rounding + computeCogs()
│   │       ├── units.js         <- yard/meter conversion
│   │       ├── http.js          <- zod schemas (qty, money, rate, date, id…), validate()
│   │       ├── errors.js        <- AppError, badRequest, notFound, conflict
│   │       └── dates.js         <- "today" in the shop's timezone
│   └── tests/
│       ├── helpers.js           <- test DB reset, test server, API client
│       └── business.test.js     <- 60 end-to-end API tests
└── frontend/                    <- React app (its own Vercel project)
    ├── package.json  vite.config.js  index.html  .env.example
    └── src/
        ├── main.jsx  App.jsx    <- entry + route table
        ├── index.css            <- design tokens, fonts, .tape/.weave/.hatch
        ├── lib/
        │   ├── api.js           <- fetch wrapper: token, errors, idempotency key, download
        │   ├── format.js        <- money(), qty(), cur(), lineAmount(), toMeters()
        │   └── useRate.js       <- hook: default Yuan→PKR rate from settings
        ├── context/AuthContext.jsx   <- login state
        ├── components/
        │   ├── Layout.jsx       <- sidebar + mobile drawer + nav list
        │   ├── ui.jsx           <- Button, Field, Modal, PageHeader, ErrorBox, inputClass
        │   ├── Amount.jsx       <- shows ¥ with small PKR estimate below
        │   ├── ThaanGrid.jsx    <- Front/Back/Dupatta thaan grid + per-part rates
        │   └── LinesEditor.jsx  <- rows editor for sales
        └── pages/               <- one file per screen
            Login  Dashboard  Products  Purchases  Sales  DailyBook
            Parties (Customers + Suppliers)  Payments (3 tabs)  Clearing
            Containers  Reports  Settings
```

**Rule of thumb for where code goes**

- Validating input, choosing the HTTP status → **route**
- Anything that touches money, stock or balance → **service** (inside a transaction)
- A formula used by more than one service → **utils**
- A screen → **pages/**; a piece reused by two screens → **components/**

---

## 5. Architecture and request lifecycle

```
 Browser (React SPA, Vercel #1)
    │  fetch  (Authorization: Bearer <JWT>, Idempotency-Key on creates)
    ▼
 Express API (Vercel #2)
    helmet → cors → express.json(100kb)
      /api/health      (public)
      /api/auth/login  (public, rate-limited 30 per 15 min)
      requireAuth      ← everything below needs a valid JWT
      /api/<resource>  → route (zod validate) → service (transaction) → MySQL
    errorHandler  ← one place that formats every error as { error, details }
    │
    ▼
 MySQL (Aiven)  ←── GitHub Action: mysqldump every 6 h → encrypted artifact
```

**Life of one request – "Save purchase" (the best example to study)**

1. `Purchases.jsx` builds `{ supplier_id, lines:[{product_id, pieces:[..], rate, rate_unit}], exchange_rate, paid_amount }` and calls `api.post('/purchases', body, key)` where `key = newKey()` was created when the form opened.
2. `api.js` adds the JWT header and `Idempotency-Key`.
3. `app.js` → `requireAuth` verifies the token and sets `req.user`.
4. `routes/transactions.js`: `withKey` copies the header into `req.body.idempotency_key`, then `validate(purchaseSchema)` (zod) cleans and checks the body.
5. `services/purchases.js › createPurchase`:
   - if this idempotency key already exists → return the old purchase (`duplicate: true`)
   - open a **transaction**
   - **lock** the supplier row and every product row (`SELECT … FOR UPDATE`)
   - compute line amounts, the ¥ total, and PKR cost per line (`¥ × exchange rate`)
   - insert `purchases`, `purchase_lines`, `purchase_line_pieces`
   - update `products` (stock, stock value, last cost) and insert `stock_movements`
   - if "paid now" > 0 insert a `supplier_payments` row
   - write `audit_log`
   - **commit** (or roll everything back on any error)
6. The response goes back; on error, `middleware/error.js` turns a thrown `AppError`/`ZodError` into `{ "error": "..." }` and the page shows it in `ErrorBox`.

---

## 6. Run it locally

**Needs:** Node 18+ (22 used here), MySQL or MariaDB, `mysqldump` (only for manual backups).

```bash
# 1. Database (once)
mysql -u root -p -e "CREATE DATABASE fabric_shop CHARACTER SET utf8mb4;
  CREATE USER 'fabric'@'localhost' IDENTIFIED BY 'your_password';
  GRANT ALL ON fabric_shop.* TO 'fabric'@'localhost';"

# 2. Backend
cd backend
npm install
cp .env.example .env        # fill DB_PASSWORD and a long JWT_SECRET
npm run migrate             # creates/updates tables
npm run init-admin          # creates the shared login (asks email + password)
npm run dev                 # http://localhost:4000/api/health -> {"ok":true}

# 3. Frontend (second terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173  (Vite proxies /api → :4000)
```

### Environment variables (`backend/.env`)

| Variable | Meaning | Notes |
|---|---|---|
| `PORT` | API port | default 4000 |
| `NODE_ENV` | `development` / `production` | in production `JWT_SECRET` must be ≥ 32 chars |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection | Aiven gives all five |
| `DB_SSL` | `true` for Aiven | adds TLS |
| `DB_POOL_SIZE` | connections per instance | default **3** (serverless-friendly) |
| `JWT_SECRET` | signs login tokens | **changing it logs everyone out** |
| `JWT_EXPIRES_IN` | token lifetime | default 12h |
| `CORS_ORIGIN` | allowed frontend URL(s), comma separated | must equal the frontend's real URL |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | optional, for non-interactive `init-admin` | |

`frontend/.env`: `VITE_API_URL` – the full backend URL ending in `/api` (in production). Empty in development (the Vite proxy handles `/api`).

**Never commit `.env`.** If it ever leaks, rotate `JWT_SECRET` and the DB password.

---

## 7. Database

### 7.1 Tables by purpose

| Group | Tables |
|---|---|
| Access/config | `users`, `settings`, `sequences`, `schema_migrations` |
| Catalog | `categories`, `fabric_types`, `products` |
| Parties | `suppliers`, `customers` |
| Purchasing | `purchases`, `purchase_lines`, `purchase_line_pieces`, `purchase_costs`, `purchase_cost_shares` |
| Selling | `sales`, `sale_lines` |
| Money in/out | `customer_payments`, `supplier_payments`, `expenses`, `clearing_payments` |
| Stock ledger | `stock_movements` |
| Registers | `containers` |
| Safety | `audit_log` |

### 7.2 Relationships (simplified)

```
categories 1─* fabric_types
categories 1─* products *─1 fabric_types
suppliers  1─* purchases 1─* purchase_lines *─1 products
                                   │1
                                   └─* purchase_line_pieces      (each thaan's length)
purchases  1─* purchase_costs 1─* purchase_cost_shares *─1 purchase_lines   (shipping/tax split)
purchases  1─* supplier_payments *─1 suppliers
customers  1─* sales 1─* sale_lines *─1 products
sales      1─* customer_payments *─1 customers
products   1─* stock_movements          (the ledger; ref_type + ref_id point to the cause)
standalone: expenses, clearing_payments, containers, audit_log, settings, sequences
```

### 7.3 Conventions used on every table (learn these – they repeat)

- **`status` instead of deleting.** `purchases`/`sales`: `active|cancelled`. Payments/expenses/clearing/containers: `active|void`.
- **`idempotency_key` (UNIQUE, nullable)** on every record created from a form.
- **`CHECK` constraints** (e.g. `amount > 0`, `quantity > 0`) – the DB refuses bad data even if the code has a bug.
- **Foreign keys** – you cannot point a purchase at a supplier that does not exist.
- **Money = `DECIMAL(14,2)`**, quantities `DECIMAL(12,2)`, rates **`DECIMAL(14,4)`** (4 decimals so a meter rate does not lose precision).
- **`ref` numbers** (`PU-00001`, `SL-00001`) come from the `sequences` table.
- **Dates**: `DATE` for business dates (sent as `YYYY-MM-DD`), `TIMESTAMP` for created/cancelled. The pool uses `dateStrings: true` and `timezone: 'Z'` so dates are plain strings (no timezone shifting).

### 7.4 Important columns

| Table.column | Meaning |
|---|---|
| `products.stock_qty` | current yards (fast copy of the ledger) |
| `products.stock_value` | current value **in PKR** (fast copy of the ledger) |
| `products.purchase_cost` | last cost per yard in PKR (fallback for COGS when stock is 0) |
| `products.set_name`, `products.part` | `D-1` + `front|back|dupatta` – groups 3 products into a "set" |
| `purchases.currency`, `exchange_rate` | supplier currency and the PKR-per-¥ rate **at that purchase** |
| `purchases.total_amount` | bill total in the **supplier's currency** (¥) |
| `purchase_lines.rate`, `rate_unit` | the rate **as typed** and its unit (`yard`/`meter`) |
| `purchase_lines.quantity` | yards (sum of its thaan pieces) |
| `purchase_lines.line_total` | in ¥ |
| `purchase_lines.cost_pkr` | stock cost in **PKR** = ¥ total × rate + allocated shipping/tax |
| `sale_lines.cogs` | cost of goods sold for that line (PKR) – frozen at sale time |
| `sale_lines.discount_share` | this line's share of the bill discount |
| `suppliers.currency` | `CNY` (¥) or `PKR` |
| `settings` | `shop_name`, `currency`, `timezone`, `allow_oversell`, `cny_pkr_rate` |

### 7.5 Migrations

- Files in `backend/migrations/` run **in filename order**, each **once**; applied names are stored in `schema_migrations`.
- `npm run migrate` → `src/migrate.js` (uses `multipleStatements`).
- **Never edit a migration that has already run in production.** Add a new numbered file (`007_….sql`).
- After deploying code that needs a new migration, run `npm run migrate` against the **production** database too (set `.env` to the Aiven values temporarily, or run it from a trusted machine). Forgetting this is the most likely cause of a sudden production `500`.

---

## 8. Core concepts you must be able to explain

### 8.1 Stock is a ledger plus a cached total

- Every change to stock writes a row in `stock_movements` with `quantity` and `value_change` (types: `opening, purchase, sale, purchase_cancel, sale_cancel, cost_add, cost_void`).
- `products.stock_qty` / `stock_value` are updated in the **same transaction** so reads are fast.
- `checkStockIntegrity()` (`services/products.js`) sums the ledger per product and compares it with the cached numbers. **Settings → Data check → Run check** (`GET /api/settings/integrity`) runs it. If it ever says "not ok", a bug (or a manual DB edit) broke the books.

> **Make sure you can explain:** why keep both? *The ledger is the truth and gives history/audit; the cached total gives speed; the integrity check proves they agree.* This is the same idea as an accounting journal vs. an account balance.

### 8.2 Weighted-average cost (COGS)

`computeCogs()` in `utils/money.js`. When selling `qty` yards of a product:

- Average cost per yard = `stock_value / stock_qty`.
- `cogs = average × qty` (if selling everything and more – overselling allowed – the extra is costed at the average too).
- If stock is 0 → use the product's last purchase cost.
- Profit of a sale line = `line_total − discount_share − cogs`.

Example: stock 100 yd worth Rs 50,000 (avg Rs 500). Sell 40 yd → COGS Rs 20,000, stock becomes 60 yd / Rs 30,000.
`cogs` is **stored on the sale line**, so later purchase prices never rewrite old profit.

### 8.3 Transactions and locking

`withTransaction()` (`config/db.js`) = begin → run → commit/rollback → release.

- Rows are locked with `SELECT … FOR UPDATE`. Two people saving at the same moment cannot both read the same old stock.
- `lockProducts()` locks product rows **sorted by id** – a fixed order prevents **deadlocks** (A waits for B while B waits for A).
- `lockParty()` locks the supplier/customer and rejects inactive ones.

### 8.4 Idempotency (no double saves)

- Frontend forms create `key = newKey()` (`crypto.randomUUID()`) **once when the form opens** (`useRef(newKey())`) and send it as `Idempotency-Key`.
- Backend: `withKey` middleware puts it in the body; the service first looks for an existing record with that key and returns it (`duplicate: true`); the `UNIQUE` index also catches a race where two identical requests arrive together (`isDuplicateKeyError`).
- Result: double click, flaky mobile network retry, browser back-and-resubmit → one record.

### 8.5 Cancel / void instead of delete

- Cancelling a sale: stock and value are **added back** using the stored `cogs`, a `sale_cancel` movement is written, its payments are voided.
- Cancelling a purchase: stock is removed using the stored `cost_pkr`; refused if that fabric was already sold (stock would go negative) unless `allow_oversell` is on; its payments and extra costs are voided.
- Everything stays visible (struck through in lists) and in `audit_log`.

### 8.6 Money, rounding and units

- `r2(n)` rounds to 2 decimals. Quantities/amounts are validated to at most 2 decimals (`utils/http.js`), rates to 4.
- Stock is **always in yards**. A rate keeps the unit it was typed in. Amount = `yards × (0.9144 if meter else 1) × rate` (`utils/units.js`, mirrored in `frontend/src/lib/format.js`).
- Why not convert the meter rate to a per-yard rate and store that? Rounding would drift the total (about ¥11 on 3,095.8 yd). The supplier's bill is in meters, so we keep the supplier's own number.
- The frontend computes totals only for display; **the server recomputes and is the truth**.

### 8.7 Two currencies

- Supplier ledger (bills, balance, payments) is in the supplier's currency (¥).
- Customers are PKR only.
- Stock value and profit are always **PKR**. At purchase time each line gets `cost_pkr = ¥ × exchange_rate`, so the PKR cost is **frozen** at the rate of that day. Later rate changes do not rewrite history.
- A small PKR estimate under a ¥ amount (`Amount.jsx`) uses the current default rate (`settings.cny_pkr_rate`) – it is an estimate, not accounting.

### 8.8 Authentication and security

- `POST /auth/login` → checks bcrypt hash (a dummy hash is compared when the email is unknown so response time does not reveal valid emails) → returns a **JWT** (12h) signed with `JWT_SECRET`.
- Frontend stores the token in `localStorage` (`fabric_token`) and sends `Authorization: Bearer …`.
- A `401` on any request clears the token and fires the `auth:logout` event → the app returns to the login page.
- `requireAuth` protects every route mounted after `app.use('/api', requireAuth)`.
- Other protections: `helmet` headers, CORS allow-list from `CORS_ORIGIN`, 100 kb JSON limit, login rate limit, strict zod validation, parameterised SQL (`?` placeholders – no string-built values), password change requires the current password, "Delete all data" requires typing a phrase **and** the password.
- Trade-off to remember: one shared login and no roles, by the client's choice. If the client wants "who did what" or staff with limited rights, that needs per-user accounts and a role check (the `audit_log` already stores `user_id`).

### 8.9 Validation and errors

- Routes validate with zod via `validate(schema)`. Reusable pieces in `utils/http.js`: `qtySchema`, `moneySchema`, `rateSchema`, `dateSchema`, `idSchema`, `optionalText`.
- Throw `badRequest` (400), `notFound` (404), `conflict` (409) from services. `middleware/error.js` formats all errors as `{ "error": "message", "details": [...] }`, and also maps MySQL duplicate / foreign-key errors to 409.
- The frontend's `ApiError.message` is that `error` text, shown in `ErrorBox`.

### 8.10 Audit log

`audit(conn, userId, action, entity, entityId, details)` is called inside every write transaction. It is a simple "who did what" trail, written in the **same transaction**, so it cannot exist without the change itself.

---

## 9. Features: client need → solution → where → why

### 9.1 Products, categories, sets
- **Need:** track fabrics; a design is Front + Back + Dupatta.
- **Solution:** `categories` → `fabric_types` → `products`. A *set* is **three product rows** sharing `set_name`, with `part` = front/back/dupatta and codes `CODE-F/-B/-D`. `POST /products/set` creates all three in one transaction.
- **Where:** `services/products.js › createProductSet`, `pages/Products.jsx (SetForm)`.
- **Why three products and not one product with three sizes?** Each part has its own stock and its own average cost. Treating them as separate products meant **none of the stock/COGS code had to change**.
- Opening stock cannot be changed once purchases or sales exist (it would break the ledger).

### 9.2 Purchases with thaans
- **Need:** each thaan has its own length per part; supplier bill must show each thaan.
- **Solution:** a purchase line carries `pieces[]`. The server stores them in `purchase_line_pieces` and sets `quantity = sum(pieces)`. (If the client sends a `quantity` that does not match, it is rejected.)
- **UI:** `ThaanGrid.jsx` – rows are thaans, columns Front/Back/Dupatta, quick-fill "N thaans × (F, B, D)", per-part rate boxes, totals in yards and meters. `Purchases.jsx` turns each part with at least one length into one purchase line.
- **Bill view:** "Bill" button shows each thaan per part, rate and amount per part, totals, PKR stock cost, extra costs.

### 9.3 Yard and meter
- Stock in yards; rate unit per line (`rate_unit`). The unit is chosen per set block (`Rates are per Meter/Yard`) and per sale line (`Rate/yd`, `Rate/m`).
- Sale **quantity** is in yards (only the rate can be per meter). A "quantity in meters" input would be a small future addition (convert once, round once).

### 9.4 Yuan supplier, exchange rate, advance
- Supplier has `currency` (`CNY` default). Editable only until the first purchase or payment (otherwise old ¥ numbers would be re-read as rupees). `PUT /suppliers/:id` returns 409 after that.
- Purchase: needs an exchange rate (entered, else `settings.cny_pkr_rate`; error if still 0).
- Supplier payments are in ¥ with their own rate for that day. **Advance is allowed** (balance can go negative = "advance paid"), because the client pays before the bill (e.g. 40,000 ¥ before a 38,114 ¥ bill). Paying a *specific purchase* is still capped at that purchase's remaining amount. Customer payments are **not** allowed above the outstanding balance.
- Dashboard "You owe suppliers": ¥ total plus a PKR estimate.

### 9.5 Shipping, tax (landed cost)
- **Need:** shipping/tax raise the PKR cost but are not part of the ¥ bill.
- **Solution:** `purchase_costs` (kind: shipping/customs/other, PKR). The amount is **split across the purchase's lines in proportion to `cost_pkr`** into `purchase_cost_shares`, then added to `purchase_lines.cost_pkr` and `products.stock_value`. Movements `cost_add`/`cost_void` have quantity 0 so the integrity check still balances.
- **Limits:** only lines whose product still has stock take a share (cost cannot be added if everything is already sold, or removed if the stock is sold).
- Cancelling the purchase voids its costs.

### 9.6 Sales
- A sale has lines, an optional discount, and "received now". The discount is split over lines (`allocateDiscount`, last line takes the rounding remainder) so profit per product is correct.
- Walk-in (no customer) sales must be fully paid. A customer sale can be on credit.
- Overselling is blocked unless `settings.allow_oversell`.
- "Add a whole set" in `LinesEditor.jsx` adds three lines (Front/Back/Dupatta), each with **its own rate**; lines left empty are skipped.

### 9.7 Payments, balances, statements
- Balance = `opening_balance + total charged/purchased − total paid` (computed in `services/ledger.js`; nothing stores a running balance).
- `GET /customers|suppliers/:id/statement` gives a running-balance statement.
- Payments page has three tabs: Received from customers, Paid to suppliers, Clearing.

### 9.8 Clearing
- **Need:** money paid to port clearing agents; mixed goods, one lump sum, not tied to a purchase.
- **Solution:** table `clearing_payments` (date, agent, detail, amount PKR). It is **not** added to fabric stock cost; it is counted as a **shop expense** in profit (Dashboard → profit has a clearing line and net profit subtracts it).
- **Why not landed cost?** Landed cost is for costs that belong to *one purchase's* fabric. A lump sum for several fabrics cannot be fairly split.

### 9.9 Containers
- **Need:** a simple register: date, container number, name (Durrani / Zia…), KG, bales.
- **Solution:** `containers` table + `/api/containers` + `Containers.jsx`. Not linked to stock or money.
- The container number is **not unique** (one container can carry goods for two names). It is auto-uppercased. Rows can be edited or voided. Name is free text with suggestions (`<datalist>`).

### 9.10 Expenses and Daily Book
- `expenses` (date, category, description, amount). Categories are fixed in `EXPENSE_CATEGORIES` in `services/expenses.js`: `food_tea, salary, advance, rent, utilities, transport, other`. `GET /expenses/daily-book` returns sales and expenses per day side by side. Net profit on the dashboard = gross profit − expenses − clearing.

### 9.11 Dashboard and reports
- Dashboard (`services/dashboard.js`): stock total and by category, today's sales/purchases/expenses, receivable, payable (¥ and PKR estimate), profit for a period.
- Reports (`services/reports.js › reportBuilders`): `stock`, `stock-by-category`, `sales-by-date`, `sales-by-product`, `purchases`, `profit-by-product`, `profit-by-category`, `profit-by-date`, `receivables`, `payables`, `payments`, `customer-statement`, `supplier-statement`.
- A report builder returns `{ columns, rows, totals, meta }`; **the same object** feeds the on-screen table and the Excel/PDF export (`services/export.js`). Add one builder → you get screen + Excel + PDF.

### 9.12 Settings and "Delete all data"
- Settings: shop name, currency label, timezone, allow oversell, default Yuan rate, change password, data check (the integrity check).
- `POST /settings/reset-data` deletes all business data (products, parties, purchases, sales, payments, expenses, clearing, containers, audit log) and resets reference counters. It keeps users, settings and categories. It needs the exact phrase `DELETE ALL DATA` and the user's password. **Take a backup before using it.** It cannot be undone.

---

## 10. Frontend guide

### 10.1 How the app boots
`main.jsx` → `AuthProvider` + `BrowserRouter` → `App.jsx`.
`App.jsx` has a `pages` map (`'/purchases': <Purchases />`) and renders one `<Route>` for every item in `navItems` (defined in `Layout.jsx`). `ProtectedLayout` redirects to `/login` when there is no user.

### 10.2 The API layer (`lib/api.js`)
- `api.get/post/put` – JSON in, JSON out, throws `ApiError(message, status, details)`.
- Adds `Authorization` from `localStorage`; adds `Idempotency-Key` when you pass `key`.
- `api.download(path)` – fetches a file with the token and saves it (Excel/PDF exports).
- Base URL: `VITE_API_URL` or `/api`.

### 10.3 The standard page recipe
Look at `Containers.jsx` (simplest) then `Purchases.jsx` (most complex):

1. `useState` for rows, filters, `loading`, `error`, `editing`.
2. `load` = `useCallback` that calls `api.get(...)`; `useEffect(() => { load(); }, [load])`.
3. A table with a `Loading…` row and an empty-state row.
4. A form component inside `<Modal>` with `const key = useRef(newKey())` for create requests.
5. On save: `await api.post(...)`, close the modal, call `load()`. On error: `setError(err.message)` → `<ErrorBox>`.

### 10.4 Shared pieces
- `ui.jsx`: `Button`, `Field` (label + hint), `Modal` (scrolls correctly on small screens, optional sticky `footer`), `PageHeader`, `ErrorBox`, `inputClass`.
- `format.js`: `money`, `qty`, `today`, `cur(value, 'CNY'|'PKR')`, `lineAmount`, `toMeters`.
- `Amount.jsx`: `<Amount value currency rate />` shows `¥ 100.00` and `≈ Rs 4,000.00` under it.
- `useRate()`: fetches the default Yuan rate from settings.

### 10.5 Design system
Pure black and white, sharp 2px corners, Bodoni Moda for headings, Hanken Grotesk for text, Noto Nastaliq for Urdu. Tokens live in `index.css` (`@theme`). Decorative classes: `.tape` (ruler line), `.weave`, `.hatch`. The sidebar is a drawer below the `lg` breakpoint.

### 10.6 Responsive rules I follow
- Modals: outer container scrolls (`overflow-y-auto`), panel uses `my-auto`. **Do not** put `items-center` on a scrolling flex parent – the top gets cut off.
- Wide tables: wrap in `overflow-x-auto`; on phones shrink padding and move actions under the name (see `Containers.jsx`).
- Long forms: use the `Modal` `footer` prop so Save stays visible.

---

## 11. API reference

All routes are under `/api`. Everything except `health` and `auth/login` needs `Authorization: Bearer <token>`. **POST creates need `Idempotency-Key`.**

| Area | Endpoints |
|---|---|
| Health | `GET /health` |
| Auth | `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password` |
| Catalog | `GET /catalog`, `POST /catalog/categories`, `POST /catalog/categories/:id/types` |
| Products | `GET /products`, `GET /products/:id`, `POST /products`, `POST /products/set`, `PUT /products/:id` |
| Customers | `GET /customers`, `GET /customers/:id`, `GET /customers/:id/statement`, `POST /customers`, `PUT /customers/:id` |
| Suppliers | same as customers under `/suppliers` (adds `currency`) |
| Purchases | `GET /purchases`, `GET /purchases/:id`, `POST /purchases`, `POST /purchases/:id/cancel`, `POST /purchases/:id/costs`, `POST /purchases/costs/:costId/void` |
| Sales | `GET /sales`, `GET /sales/:id`, `POST /sales`, `POST /sales/:id/cancel` |
| Payments | `GET /payments/customer`, `GET /payments/supplier`, `POST /payments/customer`, `POST /payments/supplier`, `POST /payments/:kind/:id/void` |
| Expenses | `GET /expenses`, `GET /expenses/daily-book`, `POST /expenses`, `POST /expenses/:id/void` |
| Clearing | `GET /clearing`, `POST /clearing`, `POST /clearing/:id/void` |
| Containers | `GET /containers`, `POST /containers`, `PUT /containers/:id`, `POST /containers/:id/void` |
| Dashboard | `GET /dashboard?from&to` |
| Reports | `GET /reports/:name`, `GET /reports/:name/export?format=xlsx|pdf` |
| Settings | `GET /settings`, `PUT /settings`, `GET /settings/integrity`, `POST /settings/reset-data` |

**Errors** always look like `{ "error": "Readable message", "details": [...] }` with: `400` bad input, `401` not logged in, `404` not found, `409` conflict (rule broken: not enough stock, already cancelled, …), `500` unexpected.

---

## 12. Tests

- `cd backend && npm test` → Node's built-in test runner, **60 tests** in `tests/business.test.js`. They start the real Express app on a random port and call it over HTTP (end-to-end through validation, services and SQL).
- Areas: auth, master data, purchases, sales and profit, payments, cancellations (books stay consistent), dashboard and reports, exports, expenses/daily book, sets/thaans/meter rates, Yuan/advance/landed cost, clearing, currency edit + data reset, containers.
- `tests/helpers.js › resetDatabase()` **drops every table** in the test database and re-runs the migrations.
- ⚠️ The test database name defaults to `fabric_shop_test` (or `TEST_DB_NAME`). **Never point `TEST_DB_NAME` at the real database** – the tests would erase it. Create a separate empty DB (`CREATE DATABASE fabric_shop_test`) with the same user.
- When fixing a bug: write a failing test first, then fix. Tests are how I know the money logic did not break.

---

## 13. Deployment (Vercel + Aiven)

| Part | Where | Notes |
|---|---|---|
| Frontend | Vercel project #1, **Root Directory = `frontend`** | Framework: Vite. Build `npm run build`, output `dist` |
| Backend | Vercel project #2, **Root Directory = `backend`** | Express app (`src/server.js`) |
| Database | Aiven MySQL (free plan) | Use `DB_SSL=true`; open it locally with HeidiSQL for inspection |
| Backups | GitHub Actions | see next section |

**Backend environment variables on Vercel:** `NODE_ENV=production`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL=true`, `JWT_SECRET` (≥ 32 random chars), `JWT_EXPIRES_IN`, `CORS_ORIGIN=<frontend URL>`.
**Frontend environment variable:** `VITE_API_URL=<backend URL>/api`.

**Deploy a change:** push to GitHub → Vercel redeploys both projects. If the change includes a migration, run `npm run migrate` against the Aiven database **before or right after** the deploy.

**Things to check/know**

- The repo has **no `vercel.json`**; the setup relies on the Vercel project settings. If I ever recreate the projects, the backend must be exposed as a Vercel Node/Express function, and the frontend needs an SPA fallback so refreshing `/purchases` does not give a 404. A frontend `vercel.json` for that:
  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```
- Vercel runs the backend as short-lived serverless instances, so the DB pool is small (`DB_POOL_SIZE`, default 3). Many instances × pool size can exceed the free Aiven connection limit.
- Free Aiven/Vercel plans have limits and terms that change; the client is a paying business, so keep watching for a move to a paid plan or a VPS (a Hostinger move was considered and **paused**).
- Changing `JWT_SECRET`, or `CORS_ORIGIN` not matching the frontend URL, are the usual causes of "everyone logged out" / "network error" after deploys.

---

## 14. Backups and disaster recovery

### 14.1 What is set up

File: `.github/workflows/db-backup.yml`

- **When:** every 6 hours (`cron: 0 */6 * * *`) and on demand (Actions → *Database backup* → *Run workflow*).
- **What it does:** installs `mysqldump` → dumps the Aiven database (`--single-transaction`, `--routines`) → **gzip** → sanity checks (file size > 3 KB and it contains `CREATE TABLE sales` and `stock_movements`) → **encrypts with AES-256** (`openssl enc -aes-256-cbc -pbkdf2`) using the secret `BACKUP_PASSPHRASE` → uploads it as an **artifact** named `db-backup`, **kept 30 days**.
- **GitHub repository secrets needed:** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `BACKUP_PASSPHRASE`.
- Output file name: `backup-YYYY-MM-DD_HH-MM.sql.gz.enc`.

**Read this twice:**

1. **If I lose `BACKUP_PASSPHRASE`, every backup is useless.** Keep a copy in a password manager (not only in GitHub, secrets cannot be read back).
2. Backups live **30 days** and only as GitHub artifacts. If I need longer history, download one now and then and keep it somewhere else (an external drive or private cloud storage).
3. A backup that has never been restored is only a hope. **Do a test restore** (below) every few months.
4. The dump contains customer and supplier data (hashes, balances). It is encrypted – keep it that way and keep the repo private.

### 14.2 Manual backup (local)
`cd backend && npm run backup` → `backend/backups/<db>-<time>.sql.gz` (needs `mysqldump` installed). This one is **not encrypted** – do not commit or share it. ⚠️ `backend/.gitignore` currently ignores only `.env` and `node_modules`, so **add a line `backups/` to `backend/.gitignore`** before ever running this, otherwise an unencrypted dump of customer data could be committed by accident.

### 14.3 Restore – step by step

**Situation:** data is deleted, corrupted, or the database is lost.

1. **Stop the damage.** Tell the client not to enter new data. If something was wrongly deleted, a later backup may be better than an earlier one, so decide the restore point first (backups are every 6 hours).
2. **Get the backup file.** GitHub → repo → **Actions** → *Database backup* → open the run you want → download **`db-backup`** (a `.zip`) → unzip → you get `backup-….sql.gz.enc`.
3. **Decrypt.** In a terminal (Git Bash / WSL / Linux / macOS):
   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -in backup-2026-11-16_12-00.sql.gz.enc -out dump.sql.gz
   # it asks for the passphrase = the BACKUP_PASSPHRASE secret
   gunzip dump.sql.gz        # gives dump.sql
   ```
   If it says "bad decrypt", the passphrase is wrong.
4. **Practice restore first (always).** In HeidiSQL, connect to the Aiven server → create a new empty database `fabric_restore_test` (if the plan does not allow it, use a local MySQL) → select it → **File → Run SQL file…** → pick `dump.sql`. Wait for it to finish.
   (CLI alternative: `mysql -h HOST -P PORT -u USER -p --ssl-mode=REQUIRED fabric_restore_test < dump.sql`)
5. **Check it.** Look at the tables, count rows (`SELECT COUNT(*) FROM sales`), and look at the newest purchase/sale. To check through the app, run a local backend with `DB_NAME=fabric_restore_test`, log in, open **Settings → Data check** (it should say OK).
6. **Restore into the real database.** Select the real database in HeidiSQL → **Run SQL file…** → `dump.sql`. The dump starts each table with `DROP TABLE IF EXISTS`, so it **replaces** the tables. Anything entered after the backup time is gone, so re-enter it from the client's paper/notes.
7. **Nothing to change in Vercel.** The host, database name and password are unchanged. The dump also contains `schema_migrations`, so `npm run migrate` will report "up to date". (If the backup is older than a migration, `npm run migrate` will apply the missing one.)
8. **Verify live.** Log in on the real site, open Dashboard, Suppliers, one purchase's Bill, and run **Settings → Data check**.
9. **Write down what happened** (date, which backup, what was lost) so the client is told honestly.

**Prevent the next one:** before "Delete all data" or any risky change, trigger the workflow manually (*Run workflow*) and wait for the green tick.

---

## 15. Recipes: how to add or change things

### 15.1 Add a new simple register (copy the Containers pattern)
Containers is the smallest complete example: a table plus create/edit/void. For a new register `things`:

1. **Migration** `backend/migrations/007_things.sql`: table with `id`, your fields, `status ENUM('active','void')`, `idempotency_key VARCHAR(64) NULL UNIQUE`, `created_at`, a date index, `CHECK`s.
2. **Service** `backend/src/services/things.js`: `listThings`, `createThing` (idempotency + transaction + `audit`), `updateThing` (lock row with `FOR UPDATE`), `voidThing`.
3. **Route** `backend/src/routes/things.js`: zod schema, `withKey`, `validate`, `asyncHandler`.
4. **Mount** in `backend/src/app.js` (`app.use('/api/things', thingsRouter)` – *after* `requireAuth`).
5. **Reset** – add the table name to `TABLES` in `services/reset.js` (child tables before parents).
6. **Tests** – add a `describe` in `business.test.js` (create, duplicate key, edit, void, bad input).
7. **Frontend** – `pages/Things.jsx` (copy `Containers.jsx`), add an icon + item in `navItems`/`icons` in `Layout.jsx`, and `'/things': <Things />` in `App.jsx`.
8. Run: `npm run migrate`, `npm test`, `npm run build`. Deploy and run the migration on Aiven.

### 15.2 Add a field to an existing table
1. New migration `ALTER TABLE … ADD COLUMN …` (never edit old migrations).
2. Add it to the zod schema in the route, the `INSERT`/`UPDATE` in the service, and the `SELECT` that returns it.
3. Add the input in the page's form and the column in its table.
4. Add/extend a test. Run the migration on production.

### 15.3 Add a report
Add a function to `reportBuilders` in `services/reports.js` returning `{ columns, rows, totals }`; add its name to the report list in `pages/Reports.jsx`. Screen, Excel and PDF all work automatically.

### 15.4 Change a business rule safely
Find the service function, change it, then run `npm test`. If a test fails, either I broke something or the old rule was intentionally replaced – update the test deliberately, not casually. (Example: allowing supplier advance payments removed the "cannot overpay supplier" test on purpose.)

### 15.5 Add a new currency
Today `CNY|PKR` is hard-coded in `suppliers.currency` validation (`routes/parties.js`), `SYMBOL` in `format.js`, and the rate logic in `purchases.js`/`payments.js`. A third currency means: a `rates` table or per-currency settings, and replacing the `currency === 'PKR' ? 1 : …` checks with a lookup.

### 15.6 Typical debugging path
1. Browser DevTools → Network → find the failing request → read the response `error`.
2. Reproduce with a test in `business.test.js`.
3. Read the **service** function – the logic is there, not in the route.
4. Check the DB with HeidiSQL (`stock_movements`, `audit_log` tell what happened and when).
5. Run **Settings → Data check** if numbers look wrong.

---

## 16. Known limits, gotchas and ideas

**Gotchas**

- Forgetting to run a migration on production → `500` on pages that use the new column.
- `JWT_SECRET` change → everyone is logged out. `CORS_ORIGIN` must be the exact frontend URL (no trailing path).
- Supplier currency can only be changed before the first purchase/payment.
- Shipping/tax can be added only while that purchase's fabric still has stock, and removed only if the stock has not been sold.
- The PKR figure next to ¥ amounts is an **estimate** from the default rate (`0` = unset = no estimate shown).
- A supplier's own bill may differ by about 1 unit from ours because they truncate decimals (a "bill total override" could be added).
- Sale quantity is entered in yards (only the rate can be per meter).
- Purchases saved with one rate for all three parts (before the per-part rate change) cannot be edited; cancel and re-enter.
- Container names are free text, so spelling differences (Durrani / Duraani) create separate names.
- One shared login, no roles.

**Not built yet / ideas**

- Thaan-wise bill as a PDF/Excel file (screen view exists).
- Quantity in meters on sales.
- Automatic restore test; copying backups to a second place beyond 30 days.
- Per-user accounts and roles.
- Printing/receipts (client said sales are records only).
- A proper job queue/VPS if traffic or serverless limits become a problem.

---

## 17. Interview cheat sheet

Be able to answer these in your own words (the answers are in the sections noted).

1. **Walk me through the architecture.** React SPA → Express API → MySQL; JWT auth; services hold the rules. (§5)
2. **Why a stock ledger and also a cached stock number?** History/audit vs speed; integrity check proves they match. (§8.1)
3. **How do you calculate profit?** Weighted-average cost frozen at sale time; revenue − discount share − COGS; net = gross − expenses − clearing. (§8.2, §9.11)
4. **How do you stop two users overselling the same stock?** Transaction + `SELECT … FOR UPDATE`, rows locked in id order to avoid deadlocks. (§8.3)
5. **What happens if the user double-clicks Save, or the network retries?** Idempotency key + UNIQUE index. (§8.4)
6. **Why never delete a sale?** Audit and books must stay explainable; cancel reverses stock with stored values. (§8.5)
7. **How do you handle two currencies?** Supplier ledger in ¥, stock cost frozen in PKR at the purchase-day rate. (§8.7)
8. **Why DECIMAL and `r2()`, not floats?** Money precision; float rounding drift. (§3, §8.6)
9. **Why store the rate in the unit it was typed?** Converting would introduce rounding drift versus the supplier's bill. (§8.6)
10. **How is the app secured?** bcrypt, JWT, helmet, CORS allow-list, rate-limited login, zod validation, parameterised SQL, protected destructive actions. (§8.8)
11. **How do schema changes reach production?** Numbered migrations, run once, tracked in `schema_migrations`. (§7.5)
12. **How do you know a change didn't break money logic?** 60 end-to-end API tests; integrity check. (§12)
13. **What is your disaster recovery plan?** Encrypted dump every 6 h to GitHub, 30-day retention, restore tested into a scratch DB first. (§14)
14. **Why was clearing not part of stock cost?** One lump sum across mixed goods can't be fairly allocated per purchase; it's an operating expense. (§9.8)
15. **What would you improve?** Roles/per-user login, long-term backups, PDF bills, VPS if limits hit. (§16)

---

## 18. Glossary

| Word | Meaning |
|---|---|
| Thaan | One roll/piece of fabric; each has a length in yards |
| Set | A design made of three parts: Front, Back, Dupatta |
| Yard / Meter | 1 yard = 0.9144 meter. Stock in yards; supplier bills in meters |
| ¥ / CNY | Chinese Yuan. China supplier's currency |
| PKR / Rs | Pakistani Rupee. Customers' and stock-cost currency |
| Udhar | Credit; money owed |
| Landed cost | Extra cost to bring goods in (shipping, tax) added to stock cost |
| Clearing | Paying port agents to release a container |
| Container / Bales | Shipping container; bales are the packed bundles inside |
| COGS | Cost of goods sold |
| Idempotency key | A unique id sent with a request so repeating it cannot create a second record |
| Ledger | A list of changes (movements) from which totals can be rebuilt |
| Void / Cancel | Marking a record as undone instead of deleting it |
| Migration | A numbered SQL file that changes the database structure |
| JWT | Signed token proving who is logged in |