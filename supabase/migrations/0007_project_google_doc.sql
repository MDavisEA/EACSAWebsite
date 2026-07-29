-- Lets a teacher point at a Google Doc for directions that are easier to
-- write there than in the in-app rich text box - shown embedded on the
-- student page and (via a server-side fetch, since Google's export endpoint
-- doesn't send CORS headers a browser fetch could use directly) pulled into
-- the review export too.
alter table projects add column google_doc_url text;
