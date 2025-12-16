# Supabase Cron Job Setup Guide

This guide explains how to set up Supabase pg_cron for automated birthday message sending.

## 🎯 Overview

- **Cost**: FREE on all Supabase plans
- **Frequency**: Checks every hour
- **Precision**: Sends messages at the exact time scheduled by each user
- **How it works**: 
  1. Cron job runs every hour at minute 0
  2. API checks all users with `auto_send_enabled = true`
  3. Compares current time with each user's `send_time`
  4. Sends messages to customers with birthdays today at the scheduled time

## 📋 Prerequisites

1. Supabase project set up
2. Database migrations applied (including `002_create_whatsapp_tables.sql`)
3. Vercel/deployment URL for your app
4. `CRON_SECRET` environment variable set

## 🚀 Setup Steps

### Step 1: Generate CRON_SECRET

Generate a secure random secret:

```bash
openssl rand -base64 32
```

Or use an online generator: https://randomkeygen.com/

### Step 2: Set Environment Variable

**In Vercel Dashboard:**
1. Go to your project → Settings → Environment Variables
2. Add `CRON_SECRET` with the value you generated
3. Redeploy your application

**In Local Development (.env.local):**
```env
CRON_SECRET=your-generated-secret-here
```

### Step 3: Update Migration File

Edit `supabase/migrations/003_setup_pg_cron.sql`:

1. Replace `YOUR_APP_URL` with your actual deployment URL:
   ```sql
   url := 'https://your-app.vercel.app/api/cron/birthday-automation',
   ```

2. Replace `YOUR_CRON_SECRET` with your generated secret:
   ```sql
   'Authorization', 'Bearer your-actual-secret-here'
   ```

### Step 4: Run Migration

**Option A: Via Supabase Dashboard**
1. Go to Supabase Dashboard → SQL Editor
2. Copy the contents of `supabase/migrations/003_setup_pg_cron.sql`
3. Replace the placeholders with your actual values
4. Run the SQL

**Option B: Via Supabase CLI**
```bash
supabase db push
```

### Step 5: Verify Setup

Check if the cron job is scheduled:

```sql
SELECT * FROM cron.job WHERE jobname = 'birthday-automation-hourly';
```

You should see a row with:
- `jobname`: `birthday-automation-hourly`
- `schedule`: `0 * * * *`
- `active`: `true`

### Step 6: Test Manually

Test the endpoint manually to ensure it works:

```bash
curl -X GET https://your-app.vercel.app/api/cron/birthday-automation \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected response:
```json
{
  "success": true,
  "message": "Processed 0 users, sent 0 messages, 0 failed",
  "results": {
    "processed": 0,
    "sent": 0,
    "failed": 0,
    "errors": []
  }
}
```

## ⏰ How Scheduling Works

1. **User sets schedule**: User selects a time (e.g., 08:00) in WhatsApp Services page
2. **Time stored**: Saved as `send_time` in `whatsapp_settings` table (format: `HH:MM:SS`)
3. **Cron runs hourly**: Supabase cron job calls API every hour at minute 0
4. **Time matching**: API checks if current hour and minute match user's `send_time`
5. **Messages sent**: If time matches, sends birthday messages to customers with birthdays today

### Example Timeline

- **08:00**: Cron runs → Checks users with `send_time = 08:00` → Sends messages
- **09:00**: Cron runs → Checks users with `send_time = 09:00` → Sends messages
- **10:00**: Cron runs → No users with `send_time = 10:00` → Skips

## 📊 Monitoring

### View Cron Job Status

```sql
SELECT * FROM cron.job;
```

### View Execution History

```sql
SELECT 
  jobid,
  jobname,
  start_time,
  end_time,
  status,
  return_message
FROM cron.job_run_details 
WHERE jobname = 'birthday-automation-hourly'
ORDER BY start_time DESC 
LIMIT 20;
```

### Check for Errors

```sql
SELECT * FROM cron.job_run_details 
WHERE jobname = 'birthday-automation-hourly' 
  AND status = 'failed'
ORDER BY start_time DESC;
```

### View User Settings

```sql
SELECT 
  u.email,
  ws.auto_send_enabled,
  ws.send_time,
  ws.timezone
FROM whatsapp_settings ws
JOIN auth.users u ON ws.user_id = u.id
WHERE ws.auto_send_enabled = true;
```

## 🔧 Troubleshooting

### Cron Job Not Running

1. **Check if scheduled:**
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'birthday-automation-hourly';
   ```

2. **Check execution history:**
   ```sql
   SELECT * FROM cron.job_run_details 
   WHERE jobname = 'birthday-automation-hourly'
   ORDER BY start_time DESC LIMIT 10;
   ```

3. **Verify API endpoint:**
   - Test manually with curl
   - Check API logs in Vercel Dashboard

### Messages Not Sending

1. **Check user settings:**
   ```sql
   SELECT * FROM whatsapp_settings WHERE auto_send_enabled = true;
   ```

2. **Check WhatsApp connections:**
   ```sql
   SELECT * FROM whatsapp_connections WHERE device_status = 'Connected';
   ```

3. **Check for customers with birthdays:**
   ```sql
   SELECT * FROM customers 
   WHERE dob IS NOT NULL 
   AND EXTRACT(MONTH FROM dob) = EXTRACT(MONTH FROM CURRENT_DATE)
   AND EXTRACT(DAY FROM dob) = EXTRACT(DAY FROM CURRENT_DATE);
   ```

### Time Zone Issues

- All times are stored in Malaysia timezone (`Asia/Kuala_Lumpur`)
- Cron job runs in UTC, but API converts to Malaysia time
- User's `send_time` is compared against Malaysia time

## 🛠️ Maintenance

### Update Schedule Frequency

To check more frequently (e.g., every 30 minutes):

```sql
SELECT cron.unschedule('birthday-automation-hourly');

SELECT cron.schedule(
  'birthday-automation-hourly',
  '*/30 * * * *',  -- Every 30 minutes
  $$
  SELECT net.http_post(
    url := 'YOUR_APP_URL/api/cron/birthday-automation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### Remove Cron Job

```sql
SELECT cron.unschedule('birthday-automation-hourly');
```

## 📝 Notes

- The cron job runs every hour, but only sends messages at each user's scheduled time
- Multiple users can have different scheduled times
- Messages are only sent once per day per customer (enforced by unique constraint)
- The system respects user's `auto_send_enabled` setting
- All times are in Malaysia timezone (`Asia/Kuala_Lumpur`)

