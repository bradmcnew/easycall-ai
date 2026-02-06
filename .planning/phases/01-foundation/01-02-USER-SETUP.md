# User Setup: Phone Auth (01-02)

## Services Required

### 1. Twilio (SMS OTP Verification)

**Why:** SMS OTP verification via Twilio Verify

**Account Setup:**
1. Create a Twilio account (free trial): https://www.twilio.com/try-twilio

**Dashboard Configuration:**
1. Create a Verify Service: Twilio Console -> Develop -> Verify -> Services -> Create new

**Environment Variables:**

| Variable | Source |
|----------|--------|
| `TWILIO_ACCOUNT_SID` | Twilio Console -> Account Info -> Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Console -> Account Info -> Auth Token |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio Console -> Develop -> Verify -> Services -> Create Service -> Service SID (starts with VA) |

### 2. BetterAuth Secret

**Why:** Auth secret for session signing

**Environment Variables:**

| Variable | Source |
|----------|--------|
| `BETTER_AUTH_SECRET` | Generate with: `openssl rand -base64 32` |

## .env.local Template

All variables are already templated in `.env.local`. Replace the placeholder values:

```env
BETTER_AUTH_SECRET=<paste output of: openssl rand -base64 32>
TWILIO_ACCOUNT_SID=AC<your-account-sid>
TWILIO_AUTH_TOKEN=<your-auth-token>
TWILIO_VERIFY_SERVICE_SID=VA<your-verify-service-sid>
```

## Verification

After setting up, start the dev server (`npm run dev`) and:
1. Visit http://localhost:3000
2. Enter your phone number
3. You should receive an SMS with a 6-digit code
4. Enter the code on the verify page
5. You should be redirected to /select-isp
