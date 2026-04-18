-- Person 2 may exist without a sign-in email until added in Account settings.
ALTER TABLE public.profiles
  ALTER COLUMN email DROP NOT NULL;
