-- Local development seed (runs on `supabase db reset`).
-- Pins third-party auth to your Firebase project. In production run the same
-- statement once in the SQL editor with your real Firebase project id.
insert into private.app_settings (key, value)
values ('firebase_project_id', 'your-firebase-project-id')
on conflict (key) do update set value = excluded.value;
