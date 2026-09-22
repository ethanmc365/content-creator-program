-- Rehearses migrations 243/244 (reaction notifications) against prod and ROLLS
-- BACK. Passed 22 Sep 2026: room 1st -> 1 row; 2nd person folds into "X and 1
-- other"; toggle -> still 1; own message -> no row; DM -> 1 row linking
-- /messages/<id>; sandbox reactor -> no row, reaction still saved; 0 errors.
do $$
declare
  rep text := ''; m record; dm record; r1 uuid; r2 uuid; sb uuid; n int; t text; l text; errs int;
begin
  select count(*) into errs from client_errors where source='reaction_notify';
  select msg.id, msg.sender_id into m from messages msg join profiles p on p.id = msg.sender_id
   where coalesce(msg.deleted,false)=false and p.status='active' and not coalesce(p.is_test,false) and msg.body <> ''
   order by msg.created_at desc limit 1;
  select id into r1 from profiles where status='active' and not coalesce(is_test,false) and not coalesce(is_sandbox,false) and id <> m.sender_id limit 1;
  select id into r2 from profiles where status='active' and not coalesce(is_test,false) and not coalesce(is_sandbox,false) and id not in (m.sender_id, r1) limit 1;
  insert into reactions (message_id, creator_id, emoji) values (m.id, r1, '❤️');
  select count(*), max(title) into n, t from notifications where recipient_id=m.sender_id and type='reaction' and created_at > now() - interval '1 minute';
  rep := rep || format(E'room 1st -> %s | %s\n', n, t);
  insert into reactions (message_id, creator_id, emoji) values (m.id, r2, '🔥');
  select count(*), max(title) into n, t from notifications where recipient_id=m.sender_id and type='reaction' and created_at > now() - interval '1 minute';
  rep := rep || format(E'2nd person -> %s | %s\n', n, t);
  insert into reactions (message_id, creator_id, emoji) values (m.id, m.sender_id, '👍');
  select count(*) into n from notifications where recipient_id=m.sender_id and type='reaction' and created_at > now() - interval '1 minute';
  rep := rep || format(E'own message -> %s\n', n);
  select d.id, d.sender_id into dm from direct_messages d join profiles p on p.id=d.sender_id
   where p.status='active' and not coalesce(p.is_test,false) order by d.created_at desc limit 1;
  select id into r1 from profiles where status='active' and not coalesce(is_test,false) and not coalesce(is_sandbox,false) and id <> dm.sender_id limit 1;
  insert into dm_reactions (message_id, creator_id, emoji) values (dm.id, r1, '😂');
  select count(*), max(link) into n, l from notifications where recipient_id=dm.sender_id and type='reaction' and created_at > now() - interval '1 minute';
  rep := rep || format(E'DM -> %s | %s\n', n, l);
  select id into sb from profiles where is_sandbox limit 1;
  insert into reactions (message_id, creator_id, emoji) values (m.id, sb, '🎉');
  select count(*) - errs into n from client_errors where source='reaction_notify';
  rep := rep || format(E'errors reported -> %s\n', n);
  raise exception E'ROLLED BACK REHEARSAL\n%', rep;
end $$;
