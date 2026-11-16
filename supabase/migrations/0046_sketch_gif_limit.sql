-- Animated GIFs may now be up to 20 MB (other sketch files stay at 5 MB, and a
-- sketch's files at 60 MB in total) - see MAX_GIF_BYTES in
-- supabase/functions/_shared/sketchFiles.ts, which is the real check. The
-- bucket's own cap is only a second line of defence, so it must be at least the
-- largest per-file limit or GIF uploads would fail here after passing there.
update storage.buckets set file_size_limit = 20971520 where id = 'sketch-assets';
