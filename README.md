# 1590 Charity Club Mini Program

> A WeChat Mini Program for a campus charity club — built around the care of stray cats on campus, hosting the club's daily feed, cat gallery, charity sale, and volunteer activities.
>
> Native WeChat Mini Program + Node.js/Koa backend + MySQL/MariaDB
>
> **Author**: [Eason Yuan (@Eason928)](https://github.com/Eason928) · Developed June–July 2026 · See [14. Author & Project Background](#14-author--project-background)

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Features](#2-features)
- [3. Tech Stack](#3-tech-stack)
- [4. Project Structure](#4-project-structure)
- [5. Getting Started](#5-getting-started)
- [6. Environment Variables](#6-environment-variables)
- [7. Database Design](#7-database-design)
- [8. API Reference](#8-api-reference)
- [9. Roles & Permissions](#9-roles--permissions)
- [10. Deployment](#10-deployment)
- [11. Known Issues & Technical Debt](#11-known-issues--technical-debt)
- [12. Handover Notes](#12-handover-notes)
- [13. Repository Info](#13-repository-info)
- [14. Author & Project Background](#14-author--project-background)

---

## 1. Overview

This is the campus WeChat Mini Program of the "1590 Charity Club", serving all students and staff of the school. Core scenarios:

- Club members and students can publish **cat feed posts** (posts with images), which go public after admin review
- A **cat gallery** documenting campus stray cats (personality, habits, health status, whereabouts)
- A **charity sale** showcase for the club's goods
- Publishing and signing up for **volunteer activities**
- Students verify their identity with **student ID + initial password**, then bind their WeChat login — no need to remember passwords repeatedly

Architecturally it is a **decoupled** project: the Mini Program is written in pure native WeChat Mini Program code (no framework), the backend is a single-file Koa service, and data lives in MySQL/MariaDB.

---

## 2. Features

| Module | Audience | Description |
|--------|----------|-------------|
| Cat Feed (Forum) | Everyone | Image posts, shown after admin review; supports pinning and spotlighting |
| Cat Gallery | Everyone | Browsable cat profiles, can be linked to posts |
| Charity Sale | Everyone | Product showcase; categories maintained in the admin panel |
| Volunteer Activities | Everyone | Activity publishing and sign-up, with status (pending / confirmed / attended) |
| Profile | Everyone | WeChat login → student ID verification → forced first-time password change → personal center |
| Feedback | Everyone | Submit suggestions / bug reports / other; developers can review and mark as resolved |
| Admin Panel | Admin and above | Post review, cat management, sale products, volunteer activities, user review |
| Developer Console | Developer / Rongdada | Dashboard (server & database status), system settings, student roster import, feedback handling |
| About Us | Everyone | Club introduction, editable from the admin panel |

---

## 3. Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Native WeChat Mini Program | No framework; pages registered in `app.json`, unified request layer in `utils/api.js` |
| Frontend styling | Native WXSS | Custom design system: 19 CSS variables + 24 SVG icons (Feather Icons, MIT) |
| Backend runtime | Node.js (≥ 18) | Single process, listening on `0.0.0.0:3000` |
| Backend framework | Koa 3 | Middleware-based; request body parsing via koa-body |
| Routing | @koa/router 12 | 73 endpoints, all defined in `server.js` |
| Auth | jsonwebtoken 9 | JWT, 7-day expiry, `Authorization: Bearer <token>` |
| Database driver | mysql2 (promise) | Connection pool, max 10 connections |
| Database | MySQL / MariaDB | Database name `cat_forum`, 9 tables |
| Configuration | dotenv 17 | Reads `backend/.env` |
| Process manager | PM2 | Process name `cat-app` on the server |

> Note: `package.json` declares `koa-cors` and `koa-static`, but the code does not actually use them (CORS is handled by `@koa/cors`, static files are served by hand-written middleware). These are legacy dependencies.

---

## 4. Project Structure

```
1590-charity-miniprogram/
├── miniprogram/                    # WeChat Mini Program frontend
│   ├── app.js                      # Global logic; API_BASE configured here
│   ├── app.json                    # Page registration + tabBar config
│   ├── app.wxss                    # Global styles
│   ├── project.config.json         # DevTools project config (contains AppID)
│   ├── sitemap.json                # WeChat indexing config
│   ├── data/
│   │   └── cats.js                 # Sample cat data
│   ├── images/                     # Icons, logo, image assets
│   │   ├── tab/                    # tabBar icons (5 sets, incl. selected states)
│   │   ├── logo/                   # Club logo
│   │   └── cats/                   # Cat photos
│   ├── pages/                      # 15 pages, 4 files each (.js/.json/.wxml/.wxss)
│   ├── styles/
│   │   ├── design-tokens.wxss      # Design system variables (colors/radius/shadows/spacing/font sizes)
│   │   └── icons.wxss              # SVG icon set (24 icons)
│   └── utils/
│       └── api.js                  # Unified API request layer (get/post/put/del/upload)
│
└── backend/                        # Node.js backend
    ├── server.js                   # All backend logic (1,536 lines — see below)
    ├── schema.sql                  # Database DDL script (9 tables)
    ├── package.json                # Dependencies
    ├── package-lock.json
    ├── db-monitor.sh               # Live MySQL query log monitor (dev aid)
    ├── make_tab_icons.py           # One-off script: generate tabBar icons
    └── uploads/                    # Runtime image upload directory (not versioned)
```

### Frontend Pages (15)

| Page | Path | Description |
|------|------|-------------|
| Splash | `pages/splash` | First-screen loading |
| Cat Gallery | `pages/index` | tabBar "Cat Gallery" |
| Cat Detail | `pages/detail` | A single cat's profile |
| Feed | `pages/forum` | tabBar "Feed", post list |
| New Post | `pages/post` | Publish a new post |
| Post Detail | `pages/post-detail` | Post content and comments |
| Charity Sale | `pages/sale` | tabBar "Charity Sale", product list |
| Product Detail | `pages/sale-detail` | A single sale product |
| Volunteer | `pages/volunteer` | Activity list |
| Activity Detail | `pages/volunteer-detail` | Activity detail and sign-up |
| My Volunteering | `pages/my-volunteer` | The user's own sign-up records |
| Profile | `pages/profile` | tabBar "Profile", login and personal center |
| Admin | `pages/admin` | Admin / developer panel |
| About Us | `pages/about` | tabBar "About Us" |
| Feedback | `pages/feedback` | Submit and view feedback |

### How `server.js` Is Organized

The backend has **no layered directories** (no controllers / routes / models split). All logic lives in the single file `backend/server.js`, 1,536 lines. Its internal order is:

1. Load dotenv, create the MySQL connection pool
2. Global error-catching middleware
3. `cors()`
4. `koaBody` body parsing (JSON/form limit 20 MB, upload limit 5 MB per file, stored in `uploads/`)
5. Static file serving: `/uploads/` → `backend/uploads/`, `/images/` → `miniprogram/images/`
6. JWT helpers + auth middleware (populates `ctx.user` when a token is present; never blocks)
7. 73 routes (all under `/api/`)
8. Listen on `0.0.0.0:3000`

> Permission checks are written by hand inside each route (`ctx.user.role`), with no shared authorization middleware. Keep this in mind when changing endpoints.

---

## 5. Getting Started

### Prerequisites

| Dependency | Version | Notes |
|------------|---------|-------|
| Node.js | ≥ 18 | Backend runtime |
| MySQL or MariaDB | 5.7+ / 10.3+ | Developed on MariaDB 11.7; `schema.sql` is normalized and also imports cleanly on MySQL 8 |
| WeChat DevTools | Latest stable | To run and debug the frontend |

### Step 1: Prepare the Database

```bash
# 1. Create the database
mysql -u root -p -e "CREATE DATABASE cat_forum DEFAULT CHARACTER SET utf8mb4;"

# 2. Import the schema (9 tables)
mysql -u root -p cat_forum < backend/schema.sql

# 3. Create a dedicated application account (do NOT run the app as root)
mysql -u root -p -e "
CREATE USER 'catforum'@'localhost' IDENTIFIED BY 'your-db-password';
GRANT ALL PRIVILEGES ON cat_forum.* TO 'catforum'@'localhost';
FLUSH PRIVILEGES;"
```

### Step 2: Configure and Start the Backend

```bash
cd backend

# 1. Create the config file (see section 6)
cp .env.example .env        # if .env.example is absent, create .env by hand
# Edit .env: database password, WeChat AppSecret, JWT secret, etc.

# 2. Install dependencies
npm install

# 3. Start
node server.js                        # dev: run in the foreground
pm2 start server.js --name cat-app    # prod: managed by PM2
```

On a successful start you will see:

```
📁 猫咪图片服务 → /images/
🐱 公益社小猫小程序后端已启动 → http://localhost:3000
📸 上传图片访问 → http://localhost:3000/uploads/
```

### Step 3: Run the Frontend

1. Open the `miniprogram/` directory in **WeChat DevTools**
2. Make sure `appid` in `project.config.json` matches your own Mini Program AppID
3. Point `API_BASE` in `miniprogram/app.js` at your backend:
   ```js
   globalData: {
     API_BASE: 'http://82.157.182.21:3000',   // ← change to your backend address
   }
   ```
4. **For local development**: enable "Do not verify valid domain names, web-view, TLS versions, and HTTPS certificates" in DevTools, otherwise `http://localhost:3000` will be blocked.

---

## 6. Environment Variables

All backend configuration comes from `backend/.env`. That file **is excluded by `.gitignore` and never enters version control** — you must create it yourself after taking over.

| Variable | Example | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | Database host |
| `DB_PORT` | `3306` | Database port |
| `DB_USER` | `catforum` | Database account (use a dedicated account, not root) |
| `DB_PASSWORD` | `your password` | Database password |
| `DB_NAME` | `cat_forum` | Database name |
| `JWT_SECRET` | `a random string` | JWT signing key — **change this to a random value** |
| `ADMIN_PASSWORD` | `your password` | Used for admin-side purposes |
| `WX_APPID` | `wx...` | WeChat Mini Program AppID |
| `WX_SECRET` | `your AppSecret` | WeChat Mini Program AppSecret (request from the Mini Program administrator) |
| `PORT` | `3000` | Backend listening port |
| `DEV_MODE` | `true` / `false` | Development mode |

Reference `.env` template:

```dotenv
# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=catforum
DB_PASSWORD=
DB_NAME=cat_forum

# Auth
JWT_SECRET=

# Admin
ADMIN_PASSWORD=

# WeChat
WX_APPID=
WX_SECRET=

# Server
PORT=3000
DEV_MODE=true
```

### About the WeChat Login "Test Mode"

When `WX_APPID` / `WX_SECRET` are unset, or the WeChat API call fails, the backend **silently degrades** to test mode, generating a fake identity of the form `mock_openid_<first 8 chars of code>`. This makes local development easy. In this mode every WeChat login goes through the "first login" flow (student ID verification → password change → binding).

> ⚠️ In production, make sure `WX_SECRET` is correctly configured — otherwise it will silently fall back to this test branch.

---

## 7. Database Design

- **Database type**: MySQL / MariaDB
- **Database name**: `cat_forum`
- **Charset**: `utf8mb4` / `utf8mb4_unicode_ci`
- **Tables**: 9
- **DDL script**: `backend/schema.sql` (structure only, no data)

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `users` | Users | `openid` (unique), `student_id` (unique), `password`, `role`, `approved`, `password_reset_required` |
| `student_roster` | Student roster | `student_id` (unique), `name`, `password` (initial password, defaults to student ID) |
| `cats` | Cat gallery | `name`, `gender`, `color`, `age`, `personality`, `health_status`, `status` |
| `posts` | Forum posts | `user_id` (FK → users), `cat_id`, `images`, `status` (pending/approved/rejected), `is_pinned`, `is_spotlight` |
| `products` | Charity sale products | `name`, `price`, `category`, `status` (on_sale/sold_out/hidden) |
| `volunteer_tasks` | Volunteer activities | `title`, `date_time`, `deadline`, `slots_needed`, `slots_filled`, `status` |
| `volunteer_applications` | Activity sign-ups | `task_id`, `user_id`, `contact_info`, `status` (pending/confirmed/attended) |
| `settings` | Key-value config | `key` (primary), `value`; holds `product_categories`, `admin_applications_open`, etc. |
| `feedback` | Feedback | `user_id` (FK → users), `content`, `type`, `status` (pending/resolved), `reply` |

### Relationships

```
users ──< posts                 (posts.user_id → users.id, ON DELETE CASCADE)
users ──< feedback              (feedback.user_id → users.id, ON DELETE CASCADE)
users ──< volunteer_applications
users ── student_roster         (linked via student_id, not a foreign key)
volunteer_tasks ──< volunteer_applications
cats  ──< posts                 (posts.cat_id, not a foreign key)
```

### Login Flow

```
User taps "WeChat One-Tap Login"
  → wx.login() returns code
  → POST /api/wx-login { code }
      ├─ openid not bound → returns needStudentVerify
      │     → enter student ID + initial password → POST /api/student-verify
      │         ├─ found in roster → bind openid
      │         └─ create new user (password_reset_required = 1)
      │     → forced password change → POST /api/reset-password → logged in
      └─ openid already bound
            ├─ password_reset_required = 1 → forced password change → login
            └─ password_reset_required = 0 → return token directly (valid 7 days)
```

> The `feedback` table in `schema.sql` is **reconstructed** from the SQL statements in the code — the original development database had no such table (see [11. Known Issues](#11-known-issues--technical-debt)).

---

## 8. API Reference

Base prefix `/api`, **73** endpoints in total. Unless marked "public", all require `Authorization: Bearer <token>`.

### Login & Accounts

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/api/wx-login` | Public | WeChat login; returns a token or a need-verify / need-reset flag |
| POST | `/api/student-verify` | Public | Verify student ID + initial password and bind openid |
| POST | `/api/student-direct-login` | Public | Log in directly with student ID + password (no WeChat) |
| POST | `/api/reset-password` | Auth | Forced first-time password change |
| POST | `/api/login` | Public | Username + password login (for developers/admins) |
| POST | `/api/register` | Public | Register |
| GET | `/api/me` | Auth | Current user info |

### Student Roster (Developer / Rongdada only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/students` | List roster |
| POST | `/api/admin/students` | Add a student |
| POST | `/api/admin/students/batch` | Bulk import |
| DELETE | `/api/admin/students/:studentId` | Remove a student |

### Cat Gallery

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/cats` | Public | Cat list |
| GET | `/api/cats/:id` | Public | Cat detail |
| GET | `/api/admin/cats` | Admin | Admin cat list |
| POST | `/api/admin/cats` | Admin | Add a cat |
| POST | `/api/admin/cats/:id` | Admin | Update a cat (supports image upload) |
| PUT | `/api/admin/cats/:id` | Admin | Update a cat |
| DELETE | `/api/admin/cats/:id` | Admin | Delete a cat |

### Forum Posts

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/posts` | Public | List of approved posts |
| GET | `/api/posts/post/:id` | Public | Post detail |
| POST | `/api/posts` | Auth | Create a post (pending review) |
| GET | `/api/my/posts` | Auth | My posts |
| PUT | `/api/posts/:id` | Auth | Edit my post |
| DELETE | `/api/posts/:id` | Auth | Delete my post |
| GET | `/api/admin/posts/pending` | Admin | Posts pending review |
| GET | `/api/admin/posts/all` | Admin | All posts |
| POST | `/api/admin/posts/:id/approve` | Admin | Approve |
| POST | `/api/admin/posts/:id/reject` | Admin | Reject |
| PUT | `/api/admin/posts/:id/cat` | Admin | Link a cat |
| DELETE | `/api/admin/posts/:id` | Admin | Delete a post |

### Users & Permissions

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/admin/users` | Admin | User list |
| GET | `/api/admin/users/pending` | Admin | Users pending review |
| POST | `/api/admin/users/:id/approve` | Admin | Approve |
| PUT | `/api/admin/users/:id` | Admin | Edit a user (nickname/password/role) |
| POST | `/api/admin/users/:id/revoke` | Developer | Revoke admin rights |
| DELETE | `/api/admin/users/:id` | Developer | Delete a user |
| POST | `/api/apply-admin` | Auth | Apply to become an admin |
| GET | `/api/admin/applications` | Admin | Admin application list |
| POST | `/api/admin/applications/:id/approve` | Admin | Approve an application |
| POST | `/api/admin/applications/:id/reject` | Admin | Reject an application |
| GET | `/api/settings/admin-applications` | Public | Whether admin applications are open |

### Developer Console (Developer / Rongdada only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dev/dashboard` | Dashboard (Node version, memory, uptime, DB table count/size, various counters) |
| GET | `/api/dev/users` | User list (developer view) |
| PUT | `/api/dev/users/:id` | Edit a user |
| PUT | `/api/dev/settings` | Update system settings |

### System Settings & About Us

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/settings` | Public | Read public settings |
| GET | `/api/about` | Public | About Us content |
| PUT | `/api/admin/about` | Admin | Update About Us |

### Charity Sale

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/products` | Public | Product list |
| GET | `/api/products/:id` | Public | Product detail |
| GET | `/api/admin/products` | Admin | Admin product list |
| POST | `/api/admin/products` | Admin | Add a product |
| PUT | `/api/admin/products/:id` | Admin | Update a product |
| DELETE | `/api/admin/products/:id` | Admin | Delete a product |
| GET | `/api/admin/product-categories` | Admin | Category list |
| POST | `/api/admin/product-categories` | Admin | Add a category |
| DELETE | `/api/admin/product-categories/:name` | Admin | Delete a category |

### Volunteer Activities

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/volunteer/tasks` | Public | Activity list |
| GET | `/api/volunteer/tasks/:id` | Public | Activity detail |
| POST | `/api/volunteer/apply` | Auth | Sign up |
| GET | `/api/volunteer/my-applications` | Auth | My sign-ups |
| GET | `/api/admin/volunteer/tasks` | Admin | Admin activity list |
| POST | `/api/admin/volunteer/tasks` | Admin | Publish an activity |
| PUT | `/api/admin/volunteer/tasks/:id` | Admin | Update an activity |
| DELETE | `/api/admin/volunteer/tasks/:id` | Admin | Delete an activity |
| GET | `/api/admin/volunteer/applications` | Admin | All sign-ups |
| GET | `/api/admin/volunteer/applications/:taskId` | Admin | Sign-ups for one activity |
| PUT | `/api/admin/volunteer/applications/:id` | Admin | Update sign-up status |

### Feedback

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/api/feedback` | Auth | Submit feedback (suggestion / bug / other) |
| GET | `/api/feedback/my` | Auth | My feedback |
| GET | `/api/feedback` | Developer only | All feedback |
| PUT | `/api/feedback/:id/resolve` | Developer only | Mark as resolved |

### Other

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/pending-summary` | Admin | Pending-work summary (posts/users/applications), used for badges |

### Static Assets

| Path | Description |
|------|-------------|
| `/uploads/*` | User-uploaded images |
| `/images/*` | Mini Program local images (mapped to `miniprogram/images/`) |

---

## 9. Roles & Permissions

There are **4 roles**, defined in the `users.role` enum:

| Role | Value | Description |
|------|-------|-------------|
| Student | `user` | Default role; can post (subject to review), sign up for volunteering, submit feedback |
| Admin | `admin` | Content review, cat/product/activity/user management |
| Developer | `developer` | Full access + system settings + student roster + feedback handling |
| Rongdada | `rongdada` | Same level as developer (club advisor role) |

Permission constants in the code (`server.js`):

```js
const STUDENT_ADMIN_ROLES = ['developer', 'rongdada'];          // student roster management
const ADMIN_ROLES         = ['admin', 'developer', 'rongdada'];  // content management
const DEV_ROLES           = ['developer', 'rongdada'];           // developer console / system settings
```

> Permission checks are scattered inside individual routes (e.g. `if (!ctx.user || !ADMIN_ROLES.includes(ctx.user.role))`), with no centralized authorization middleware. Always check the role explicitly when adding endpoints.

---

## 10. Deployment

> The following describes the current production setup; adjust as needed after taking over. **No passwords or keys are recorded in this document** — request them separately from the original owner, or regenerate them.

| Item | Value |
|------|-------|
| Server | Tencent Cloud Lighthouse |
| Server address | `82.157.182.21` |
| Backend port | `3000` |
| Process manager | PM2, process name `cat-app` |
| Backend deploy path | `/root/cat_app/backend/` |
| Domain | `www.aidi1590.com` (ICP filing in progress; old domain `aidi1590.site` retired) |
| HTTPS | Let's Encrypt certificate (`/etc/letsencrypt/live/...`) |
| Upload directory | `backend/uploads/` on the server |

### Deployment Steps (outline)

```bash
# 1. Pull the code
cd /root/cat_app
git pull

# 2. Install dependencies (first time, or when they change)
cd backend && npm install

# 3. Configure environment variables
vim backend/.env      # fill in per section 6

# 4. Start / restart the service
pm2 start server.js --name cat-app     # first time
pm2 restart cat-app                    # after an update
pm2 logs cat-app                       # view logs
pm2 save                               # persist the process list for boot

# 5. Apply database schema changes (if schema.sql changed)
mysql -u root -p cat_forum < backend/schema.sql
```

### ⚠️ Known Deployment Constraints

- **The production Mini Program cannot use `http://` or bare IP addresses**: WeChat requires all requests to go over a filed (ICP-registered) HTTPS domain. The current `API_BASE` in `app.js` points at `http://82.157.182.21:3000`, which **only works in DevTools (with domain verification disabled) or in a trial build**; a public release must switch to a filed HTTPS domain.
- Until the domain filing completes, real-device preview requires disabling the DevTools domain check.

---

## 11. Known Issues & Technical Debt

Read this section first when taking over.

### 1. 🔴 Plaintext passwords

`users.password` and `student_roster.password` are `VARCHAR` **plaintext**, with no hashing. Anyone who can read the database (including logs, backups, `mysqldump` exports) can see every password directly.

**Recommendation**: switch to `bcrypt` / `argon2` salted hashing, and force a password change on first successful login.

### 2. 🔴 `feedback` table missing from the original database

The backend has 5 `/api/feedback` endpoints, but the original development database had **no `feedback` table**, and there is no `CREATE TABLE` for it anywhere in the code — so the "feedback" feature throws a "table does not exist" error as soon as it is used.

**Status**: `schema.sql` now contains a **reconstructed** version of the table based on the columns used in code (`id / user_id / content / type / status / reply / created_at`). It is created automatically on a fresh database; to fix an existing database, run the `feedback` block from `schema.sql`.

### 3. 🟡 Images returned inline as base64

`embedImages()` in `server.js` reads images from `uploads/` and inlines them into API responses as base64 data URLs (to work around images not displaying on real devices).

**Impact**: responses grow significantly when there are many images, slowing down the API.

**Recommendation**: once the HTTPS domain is live, drop this function and return plain image paths.

### 4. 🟡 `API_BASE` hard-coded

The server address is hard-coded in `miniprogram/app.js`. Switching environments means editing code.

**Recommendation**: extract it into a config constant or per-environment file.

### 5. 🟡 Backend is a single file

`server.js` is 1,536 lines with routes, middleware, and helpers all in one file, unlayered. Maintenance cost grows with size.

**Recommendation**: split into `routes/` `middlewares/` `utils/` `db/`.

### 6. 🟢 Unused dependencies

`koa-cors` and `koa-static` in `package.json` are unused and can be removed.

### 7. 🟢 One-off script has a stale path

`backend/make_tab_icons.py` still writes to the old directory `~/Desktop/公益社小猫小程序/miniprogram/images/tab`; running it today would write to the wrong place. It was used once to generate the tabBar icons and does not affect runtime.

### 8. 🟢 No tests, no CI

The project has no unit tests, integration tests, or CI configuration. All verification is manual.

### 9. 🟢 DB monitor script requires general_log

`backend/db-monitor.sh` needs MySQL's `general_log` enabled to output anything. It is a development aid and is not suited for running on production.

---

## 12. Handover Notes

### Information that must be handed over separately (never committed)

The following is **not in this repository** and must be obtained separately from the original owner:

- Database passwords (application account `catforum`, and root)
- Server SSH password / key
- WeChat Mini Program AppSecret
- `JWT_SECRET`
- `ADMIN_PASSWORD`

> These credentials were once scattered in plaintext across several local documents and session logs. **Never commit real credentials to this repository**; `.gitignore` already excludes `backend/.env`.

### Do this first after taking over

1. **Rotate every credential**: regenerate the database password, JWT secret, and WeChat AppSecret
2. **Create your own `.env`** following [6. Environment Variables](#6-environment-variables)
3. **Rebuild the database**: `mysql ... < backend/schema.sql` (note the reconstructed `feedback` table)
4. **Get it running locally** before changing any code
5. Fix the two 🔴 issues in [11. Known Issues](#11-known-issues--technical-debt)

### Do not commit

`.gitignore` already excludes:

```
backend/.env          # environment variables (all secrets)
backend/node_modules/ # dependencies
backend/uploads/      # runtime uploaded images
miniprogram/project.private.config.json  # developer-private config
.DS_Store / ._* / *.log
```

---

## 13. Repository Info

| Item | Value |
|------|-------|
| Repository | https://github.com/Eason928/1590-charity-miniprogram |
| Default branch | `main` |
| Mini Program AppID | `wx7cb51b239327b399` |
| Base library version | 3.16.1 |

### Local Development Workflow

```bash
git clone https://github.com/Eason928/1590-charity-miniprogram.git
cd 1590-charity-miniprogram

# Everyday commits
git add -A
git commit -m "describe what changed"
git push
```

### Pre-commit Checklist

- [ ] `.env`, real passwords, or AppSecret are not being committed
- [ ] `git diff --cached --name-only` shows exactly the files you expect
- [ ] If the database schema changed, `backend/schema.sql` was updated too

---

## 14. Author & Project Background

### Author

| Item | Info |
|------|------|
| Name | Eason Yuan |
| GitHub | [@Eason928](https://github.com/Eason928) |
| Role | Project initiator and sole developer |
| Development period | June 14 – July 17, 2026 (about 5 weeks) |
| Club | 1590 Charity Club |

### Work Performed

This project was taken from requirements through to deployment and operations by the author alone, including:

- **Requirements & planning** — feature breakdown, page structure design, database table design
- **Mini Program frontend** — structure and interactions for 15 pages, a custom design system (19 CSS variables + 24 SVG icons), and a unified request layer (`utils/api.js`)
- **Backend service** — Koa service setup, 73 API endpoints, JWT auth, a four-tier role system, image upload and static file serving
- **Database** — schema design for 9 tables (see [`backend/schema.sql`](backend/schema.sql)) and the DDL script
- **Deployment & operations** — Tencent Cloud server setup, PM2 process management, domain resolution and HTTPS certificate deployment
- **Ongoing maintenance** — post-launch feature iteration and troubleshooting

### Origin of the Project

The "1590 Charity Club" is a school charity club. The original idea for this project was simple: to move the club's scattered offline work — day-to-day care of stray cats, charity sales, and volunteer recruitment — into a place students open every day: a WeChat Mini Program. It makes the campus stray cats visible to more people, and makes taking part in charity work simpler and more approachable.

### A Note on the Development Timeline

This repository was **imported to GitHub in October 2026** from the local development directory, so the **git commit dates reflect the import date, not the actual development dates of each stage**.

The actual development period was mid-June to mid-July 2026 (about 5 weeks). The file modification times in the local development directory preserve that timeline; the staged development logs and run screenshots from that period are likewise kept locally by the author as corroborating evidence.

### Copyright

© 2026 Eason Yuan. This is a campus charity project; you are welcome to reference and build on it with attribution.

---

*A campus charity club project — contributions and continued improvement are welcome.*
