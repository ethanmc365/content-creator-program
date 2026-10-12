-- 393: certificate wording corrected by hand in four languages (12 Oct 2026)
--
-- The design text on certificates is machine-translated line by line into content_translations. Several read wrongly:
-- German "for finishing 1st" came out as "zur Veredelung von" (finishing as in refining a surface), Romanian
-- "Certificate of Achievement" as "Certificat de absolvire" (a graduation certificate), Portuguese as "Conclusão"
-- (completion). These are reviewed values (auto = false), so the translation layer keeps them.

update public.content_translations set value = 'Certificado de Reconocimiento', auto = false, same = false, updated_at = now() where locale = 'es' and source = 'Certificate of Achievement';
update public.content_translations set value = 'Certificado de Mérito', auto = false, same = false, updated_at = now() where locale = 'pt' and source = 'Certificate of Achievement';
update public.content_translations set value = 'Leistungsurkunde', auto = false, same = false, updated_at = now() where locale = 'de' and source = 'Certificate of Achievement';
update public.content_translations set value = 'Certificat de merit', auto = false, same = false, updated_at = now() where locale = 'ro' and source = 'Certificate of Achievement';
update public.content_translations set value = 'Creator des Monats', auto = false, same = false, updated_at = now() where locale = 'de' and source = 'Creator of the Month';
update public.content_translations set value = 'por quedar {place} en {challenge}', auto = false, same = false, updated_at = now() where locale = 'es' and source = 'for finishing {place} in {challenge}';
update public.content_translations set value = 'por ficar em {place} lugar em {challenge}', auto = false, same = false, updated_at = now() where locale = 'pt' and source = 'for finishing {place} in {challenge}';
update public.content_translations set value = 'für den {place} Platz in {challenge}', auto = false, same = false, updated_at = now() where locale = 'de' and source = 'for finishing {place} in {challenge}';
update public.content_translations set value = 'pentru locul {place} în {challenge}', auto = false, same = false, updated_at = now() where locale = 'ro' and source = 'for finishing {place} in {challenge}';
update public.content_translations set value = 'y por crear contenido de viajes con nosotros', auto = false, same = false, updated_at = now() where locale = 'es' and source = 'and creating travel content with us';
update public.content_translations set value = 'e por criar conteúdo de viagens connosco', auto = false, same = false, updated_at = now() where locale = 'pt' and source = 'and creating travel content with us';
update public.content_translations set value = 'und für die Reiseinhalte, die du mit uns erstellst', auto = false, same = false, updated_at = now() where locale = 'de' and source = 'and creating travel content with us';
update public.content_translations set value = 'și pentru conținutul de călătorie creat împreună cu noi', auto = false, same = false, updated_at = now() where locale = 'ro' and source = 'and creating travel content with us';
update public.content_translations set value = 'für den Beitritt zur Tryp.com Content Creator Community', auto = false, same = false, updated_at = now() where locale = 'de' and source = 'for joining the Tryp.com Content Creator Community';
update public.content_translations set value = 'pentru alăturarea la comunitatea de creatori de conținut Tryp.com', auto = false, same = false, updated_at = now() where locale = 'ro' and source = 'for joining the Tryp.com Content Creator Community';
update public.content_translations set value = 'por el trabajo más destacado del mes en {market}', auto = false, same = false, updated_at = now() where locale = 'es' and source = 'for the month’s stand-out work in {market}';
update public.content_translations set value = 'pelo trabalho de destaque do mês em {market}', auto = false, same = false, updated_at = now() where locale = 'pt' and source = 'for the month’s stand-out work in {market}';
update public.content_translations set value = 'für die herausragendste Arbeit des Monats in {market}', auto = false, same = false, updated_at = now() where locale = 'de' and source = 'for the month’s stand-out work in {market}';
update public.content_translations set value = 'Creator-Community', auto = false, same = false, updated_at = now() where locale = 'de' and source = 'Creator Community';
update public.content_translations set value = 'Comunitatea creatorilor', auto = false, same = false, updated_at = now() where locale = 'ro' and source = 'Creator Community';
update public.content_translations set value = 'Criador de conteúdo oficial do Tryp.com', auto = false, same = false, updated_at = now() where locale = 'pt' and source = 'Official Tryp.com Content Creator';
update public.content_translations set value = 'Offizieller Tryp.com Content Creator', auto = false, same = false, updated_at = now() where locale = 'de' and source = 'Official Tryp.com Content Creator';
update public.content_translations set value = 'Creator de conținut oficial Tryp.com', auto = false, same = false, updated_at = now() where locale = 'ro' and source = 'Official Tryp.com Content Creator';
update public.content_translations set value = 'Comunitatea creatorilor Tryp.com', auto = false, same = false, updated_at = now() where locale = 'ro' and source = 'Tryp.com Creator Community';
