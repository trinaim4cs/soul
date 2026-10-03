-- Phase 18 (security audit): user text that other people read may not carry invisible
-- control characters or bidirectional overrides (DECISIONS D-057).
--
-- A right-to-left override (U+202E) in a name or message reorders what the reader sees
-- ("Test User 01" shown with a reversed tail, a message whose words appear in another
-- order), and C0/C1 control characters can break layouts or hide text. The app strips
-- these before saving (src/lib/text.ts); the database refuses them so a modified client
-- cannot store them either.
--
-- Rejected everywhere: C0 controls, DEL, C1 controls, bidi embeddings and overrides
-- (U+202A..U+202E) and bidi isolates (U+2066..U+2069). Multi-line text (About me,
-- messages, report details, appeals) keeps tab, line feed and carriage return; one-line
-- text (name, hook) also refuses those and the Unicode line and paragraph separators.
-- Left-to-right and right-to-left marks (U+200E, U+200F) and the zero-width joiner stay
-- allowed: they cannot reorder neighbouring text and are needed by real scripts and emoji.
--
-- The patterns use hexadecimal escapes (\xhhhh), never the characters themselves, so this
-- file holds no invisible text of its own.

alter table public.profiles
  add constraint display_name_plain check (
    display_name is null
    or display_name !~ '[\x01-\x1f\x7f-\x9f\x202a-\x202e\x2066-\x2069\x2028\x2029]'
  ),
  add constraint hook_plain check (
    hook is null
    or hook !~ '[\x01-\x1f\x7f-\x9f\x202a-\x202e\x2066-\x2069\x2028\x2029]'
  ),
  add constraint about_plain check (
    about is null
    or about !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\x202a-\x202e\x2066-\x2069]'
  );

alter table public.messages
  add constraint message_body_plain check (
    body !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\x202a-\x202e\x2066-\x2069]'
  );

alter table public.reports
  add constraint report_details_plain check (
    details is null
    or details !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\x202a-\x202e\x2066-\x2069]'
  );

alter table public.appeals
  add constraint appeal_message_plain check (
    message !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\x202a-\x202e\x2066-\x2069]'
  );
