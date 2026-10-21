OUR CLASS MEMORIES — SETUP GUIDE (Android-friendly)
====================================================

WHAT YOU GET
- A mobile-friendly shared photo gallery
- Upload photos from different phones
- Download buttons
- Search by uploader name
- Report button
- 5 MB upload limit in the page
- Public visitors cannot delete or edit photos

IMPORTANT PRIVACY NOTE
This gallery is public to anyone who has the site link, and public images can be saved or reshared. Ask classmates before sharing their photos. Use first names/nicknames rather than full names. Do not upload private, embarrassing, or sensitive images. A client-side 5 MB check is not a security boundary by itself; set the 5 MB limit in Supabase Storage too.

PART A — CREATE THE BACKEND
1. On your Android phone, open https://supabase.com/ and create/sign in to an account.
2. Create a new project. Save the database password somewhere private.
3. In the project dashboard, open SQL Editor, create a new query, paste all of setup.sql, and run it.
4. Open Storage and create a bucket named exactly: class-photos
5. Set the bucket to PUBLIC (needed for easy shared viewing/downloads).
6. In the bucket settings, restrict allowed MIME types to:
   image/jpeg, image/png, image/webp, image/gif
   Set the bucket file-size limit to 5 MB.
7. Open Project Settings / API (or Connect) and copy the Project URL and the publishable key (older projects may label it anon key).
   NEVER use a service_role or secret key in the HTML.

PART B — CONNECT THE WEBSITE
1. Open index.html in a text/code editor on your phone.
2. Find these lines:
   const SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE";
   const SUPABASE_PUBLISHABLE_KEY = "PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE";
3. Replace the placeholders with your own Project URL and publishable key. Keep the quotation marks.
4. Save index.html.

PART C — HOST IT SO EVERYONE CAN OPEN IT
Use a static hosting provider that lets you upload an HTML file from a phone. For example:
1. Create/sign in to a static hosting account that supports manual site/file uploads.
2. Create a new site and upload index.html as the site's main file.
3. Open the generated HTTPS URL on your phone and test it.
4. Share that URL with classmates. The URL is not a password; anyone who gets it can view and upload photos.
Hosting providers change their upload flows, so follow the current instructions on the provider you choose. You can also use GitHub Pages, but editing/uploading files from a phone may take more steps.

TEST BEFORE SHARING
- Open the site on your phone and upload one non-sensitive test image.
- Open the same site link in another browser or ask a trusted classmate to test it.
- Confirm the image appears and the download button works.
- If it does not work, check the Supabase URL/key, bucket name, SQL policies, and browser console/error message.

HOW TO REMOVE AN INAPPROPRIATE PHOTO
1. Open Supabase Dashboard -> Table Editor -> photo_reports to review reports.
2. Find the reported photo in Table Editor -> photos by its ID (the report's photo_id).
3. Note its file_path.
4. Open Storage -> class-photos, find that file, and delete it.
5. Delete its row from Table Editor -> photos.
Reports are private to the project owner; this simple starter does not send email alerts or automatically remove reported photos. Check reports regularly.

SECURITY LIMITATIONS
- “Anyone with the link” is open access, not true privacy or identity verification.
- People can upload repeatedly or use fake uploader names. This starter has no strong rate limiting or anti-spam CAPTCHA. If abuse becomes a problem, switch to sign-in-required uploads or add a server-side upload function with rate limits.
- The site lets the public submit reports but not inspect reports or delete images.
- The app validates image types and size in the browser, and the bucket enforces MIME type and file size. Do not treat client-side checks as sufficient security.
- Keep the publishable/anon key public only with the RLS policies enabled. Never publish your database password or service_role/secret key.
- Because public bucket URLs can be shared, deleting an image may not instantly remove already-saved copies or cached copies.

FILES
- index.html: the website
- setup.sql: database tables and access policies
- README.txt: this guide
