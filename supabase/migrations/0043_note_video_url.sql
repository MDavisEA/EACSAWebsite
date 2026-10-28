-- An optional Loom video to go with a note. Stored as the canonical share
-- link (https://www.loom.com/share/<id>) - the notes function rebuilds it
-- from just the video id, so whatever the teacher pasted (an embed link, a
-- share link with ?sid=... on the end) can never put anything but a Loom
-- player in the iframe students see.
alter table notes add column video_url text;
