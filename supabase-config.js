/**
 * Shared Supabase Configuration
 *
 * Single source of truth for the Supabase client used across all
 * authentication pages and the developer portal.
 *
 * These are publishable (client-side) credentials — security is
 * enforced by Row Level Security on the database, not key secrecy.
 */

const SUPABASE_URL = 'https://umoukcmojqnsgwfywovk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xBHe_p-j_zGTOsUGNbCPTw_SAS64X5l';

// Initialise once, reuse everywhere
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
