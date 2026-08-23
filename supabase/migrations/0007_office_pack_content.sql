-- =============================================================================
-- Migration: real content for the Office & Coworkers pack
-- =============================================================================
-- Run this on a database that already has 0006_flirty_pack_consent.sql
-- applied. `supabase/seed.sql` has already been regenerated to the
-- post-migration shape, so a *fresh* project should just run schema.sql +
-- seed.sql directly and skip this file entirely; this is only for bringing
-- an existing database forward.
--
-- No schema/column changes here — just swapping the 5 placeholder patterns
-- in the existing "Office & Coworkers Pack" for 20 real ones. Starter,
-- Movies & Celebrities, and Flirty & Cheeky are untouched.
-- =============================================================================

delete from public.patterns
where pack_id = (select id from public.packs where name = 'Office & Coworkers Pack');

insert into public.patterns (text_i18n, pack_id, is_free) values
  ('{"en":"Rub your temple slightly before answering, like you have a headache from meetings."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Glance sideways at an imaginary colleague before responding, like seeking approval."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Tap two fingers on the table in a slow, steady rhythm the whole time."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Straighten your posture noticeably every time you''re asked something."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Give a small, tight smile before every answer, like you''re being diplomatic."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Slowly roll your shoulders back before responding, like stress relief."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Lean slightly toward whoever asked, like you''re being extra attentive."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Clasp your hands together on the table before each answer."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Pause and look upward briefly before answering, like recalling a calendar."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Rub your hands together lightly before speaking, like warming up to pitch something."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Cross and uncross your arms between each answer."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Nod slightly more than necessary while listening to the question."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Adjust your sleeve or cuff briefly before responding."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Sit slightly forward on the edge of your seat the whole time."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Give a small exhale through your nose before each answer, like suppressing a sigh."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Touch your collarbone lightly before speaking."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Keep one hand resting flat on the table the entire time, unmoving."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Slightly tilt your head to the side whenever you''re thinking."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Press your lips together briefly before answering, like holding something back."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false),
  ('{"en":"Straighten an invisible stack of papers in front of you before each response."}'::jsonb, (select id from public.packs where name = 'Office & Coworkers Pack'), false);
