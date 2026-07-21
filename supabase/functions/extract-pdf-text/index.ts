import * as mupdf from 'npm:mupdf@1.3.0';
import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient, getTeacherFromRequest } from '../_shared/teacherAuth.ts';

const BUCKET = 'uploads';

// Despite the name (kept from the old Base44 function for continuity), this
// returns PAGE IMAGES, not extracted text - the teacher UI uses these as
// question/answer-key screenshots, not as machine-readable text.
Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = createAdminClient();
    const teacher = await getTeacherFromRequest(req, admin);
    if (!teacher) return json({ error: 'Unauthorized' }, 401);

    const { pdf_url, pages } = await req.json();

    const pdfResp = await fetch(pdf_url);
    if (!pdfResp.ok) throw new Error(`Failed to fetch PDF: ${pdfResp.status}`);
    const pdfBytes = new Uint8Array(await pdfResp.arrayBuffer());

    const doc = mupdf.Document.openDocument(pdfBytes, 'application/pdf');
    const totalPages = doc.countPages();

    if (!pages || pages.length === 0) {
      doc.destroy();
      return json({ total_pages: totalPages, file_urls: [] });
    }

    const file_urls: string[] = [];

    for (const pageNum of pages) {
      if (pageNum < 1 || pageNum > totalPages) continue;

      const page = doc.loadPage(pageNum - 1);
      const matrix = mupdf.Matrix.scale(2.0, 2.0);
      const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
      const pngBytes = pixmap.asPNG();

      const path = `${teacher.id}/pdf-page-${crypto.randomUUID()}.png`;
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, pngBytes, {
        contentType: 'image/png',
        upsert: false,
      });
      if (!uploadError) {
        const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
        file_urls.push(data.publicUrl);
      }

      pixmap.destroy();
      page.destroy();
    }

    doc.destroy();
    return json({ file_urls, total_pages: totalPages });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
