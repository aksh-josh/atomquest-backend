# AtomQuest Backend — Goal Setting & Tracking Portal

## Quick Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your DATABASE_URL and a strong JWT_SECRET
```

### 3. Set up database
```bash
npx prisma db push        # Create tables (no migration history)
node prisma/seed.js       # Seed demo data
```

### 4. Run development server
```bash
npm run dev
```

---

## Deploy to Railway (Recommended - Free Tier)

1. Push code to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add a **PostgreSQL** plugin inside the project
4. Set environment variables:
   - `DATABASE_URL` — auto-filled by Railway PostgreSQL plugin
   - `JWT_SECRET` — any long random string
   - `FRONTEND_URL` — your frontend URL
5. Railway auto-detects Node.js and runs `npm start`
6. After deploy: open Railway shell and run `node prisma/seed.js`

---

## API Reference

### Auth
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/auth/login` | Public | Login, returns JWT |
| GET | `/api/auth/me` | Any | Current user info |
| POST | `/api/auth/register` | Admin | Create user |
| PUT | `/api/auth/change-password` | Any | Change password |

### Goals (Employee)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/goals/my-sheet` | Employee | Get own goal sheet |
| POST | `/api/goals/save` | Employee | Save goals (draft) |
| POST | `/api/goals/submit` | Employee | Submit for approval |
| POST | `/api/goals/:goalId/achievement` | Employee | Log achievement |

### Goals (Manager)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/goals/team` | Manager | Team goal sheets |
| PUT | `/api/goals/:sheetId/approve` | Manager | Approve goals |
| PUT | `/api/goals/:sheetId/reject` | Manager | Reject with note |
| PUT | `/api/goals/:sheetId/inline-edit` | Manager | Edit before approval |

### Check-ins
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/checkins/:sheetId` | Manager | Submit check-in |
| GET | `/api/checkins/team` | Manager | Team check-in status |
| GET | `/api/checkins/my` | Employee | Own check-in history |

### Admin
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET/POST/PUT/DELETE | `/api/admin/users` | Admin | User management |
| GET/POST | `/api/admin/cycles` | Admin | Cycle management |
| PUT | `/api/admin/cycles/:id/activate` | Admin | Activate cycle |
| PUT | `/api/admin/goals/:sheetId/unlock` | Admin | Unlock approved goals |
| GET | `/api/admin/audit-logs` | Admin | Full audit trail |
| GET | `/api/admin/completion-dashboard` | Admin | Completion stats |

### Reports
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/reports/achievement?format=csv` | Any | Achievement report (JSON or CSV) |
| GET | `/api/reports/completion` | Admin | Check-in completion |

---

## Demo Credentials
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@atomquest.com | Admin@123 |
| Manager | manager@atomquest.com | Manager@123 |
| Employee | employee@atomquest.com | Employee@123 |
