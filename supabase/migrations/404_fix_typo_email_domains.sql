-- 404: two members signed up with a mistyped Gmail domain (gnail.com, gmsil.com),
-- so their password and prize emails went to whoever owns those domains.
-- Correct the login address (auth.users + the email identity) and the copy kept
-- on their application. No email is sent; they sign in with the corrected address
-- and their existing password. auth.identities.email is generated from identity_data.

update auth.users
   set email = regexp_replace(email, '@(gnail|gmsil)\.com$', '@gmail.com', 'i'),
       updated_at = now()
 where email ~* '@(gnail|gmsil)\.com$'
   and id in ('faaa6621-e56a-427c-9312-66364e3f9173', '09fb60a4-c7b0-45c5-8816-a3ebba647a82');

update auth.identities
   set identity_data = jsonb_set(identity_data, '{email}',
         to_jsonb(regexp_replace(identity_data->>'email', '@(gnail|gmsil)\.com$', '@gmail.com', 'i'))),
       updated_at = now()
 where provider = 'email'
   and user_id in ('faaa6621-e56a-427c-9312-66364e3f9173', '09fb60a4-c7b0-45c5-8816-a3ebba647a82')
   and identity_data->>'email' ~* '@(gnail|gmsil)\.com$';

update public.application_decisions
   set email = regexp_replace(email, '@(gnail|gmsil)\.com$', '@gmail.com', 'i')
 where email ~* '@(gnail|gmsil)\.com$';
