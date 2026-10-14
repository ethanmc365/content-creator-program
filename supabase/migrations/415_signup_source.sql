-- 415: WHERE A SIGN-UP CAME FROM (14 Oct 2026), for the Recruitment analytics tab.
-- First touch, recorded by the browser before sign-up (utm_source / ?ref= / the referring site / direct) and written onto
-- the profile once, by the applicant, during onboarding. Nothing personal: a source name, medium, campaign, the landing
-- path and when. Sign-ups before 14 Oct read as "Before tracking" unless they came through a referral or an invite link.
alter table profiles add column if not exists signup_source jsonb;
comment on column profiles.signup_source is 'First-touch source of the sign-up: {source, medium, campaign, landing, at}. Written once by the applicant.';
