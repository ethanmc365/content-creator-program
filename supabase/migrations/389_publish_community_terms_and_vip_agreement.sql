-- 389: SWITCH ON the Community Terms v1 and the VIP Creator Collaboration Agreement v1 (12 Oct 2026, Ethan's request).
-- NOT the Official Content Creator Agreement - it stays a draft until Ethan says so.
--
-- What publish_agreement does (it refuses here: no signed-in global admin under the Management API), done by hand:
-- stamp published_at/effective_at, and tell the people who must sign. First publish of the Community Terms sends no
-- notification (the AgreementGate asks every creator on their next app open); the VIP agreement notifies active VIPs
-- of the 'vip' kind only - official creators keep agreement_for('vip') = nothing while their own document is a draft.
update public.agreements set published_at = now(), effective_at = coalesce(effective_at, now()), updated_at = now()
 where id in ('ba59ca85-d630-4fd0-bea9-c58c243d5132', 'c9705ec2-c818-4d59-9f87-1635505bab65') and published_at is null;

insert into public.notifications (recipient_id, type, title, body, link)
select p.id, 'announcement', 'Please sign: VIP Creator Collaboration Agreement',
       'Read it and sign it in the app. A copy stays in Settings, Agreements.', '/agreements'
  from public.profiles p
 where p.status in ('active', 'muted') and not coalesce(p.is_test, false)
   and exists (select 1 from public.vip_members m where m.profile_id = p.id and m.status = 'active')
   and (public.agreement_for('vip', p.id)).id = 'c9705ec2-c818-4d59-9f87-1635505bab65';
