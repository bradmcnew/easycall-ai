# User Setup: Phase 1 Foundation

## Prerequisites

### PostgreSQL

A local PostgreSQL server is required for the database.

**Why:** Stores users, ISPs, calls, and call events.

**Setup:**

1. Install PostgreSQL if not already installed:
   ```bash
   # macOS with Homebrew
   brew install postgresql@17
   brew services start postgresql@17
   ```

2. Create the database:
   ```bash
   createdb easycallai
   ```

3. Update `.env.local` with your connection string:
   ```
   DATABASE_URL=postgresql://your_username@localhost:5432/easycallai
   ```
   Replace `your_username` with your PostgreSQL username (often your macOS username).

4. Run migrations and seed:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. Verify:
   ```bash
   psql easycallai -c "SELECT count(*) FROM isp;"
   # Should return: 6
   ```

## Environment Variables

All variables are in `.env.local`. The following need real values before Phase 1 Plan 02 (auth):

| Variable | Status | Needed For |
|----------|--------|------------|
| `DATABASE_URL` | Set for local dev | Now |
| `BETTER_AUTH_SECRET` | Placeholder | Plan 02 (auth) |
| `BETTER_AUTH_URL` | Set (localhost:3000) | Plan 02 (auth) |
| `TWILIO_ACCOUNT_SID` | Placeholder | Plan 02 (auth) |
| `TWILIO_AUTH_TOKEN` | Placeholder | Plan 02 (auth) |
| `TWILIO_VERIFY_SERVICE_SID` | Placeholder | Plan 02 (auth) |
