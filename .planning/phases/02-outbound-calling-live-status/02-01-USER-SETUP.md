# User Setup: Call Initiation Pipeline (02-01)

These services and environment variables must be configured before the call initiation flow will work end-to-end.

## 1. Vapi (Outbound Calling via Vapi AI)

### Environment Variables

Add to `.env.local`:

```bash
# Vapi
VAPI_API_KEY=          # From Vapi Dashboard -> Organization Settings -> API Keys
VAPI_PHONE_NUMBER_ID=  # From Vapi Dashboard -> Phone Numbers -> Import Twilio number -> copy Phone Number ID
VAPI_WEBHOOK_SECRET=   # Generate: openssl rand -hex 32
```

### Dashboard Configuration

1. **Import Twilio phone number into Vapi**
   - Go to: Vapi Dashboard -> Phone Numbers -> Import -> Select Twilio provider
   - Enter your Twilio Account SID and Auth Token
   - Select the phone number you want to use for outbound calls
   - Copy the resulting **Phone Number ID** into `VAPI_PHONE_NUMBER_ID`

### Generate Webhook Secret

```bash
openssl rand -hex 32
```

Copy the output into `VAPI_WEBHOOK_SECRET`. This secret is sent as `x-vapi-secret` header on webhook requests and validated by the webhook handler.

---

## 2. Pusher (Real-time Call Status Updates to Browser)

### Environment Variables

Add to `.env.local`:

```bash
# Pusher
NEXT_PUBLIC_PUSHER_KEY=     # Pusher Dashboard -> App Keys -> key
NEXT_PUBLIC_PUSHER_CLUSTER= # Pusher Dashboard -> App Keys -> cluster
PUSHER_APP_ID=              # Pusher Dashboard -> App Keys -> app_id
PUSHER_SECRET=              # Pusher Dashboard -> App Keys -> secret
```

### Dashboard Configuration

1. **Create a Pusher Channels app**
   - Go to: Pusher Dashboard -> Channels -> Create app
   - Select the cluster closest to your server
   - Copy the four values (key, cluster, app_id, secret) into the env vars above

---

## Complete `.env.local` Addition

```bash
# === Phase 2: Call Initiation ===

# Vapi
VAPI_API_KEY=your_vapi_api_key
VAPI_PHONE_NUMBER_ID=your_vapi_phone_number_id
VAPI_WEBHOOK_SECRET=your_generated_hex_secret

# Pusher
NEXT_PUBLIC_PUSHER_KEY=your_pusher_key
NEXT_PUBLIC_PUSHER_CLUSTER=your_pusher_cluster
PUSHER_APP_ID=your_pusher_app_id
PUSHER_SECRET=your_pusher_secret

# App URL (needed for webhook callback)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Note:** For local development, Vapi webhooks need a publicly accessible URL. Use `npx vapi listen` or a tunneling service (ngrok, Cloudflare Tunnel) and set `NEXT_PUBLIC_APP_URL` to the tunnel URL.
