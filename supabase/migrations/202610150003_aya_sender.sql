begin;
alter table public.astra_aya_gmail drop constraint if exists astra_aya_gmail_email_check;
alter table public.astra_aya_gmail add constraint astra_aya_gmail_email_check check(email='chrispottergb@gmail.com') not valid;
-- Preserve any previous credential row; application rejects it until the new account connects.
commit;
