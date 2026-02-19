-- AURA Developer Portal - Supabase Database Schema
-- Run this in your Supabase SQL Editor (Database > SQL Editor)

-- Clean up legacy auth trigger (profile creation now handled via RPC from signup JS)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- 1. Create developer_profiles table to store additional user info
CREATE TABLE IF NOT EXISTS developer_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    company TEXT,
    role TEXT,
    use_case TEXT,
    email_updates BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create api_keys table to store developer API keys
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    key_type TEXT NOT NULL CHECK (key_type IN ('sandbox', 'production')),
    api_key TEXT NOT NULL UNIQUE,
    name TEXT DEFAULT 'Default Key',
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE
);

-- 3. Create usage_stats table to track API usage
CREATE TABLE IF NOT EXISTS usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
    month DATE NOT NULL,
    api_calls INTEGER DEFAULT 0,
    sessions_created INTEGER DEFAULT 0,
    transactions INTEGER DEFAULT 0,
    UNIQUE(user_id, month)
);

-- 4. Enable Row Level Security (RLS) on all tables
ALTER TABLE developer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_stats ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policies - users can only access their own data
-- Drop existing policies first (makes this script idempotent/re-runnable)
DROP POLICY IF EXISTS "Users can view own profile" ON developer_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON developer_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON developer_profiles;
DROP POLICY IF EXISTS "Users can view own API keys" ON api_keys;
DROP POLICY IF EXISTS "Users can insert own API keys" ON api_keys;
DROP POLICY IF EXISTS "Users can update own API keys" ON api_keys;
DROP POLICY IF EXISTS "Users can view own usage" ON usage_stats;

-- Developer profiles policies
CREATE POLICY "Users can view own profile" ON developer_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON developer_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON developer_profiles
    FOR UPDATE USING (auth.uid() = id);

-- API keys policies
CREATE POLICY "Users can view own API keys" ON api_keys
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API keys" ON api_keys
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own API keys" ON api_keys
    FOR UPDATE USING (auth.uid() = user_id);

-- Usage stats policies
CREATE POLICY "Users can view own usage" ON usage_stats
    FOR SELECT USING (auth.uid() = user_id);

-- 6. Create function to auto-generate sandbox API key on signup
CREATE OR REPLACE FUNCTION generate_sandbox_key()
RETURNS TRIGGER AS $$
DECLARE
    new_key TEXT;
BEGIN
    -- Generate a random API key
    new_key := 'aura_sandbox_' || encode(gen_random_bytes(24), 'base64');
    -- Remove any special characters that might cause issues
    new_key := replace(replace(replace(new_key, '+', 'x'), '/', 'y'), '=', '');

    -- Insert the sandbox API key
    INSERT INTO api_keys (user_id, key_type, api_key, name)
    VALUES (NEW.id, 'sandbox', new_key, 'Default Sandbox Key');

    -- Initialize usage stats for current month
    INSERT INTO usage_stats (user_id, month)
    VALUES (NEW.id, date_trunc('month', NOW())::date);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create trigger to auto-generate API key when profile is created
DROP TRIGGER IF EXISTS on_profile_created ON developer_profiles;
CREATE TRIGGER on_profile_created
    AFTER INSERT ON developer_profiles
    FOR EACH ROW
    EXECUTE FUNCTION generate_sandbox_key();

-- 8. Create RPC function for signup profile creation (bypasses RLS)
-- The signup page calls this via supabaseClient.rpc('create_developer_profile', {...})
-- SECURITY DEFINER allows it to insert into developer_profiles before the user is fully authenticated
CREATE OR REPLACE FUNCTION create_developer_profile(
    user_id UUID,
    p_first_name TEXT DEFAULT NULL,
    p_last_name TEXT DEFAULT NULL,
    p_company TEXT DEFAULT NULL,
    p_role TEXT DEFAULT NULL,
    p_use_case TEXT DEFAULT NULL,
    p_email_updates BOOLEAN DEFAULT false
)
RETURNS void AS $$
BEGIN
    INSERT INTO developer_profiles (id, first_name, last_name, company, role, use_case, email_updates)
    VALUES (user_id, p_first_name, p_last_name, p_company, p_role, p_use_case, p_email_updates)
    ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Create function to regenerate API key
CREATE OR REPLACE FUNCTION regenerate_api_key(key_id UUID)
RETURNS TEXT AS $$
DECLARE
    new_key TEXT;
    key_owner UUID;
BEGIN
    -- Check ownership
    SELECT user_id INTO key_owner FROM api_keys WHERE id = key_id;
    IF key_owner != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Generate new key
    new_key := 'aura_sandbox_' || encode(gen_random_bytes(24), 'base64');
    new_key := replace(replace(replace(new_key, '+', 'x'), '/', 'y'), '=', '');

    -- Update the key
    UPDATE api_keys
    SET api_key = new_key,
        created_at = NOW()
    WHERE id = key_id;

    RETURN new_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Done! Your schema is ready.
-- Signup flow: JS calls create_developer_profile RPC -> on_profile_created trigger -> generate_sandbox_key
