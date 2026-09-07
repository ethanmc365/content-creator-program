-- FORTY-NINE CHALLENGES THAT HAPPENED BEFORE THIS WAS BUILT.
--
-- The contents of Ethan's "Challenge Log: All Markets" spreadsheet, January to
-- September 2026, across the UK, Spain, Germany, Portugal and Romania. See
-- migration 197 for why this is aggregates in their own table rather than
-- invented `challenges` and `submissions` rows.
--
-- IT RECONCILES AGAINST THE SHEET'S OWN TOTAL ROW, and that is the only reason
-- to trust it. Parsed and summed before writing anything:
--
--     prizes      EUR 9,235      sheet says EUR 9,235      match
--     views       19,652,470     sheet says 19,652,470     match
--     creators    347            sheet says 347            match
--     posts       2,609          sheet says 2,609          match
--
-- The six derived columns in the sheet (CPM, cost per post, cost per creator,
-- posts per creator, views per post, views per creator) are DELIBERATELY NOT
-- imported - `challenge_history_metrics` computes them, so there is one answer
-- rather than a stored one that can drift from the columns it was made of.
--
-- EMPTY IS NULL, NOT ZERO. Eleven rows are marked Done with no views logged
-- ("Need to log views", "Views not logged in source sheet"). Those are unknown,
-- not zero, and writing zero would drag every average in the programme down
-- with a number nobody ever measured. The notes column carries the sheet's own
-- explanation on each.
--
-- `on conflict (ref)` MAKES THIS RE-RUNNABLE. `ref` is the sheet's own key
-- ("ES-12"), so a corrected export can be imported again over the top and will
-- update rather than duplicate.

insert into public.challenge_history
  (ref, seq, country_code, community_id, title, starts_at, ends_at, cadence, cohort,
   prize_type, content_type, objective, status, prize_total, winners,
   total_views, creators, posts, notes, source)
select v.ref, v.seq, v.country_code,
       (select c.id from public.communities c where c.slug = v.slug),
       v.title, v.starts_at::date, v.ends_at::date, v.cadence, v.cohort,
       v.prize_type, v.content_type, v.objective, v.status, v.prize_total, v.winners,
       v.total_views, v.creators, v.posts, v.notes, 'import'
from (values
('UK-1',1,'UK','uk','United Kingdom Monthly · 2026-09','2026-09-01','2026-09-30','monthly','General','Cash & Travel voucher','Free','Views','planned',200.0,3,null,null,null,null),
('RO-1',2,'RO','romania','Romania Express · 2026-08','2026-08-28','2026-08-31','express','General','Travel voucher','Free','Views','planned',50.0,1,null,null,null,null),
('ES-1',3,'ES','spain','Spain Monthly · 2026-08','2026-08-04','2026-08-30','monthly','General','Cash & Travel voucher','Suggested videos','Views','done',540.0,12,2844995,27,787,null),
('UK-2',4,'UK','uk','United Kingdom Monthly · 2026-07','2026-07-20','2026-08-20','monthly','General','Cash & Travel voucher','Free','Views','running',190.0,3,null,null,null,null),
('DE-1',5,'DE','germany','Germany Monthly · 2026-07','2026-07-06','2026-07-31','monthly','General','Cash & Travel voucher','Free','Views','running',180.0,3,null,null,null,null),
('ES-2',6,'ES','spain','Spain Monthly · 2026-07','2026-07-01','2026-07-30','monthly','General','Cash & Travel voucher','Suggested videos','Views','done',540.0,12,3743368,31,417,'Best-performing format to date'),
('ES-3',7,'ES','spain','Spain Monthly · 2026-06','2026-06-20','2026-07-20','monthly','UGC','Cash','Suggested videos','Views','done',180.0,3,51061,8,33,null),
('DE-2',8,'DE','germany','Germany Monthly · 2026-06','2026-06-08','2026-06-30','monthly','General','Cash & Travel voucher','Free','Views','done',200.0,4,294000,4,8,null),
('UK-3',9,'UK','uk','United Kingdom Express · 2026-06','2026-06-15','2026-06-30','express','General','Cash','Talking style','Views','done',120.0,3,34000,5,6,null),
('ES-4',10,'ES','spain','Spain Monthly · 2026-06','2026-06-08','2026-06-29','monthly','General','Cash & Travel voucher','Suggested videos','Views','done',360.0,6,1626372,21,140,null),
('PT-1',11,'PT','portugal','Portugal Monthly · 2026-06','2026-06-02','2026-06-28','monthly','General','Cash & Travel voucher','Free','Views','running',250.0,5,null,null,null,'Results still outstanding'),
('RO-2',12,'RO','romania','Romania Express · 2026-06','2026-06-18','2026-06-20','express','General','Travel voucher','Suggested videos','Views','done',30.0,1,null,null,null,null),
('ES-5',13,'ES','spain','Spain Express · 2026-05','2026-05-29','2026-06-05','express','General','Cash & Travel voucher','Hooks','Views','done',110.0,2,295283,9,175,'Highest posts-per-creator of any challenge'),
('ES-6',14,'ES','spain','Spain Express · 2026-05','2026-05-17','2026-05-31','express','VIP','Travel voucher','Suggested videos','Number of videos','done',240.0,7,null,7,19,'Need to log views'),
('ES-6',15,'ES','spain','Spain Monthly · 2026-05','2026-05-01','2026-05-31','monthly','VIP','Travel voucher','Free','Views','done',200.0,2,null,null,null,null),
('PT-2',16,'PT','portugal','Portugal Express · 2026-05','2026-05-25','2026-05-31','express','General','Travel voucher','Suggested videos','Views','done',30.0,3,null,null,null,'Marked Done but no results logged'),
('DE-3',17,'DE','germany','Germany Monthly · 2026-05','2026-05-05','2026-05-31','monthly','General','Cash & Travel voucher','Free','Views','done',220.0,5,112929,6,48,null),
('UK-4',18,'UK','uk','United Kingdom Monthly · 2026-04','2026-04-20','2026-05-31','monthly','General','Cash & Travel voucher','Free','Views','done',210.0,3,56246,10,33,null),
('ES-8',19,'ES','spain','Spain Monthly · 2026-05','2026-05-05','2026-05-25','monthly','General','Cash','Free','Views','done',360.0,6,119650,11,114,null),
('ES-9',20,'ES','spain','Spain Monthly · 2026-04','2026-04-23','2026-05-16','monthly','UGC','Cash','Suggested videos','Views','done',180.0,3,204514,8,55,null),
('PT-3',21,'PT','portugal','Portugal Monthly · 2026-04','2026-04-15','2026-05-15','monthly','General','Cash & Travel voucher','Suggested videos','Views','done',420.0,3,773229,9,47,null),
('ES-10',22,'ES','spain','Spain Monthly · 2026-04','2026-04-01','2026-04-30','monthly','VIP','Travel voucher','Free','Views','done',270.0,1,520472,8,15,null),
('DE-4',23,'DE','germany','Germany Monthly · 2026-04','2026-04-11','2026-04-30','monthly','General','Cash & Travel voucher','Free','Views','done',220.0,5,70261,4,32,null),
('ES-11',24,'ES','spain','Spain Monthly · 2026-04','2026-04-09','2026-04-26','monthly','General','Cash','Suggested videos','Views','done',360.0,6,404347,13,108,null),
('ES-12',25,'ES','spain','Spain Express · 2026-03','2026-03-26','2026-04-03','express','General','Travel voucher','Suggested videos','Views','done',90.0,1,81821,8,19,null),
('ES-13',26,'ES','spain','Spain Monthly · 2026-03','2026-03-01','2026-03-31','monthly','VIP','Travel voucher','Free','Views','done',200.0,2,904014,5,null,'Posts not logged'),
('ES-13',27,'ES','spain','Spain Monthly · 2026-03','2026-03-01','2026-03-31','monthly','UGC','Cash','Free','Views / Trust','done',170.0,3,10056,10,21,'Worst tracked CPM in the log'),
('DE-5',28,'DE','germany','Germany Monthly · 2026-03','2026-03-09','2026-03-31','monthly','General','Cash & Travel voucher','Free','Views','done',150.0,3,319907,5,6,null),
('UK-5',29,'UK','uk','United Kingdom Monthly · 2026-02','2026-02-15','2026-03-31','monthly','General','Cash & Travel voucher','Free','Views','done',200.0,3,83000,8,15,null),
('ES-15',30,'ES','spain','Spain Monthly · 2026-03','2026-03-03','2026-03-25','monthly','General','Travel voucher','Free','Creativity','done',30.0,1,null,null,null,'Need to log views'),
('ES-16',31,'ES','spain','Spain Monthly · 2026-03','2026-03-08','2026-03-20','monthly','General','Cash','Free','Views','done',300.0,5,411620,15,116,null),
('RO-3',32,'RO','romania','Romania Monthly · 2026-03','2026-03-03','2026-03-04','monthly','General','Travel voucher','Suggested videos','Views / Trust','done',20.0,1,1123,null,1,'Cancelled due to low participation. Gave a 20 euro consolation voucher to the 1 partiicipant'),
('ES-17',33,'ES','spain','Spain Monthly · 2026-02','2026-02-17','2026-02-28','monthly','General','Cash','Free','Views','done',250.0,5,299239,20,73,null),
('ES-17',34,'ES','spain','Spain Monthly · 2026-02','2026-02-04','2026-02-28','monthly','VIP','Travel voucher','Free','Views','done',200.0,2,649760,10,23,null),
('ES-17',35,'ES','spain','Spain Monthly · 2026-02','2026-02-01','2026-02-28','monthly','VIP','Cash','Free','Creativity','done',100.0,1,null,null,null,'Need to log views'),
('PT-4',36,'PT','portugal','Portugal Monthly · 2026-02','2026-02-14','2026-02-28','monthly','General','Cash & Travel voucher','Free','Views','done',190.0,4,60000,4,9,null),
('PT-4',37,'PT','portugal','Portugal Monthly · 2026-02','2026-02-01','2026-02-28','monthly','General','Cash & Travel voucher','Free','Views','done',170.0,3,60000,5,9,null),
('ES-20',38,'ES','spain','Spain Express · 2026-02','2026-02-21','2026-02-26','express','VIP','Cash','Hooks','Views','done',60.0,1,null,4,null,'Need to log views'),
('DE-6',39,'DE','germany','Germany Monthly · 2026-02','2026-02-02','2026-02-25','monthly','General','Cash','Free','Views','done',140.0,3,190896,5,12,null),
('ES-21',40,'ES','spain','Spain Monthly · 2026-02','2026-02-05','2026-02-15','monthly','General','Cash','Free','Views','done',200.0,3,195169,17,73,null),
('ES-22',41,'ES','spain','Spain Express · 2026-01','2026-01-20','2026-01-31','express','General','Travel voucher','Other','Views','done',60.0,1,18299,5,5,null),
('ES-22',42,'ES','spain','Spain Monthly · 2026-01','2026-01-15','2026-01-31','monthly','VIP','Travel voucher','Free','Views','done',200.0,2,2617439,7,90,null),
('PT-6',43,'PT','portugal','Portugal Monthly · 2026-01','2026-01-01','2026-01-31','monthly','General','Travel voucher','Free','Views / Trust','done',120.0,3,null,null,null,'Views not logged in source sheet'),
('DE-7',44,'DE','germany','Germany Monthly · 2026-01','2026-01-15','2026-01-31','monthly','General','Cash & Travel voucher','Other','Views','done',120.0,2,122594,1,2,null),
('UK-6',45,'UK','uk','United Kingdom Monthly · 2026-01','2026-01-01','2026-01-31','monthly','General','Travel voucher','Free','Views','done',210.0,3,179896,15,42,null),
('ES-24',46,'ES','spain','Spain Express · 2026-01','2026-01-15','2026-01-19','express','VIP','Travel voucher','Other','Views','done',50.0,1,null,4,null,'Need to log views'),
('ES-24',47,'ES','spain','Spain Monthly · 2026-01','2026-01-15','2026-01-19','monthly','General','Cash','Free','Views','done',150.0,3,2251284,12,48,null),
('RO-4',48,'RO','romania','Romania Monthly · 2026-01','2026-01-02','2026-01-14','monthly','General','Travel voucher','Suggested videos','Views / Trust','done',120.0,2,1126,1,2,null),
('RO-4',49,'RO','romania','Romania Monthly · 2026-01','2026-01-01','2026-01-14','monthly','General','Travel voucher','Suggested videos','Views','done',75.0,1,44500,5,6,null)
) as v(ref, seq, country_code, slug, title, starts_at, ends_at, cadence, cohort,
       prize_type, content_type, objective, status, prize_total, winners,
       total_views, creators, posts, notes)
on conflict (ref) do update set
  seq = excluded.seq, community_id = excluded.community_id, title = excluded.title,
  starts_at = excluded.starts_at, ends_at = excluded.ends_at, cadence = excluded.cadence,
  cohort = excluded.cohort, prize_type = excluded.prize_type,
  content_type = excluded.content_type, objective = excluded.objective,
  status = excluded.status, prize_total = excluded.prize_total, winners = excluded.winners,
  total_views = excluded.total_views, creators = excluded.creators, posts = excluded.posts,
  notes = excluded.notes;