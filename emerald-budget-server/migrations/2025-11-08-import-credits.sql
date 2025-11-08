-- Import credits and premium status
-- Free users total credits: 5
-- Premium users total credits: 30

alter table if exists public.users
  add column if not exists is_premium boolean not null default false,
  add column if not exists import_credits_total integer not null default 5,
  add column if not exists import_credits_used integer not null default 0;

-- Sanity: ensure used cannot exceed total (best-effort check constraint)
alter table if exists public.users
  add constraint if not exists chk_import_credits_nonnegative
  check (import_credits_used >= 0),
  add constraint if not exists chk_import_credits_bounds
  check (import_credits_used <= import_credits_total);
