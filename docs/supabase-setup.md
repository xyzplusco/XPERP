# Supabase Setup

Project URL:

```text
https://yzppeowuprxtmzehjtpj.supabase.co
```

## Required Values

The URL alone is not enough to apply migrations or import seed data.

Set these values locally or in the deployment environment:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://yzppeowuprxtmzehjtpj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_DB_URL=postgresql://...
```

## Commands

```bash
npm run db:migrate
npm run seed:operational
npm run db:seed
npm run build
```

## Current State

- App pages read from Supabase views.
- No hardcoded mock dataset remains in the UI layer.
- If Supabase env vars are missing, the app shows empty tables / connection-needed counts rather than fake data.
- Migration SQL is in `supabase/migrations/20260817000000_initial_schema.sql`.
- Seed importer reads `data/processed/operational_seed_preview.json`.

