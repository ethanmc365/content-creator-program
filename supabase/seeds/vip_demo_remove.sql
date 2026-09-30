-- Removes the VIP Demo programme (see vip_demo.sql). Then run: node scripts/seed-vip-demo.mjs --remove
delete from public.vip_programmes where name = 'VIP Demo';
delete from public.communities where slug = 'vip-demo';
