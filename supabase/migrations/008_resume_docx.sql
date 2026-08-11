-- 008: allow .docx resumes alongside PDFs
--
-- Only the modern XML-based .docx is supported. Legacy binary .doc can't be
-- read in the browser, so it stays excluded rather than uploading and then
-- silently failing to extract.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
where id = 'resumes';
