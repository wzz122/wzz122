-- 模拟 Supabase 的角色和 extensions schema
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role authenticator login noinherit password 'authpass';
grant anon, authenticated to authenticator;
create schema extensions;
grant usage on schema public, extensions to anon, authenticated;
