# Punarvasan Tracker backend foundation

This folder contains the Phase 1 backend foundation for the real full-stack deployment.

## Required external configuration

1. Create a Supabase project.
2. Enable Phone sign-in under Supabase Auth providers and configure an SMS provider and message template.
3. Create a private storage bucket named `progress-documents`.
4. Run the SQL in `database/supabase/schema.sql` in the Supabase SQL editor.
5. Configure the app with environment variables from `.env.example`.
6. Add each real user's mobile number and role to the `role_accounts` table. OTPs are sent only to numbers registered for the selected role.

## Environment configuration

Copy the example file and set your real project values:

```powershell
Copy-Item .env.example .env
```

Required values:

- `SUPABASE_URL` - your Supabase project URL
- `SUPABASE_ANON_KEY` - public anon key
- `SUPABASE_SERVICE_ROLE_KEY` - private admin key only in backend environment
- `DATABASE_URL` - PostgreSQL connection string for Supabase or your direct Postgres instance
- `PORT` - backend port

## Phone OTP sign-in

The backend uses Supabase Phone Auth to send and verify SMS codes. Users can enter an Indian 10-digit mobile number or its `+91` form. The backend does not return the OTP to the app. Supabase must have Phone sign-in and a working SMS provider configured before the login flow can send messages. Only numbers registered for the selected app role can start sign-in; Supabase creates the corresponding Auth user after that number verifies successfully.

## Important security notes

- Never place `SUPABASE_SERVICE_ROLE_KEY` in the mobile app or browser frontend.
- Keep uploaded proof files in private storage and only expose signed URLs.
- Use server-side auth checks and database policies.
- Do not allow contractors to review their own submissions.

## Next phases

- Phase 2: add the admin React web portal
- Phase 3: contractor submission and document upload flow
- Phase 4: resident read-only progress and complaint views
