# HealthOS Production Starter

## What this is
A static frontend starter for HealthOS using Supabase for authentication, database storage and private report-file storage.

## Important
Do NOT collect real medical records until:
1. Supabase is configured correctly.
2. The SQL schema has been run.
3. Row Level Security policies have been checked.
4. Google OAuth and phone OTP have been tested.
5. You have added a privacy policy, account deletion/export and a security review appropriate to your launch.
6. You understand the privacy/legal requirements that apply where you operate.

## Files
- index.html — app screens
- css/style.css — design
- js/config.js — Supabase project URL/key
- js/app.js — app functionality
- supabase-schema.sql — database + RLS + private storage policies

## Supabase setup
1. Create a Supabase project.
2. Open SQL Editor and run supabase-schema.sql.
3. Open Project Settings -> API and copy the project URL and browser-safe publishable/anon key into js/config.js.
4. Enable Google provider and configure its OAuth redirect.
5. Enable Phone provider and configure an SMS provider.
6. Add your final deployed URL to Supabase Auth URL settings.
7. Test with a test account before sharing.

## Deployment
This app is static and can be hosted on GitHub Pages. GitHub Pages publishes static files from a repository. Keep secrets out of the repository; the browser-safe Supabase key is intended for client use when RLS is configured, but never publish a service_role key.
