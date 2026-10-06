-- Make the WhatsApp files bucket private (6 Oct 2026).
--
-- RUN THIS ONLY AFTER the matching version of the CRM is deployed. From then
-- on the CRM opens attachments through the signed-in file route (which creates
-- a short-lived link), so anyone holding an old public link can no longer open
-- the file. Run before the deploy and images in the chat will stop loading.
--
-- To undo: set public = true again. Safe to run more than once.

update storage.buckets set public = false where id = 'whatsapp-media';
