# AURA Developer Portal - Supabase Setup

## Quick Setup (5 minutes)

### Step 1: Run the Database Schema

1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/umoukcmojqnsgwfywovk
2. Go to **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy the entire contents of `supabase-schema.sql` and paste it
5. Click **Run** (or press Cmd/Ctrl + Enter)

You should see "Success. No rows returned" - this means the tables were created.

### Step 2: Configure Authentication

1. In Supabase Dashboard, go to **Authentication** > **Providers**
2. Ensure **Email** is enabled (should be by default)
3. Go to **Authentication** > **URL Configuration**
4. Set your **Site URL** to your GitHub Pages URL (e.g., `https://yourusername.github.io/aura-labs`)
5. Add to **Redirect URLs**:
   - `https://yourusername.github.io/aura-labs/portal/`
   - `https://yourusername.github.io/aura-labs/portal/index.html`

### Step 3: Deploy to GitHub Pages

1. Commit the updated files:
   - `developer-signup.html`
   - `developer-login.html`
   - `portal/index.html`
2. Push to GitHub
3. Your site will automatically update

## What's Included

### Database Tables

| Table | Purpose |
|-------|---------|
| `developer_profiles` | Stores developer info (name, company, role, use case) |
| `api_keys` | Stores sandbox and production API keys |
| `usage_stats` | Tracks API calls, sessions, and transactions per month |

### Features

- **Real Authentication**: Email/password signup and login via Supabase Auth
- **Email Verification**: Users receive verification email (configurable in Supabase)
- **Auto-generated API Keys**: Sandbox key created automatically on signup
- **Row Level Security**: Users can only see their own data
- **Key Regeneration**: Users can regenerate their API keys from the portal

## Testing Locally

Since the site uses client-side Supabase, you can test locally:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .
```

Then visit `http://localhost:8000/developer-signup.html`

## Customization

### Change Email Templates

1. Go to **Authentication** > **Email Templates** in Supabase
2. Customize the confirmation, magic link, and password reset emails
3. Add your branding and logo

### Disable Email Verification (for testing)

1. Go to **Authentication** > **Providers** > **Email**
2. Toggle off "Confirm email"
3. **Warning**: Re-enable for production!

### View Developer Signups

1. Go to **Authentication** > **Users** to see all registered users
2. Go to **Table Editor** > `developer_profiles` to see profile data
3. Go to **Table Editor** > `api_keys` to see generated API keys

## Troubleshooting

### "User already registered" error
The email is already in Supabase Auth. User should sign in or use password reset.

### API key not showing in portal
The trigger may not have fired. Manually insert a key:
```sql
INSERT INTO api_keys (user_id, key_type, api_key, name)
VALUES ('USER_UUID_HERE', 'sandbox', 'aura_sandbox_' || encode(gen_random_bytes(24), 'base64'), 'Default Sandbox Key');
```

### CORS errors
Make sure your site URL is added to Supabase's URL Configuration.

## Security Notes

- The `sb_publishable_*` key is safe to use in client-side code
- Row Level Security (RLS) ensures users only access their own data
- Never expose the `sb_secret_*` key in frontend code
