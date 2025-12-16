# Cron Job Setup Guide

This guide shows you how to set up automated birthday messages using Supabase pg_cron (FREE on all Supabase plans).

---

## 🎯 Supabase pg_cron Setup

### Why Choose This?
- ✅ **FREE** on all Supabase plans
- ✅ Precise timing (runs exactly when scheduled)
- ✅ Supports hourly execution
- ✅ No invocation limits
- ✅ Database-native (faster queries)

### Setup Steps

#### 1. Enable pg_cron Extension

Go to Supabase Dashboard → SQL Editor and run:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

#### 2. Schedule the Cron Job

Replace `YOUR_APP_URL` and `YOUR_CRON_SECRET` with your actual values:

```sql
SELECT cron.schedule(
  'birthday-automation-hourly',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT net.http_post(
    url := 'https://your-app.vercel.app/api/cron/birthday-automation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer CRON_SECRET'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

**Example:**
```sql
SELECT cron.schedule(
  'birthday-automation-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://crmpg.vercel.app/api/cron/birthday-automation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer abc123xyz789secret'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

#### 3. Verify Setup

Check if the job is scheduled:

```sql
SELECT * FROM cron.job WHERE jobname = 'birthday-automation-hourly';
```

#### 4. Monitor Execution

View execution history:

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

### Managing the Cron Job

#### Update Schedule
```sql
-- Unschedule old job
SELECT cron.unschedule('birthday-automation-hourly');

-- Schedule with new time (e.g., every 30 minutes)
SELECT cron.schedule(
  'birthday-automation-hourly',
  '*/30 * * * *', -- Every 30 minutes
  $$...$$
);
```

#### Remove Cron Job
```sql
SELECT cron.unschedule('birthday-automation-hourly');
```

#### Change Execution Time
```sql
-- Example: Run at 8 AM Malaysia time daily
SELECT cron.unschedule('birthday-automation-hourly');
SELECT cron.schedule(
  'birthday-automation-daily',
  '0 8 * * *', -- 8 AM UTC (adjust for Malaysia timezone)
  $$...$$
);
```

---

## 🔐 Security Setup

### Generate CRON_SECRET

```bash
# Generate a secure random secret
openssl rand -base64 32
```

Or use an online generator: https://randomkeygen.com/

### Set in Environment Variables

**Supabase:**
- Not needed (handled in SQL)

**Vercel:**
- Dashboard → Settings → Environment Variables
- Add `CRON_SECRET` = `your-generated-secret`

**Local Development:**
- Add to `.env.local`:
```env
CRON_SECRET=your-generated-secret
```

---

## ⚙️ Cron Schedule Examples

### Hourly (Current Setup)
```
0 * * * *  -- Every hour at minute 0
```

### Every 30 Minutes
```
*/30 * * * *  -- Every 30 minutes
```

### Daily at 8 AM (Malaysia Time)
```
0 0 * * *  -- 8 AM Malaysia time (UTC+8 = 0:00 UTC)
```

### Every 6 Hours
```
0 */6 * * *  -- Every 6 hours
```

### Weekdays Only at 9 AM
```
0 9 * * 1-5  -- Monday to Friday at 9 AM
```

---

## 🧪 Testing

### Test Manually

Call the endpoint directly:

```bash
curl -X GET https://your-app.vercel.app/api/cron/birthday-automation \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Expected Response

```json
{
  "success": true,
  "message": "Processed 2 users, sent 5 messages, 0 failed",
  "results": {
    "processed": 2,
    "sent": 5,
    "failed": 0,
    "errors": []
  }
}
```

---

## 📊 Monitoring & Debugging

### Supabase pg_cron

**View all jobs:**
```sql
SELECT * FROM cron.job;
```

**View execution history:**
```sql
SELECT 
  jobid,
  jobname,
  start_time,
  end_time,
  status,
  return_message
FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 50;
```

**Check for errors:**
```sql
SELECT * FROM cron.job_run_details 
WHERE status = 'failed'
ORDER BY start_time DESC;
```


---

## 🐛 Troubleshooting

### Job Not Running

1. **Check if scheduled:**
   ```sql
   SELECT * FROM cron.job;
   ```

2. **Check execution history:**
   ```sql
   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
   ```

3. **Verify API endpoint:**
   - Test manually with curl
   - Check API logs in Vercel

4. **Check CRON_SECRET:**
   - Ensure it matches in both places
   - Verify Authorization header format

### Job Running But Not Sending Messages

1. **Check user settings:**
   ```sql
   SELECT * FROM whatsapp_settings WHERE auto_send_enabled = true;
   ```

2. **Check WhatsApp connections:**
   ```sql
   SELECT * FROM whatsapp_connections WHERE device_status = 'Connected';
   ```

3. **Check customers with birthdays:**
   ```sql
   SELECT * FROM customers 
   WHERE dob IS NOT NULL 
   AND EXTRACT(MONTH FROM dob) = EXTRACT(MONTH FROM CURRENT_DATE)
   AND EXTRACT(DAY FROM dob) = EXTRACT(DAY FROM CURRENT_DATE);
   ```

---

## 💡 Best Practices

1. **Use Supabase pg_cron** for cost savings
2. **Set CRON_SECRET** to secure your endpoint
3. **Monitor execution** regularly
4. **Test manually** before relying on automation
5. **Log errors** for debugging
6. **Set up alerts** for failed executions (future enhancement)

---

## 📚 Additional Resources

- [Supabase pg_cron Docs](https://supabase.com/docs/guides/cron)
- [Cron Expression Generator](https://crontab.guru/)
