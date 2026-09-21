## What I found

I checked the live database before writing this. The core of what you asked for is already in place:

- RLS is enabled on both tables (`spreadsheets`, `spreadsheet_mutations`) — these are the only tables in the app.
- Every policy is explicit, per-operation, `TO authenticated`, and scoped to `owner_id = auth.uid()` (mutations go through an `EXISTS` join to the owning sheet). Inserts also force `author_id = auth.uid()`.
- `spreadsheet_mutations` has no UPDATE policy at all — history is append-only by construction.
- The one `SECURITY DEFINER` function, `list_my_sheets()`, pins `search_path`, filters on `auth.uid()`, and has already had `EXECUTE` revoked from `anon`.
- The app never trusts a client-supplied owner: `owner_id` is always the session user's id, and RLS re-checks it server-side regardless.

Per your answers, I'm not adding the `user_roles` / `has_role` scaffolding (no admin surface exists, and an empty roles table is a future footgun), not touching the `anon` grants (RLS already returns zero rows for anon), and not changing auth settings.

## What this plan actually changes

One real item remains:

**Remove the `whoami()` debug function.** It is a leftover diagnostic that returns `auth.uid()`, `auth.role()`, and the caller's full decoded JWT, and it is executable by `anon` and `authenticated`. It only ever reflects the caller's own token back at them, so it is not a data leak — but it is unused by the app, it echoes token claims, and it has no reason to be in the exposed API schema.

- Migration: `DROP FUNCTION public.whoami();`
- No app code references it, so nothing else changes. The generated types file regenerates after the migration.

## Verification

After the migration I'll re-run the database linter and the security scan, then confirm in a live signed-in browser session that the sheets list, sheet open, edit, and delete flows all still work.

I'll report the result as pass/fail per item, with an explicit line between what I verified live in-browser and what I verified by querying the database catalog.

## Note on the standing false positive

`list_my_sheets()` will keep showing up under "signed-in users can execute a SECURITY DEFINER function". That is the already-accepted false positive — it needs definer rights purely to join `auth.users` for your own email, and revoking `EXECUTE` from `authenticated` would break the sheets list. No change there.
