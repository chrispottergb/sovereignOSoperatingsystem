# Prompt attachments

Main chat, Muse and Music Studio accept files using the shared attachment tray (picker or drag/drop). Up to four files, 25 MB each, 60 MB combined. Supported: PNG, JPG/JPEG, WebP, MP3, WAV, MP4, MOV, WebM, PDF, DOCX, TXT, MD, CSV and JSON. Word/text files are limited to 2 MB and 20,000 extracted characters per file; text-only combined context is limited to 15,000 characters. Larger text is rejected rather than silently truncated. DOCX imports text only using the existing local parser.

## Storage and access

Authenticated, same-origin `/api/attachments` creates a scoped Supabase signed upload. The browser uploads directly to the existing private `astra-assets` bucket. No service credentials enter the browser. A server-written manifest determines the object path, filename, MIME type and size. Inspection verifies byte signatures and stored size. Original filenames are metadata, not object paths. Source objects cannot be overwritten through the issued upload URL.

Downloads require workspace authentication and issue a 15-minute signed URL. Meta receives short-lived read URLs for image/video/PDF inputs; audio is sent inline from bounded server reads. Signed URLs and raw media are excluded from prompt history. The connection policy permits only the configured Supabase origin in addition to the application origin. Removing a file from a draft detaches it; it does not delete retained private files.

## Model routing and provenance

Text-only attachments use extracted text without a model call. Media uses Meta Responses once per prompt, with Muse Spark 1.3 for image/PDF and 1.2 when audio/video is present. The reader produces a labelled source interpretation, not a claim that every council model independently inspected raw media. Other models receive that interpretation in shared evidence throughout research, review, revision and final synthesis. Main-chat turns retain file IDs, names, source brief and reported usage. Muse history retains the source brief and original-file links. Music briefs preserve the same source evidence through evaluator/challenger/validator steps.

Completed readings are reused for an unchanged prompt and file selection while the page remains open. Provider failure or incomplete output stops downstream generation, without automatic retries. Attachment metadata and briefs are schema-validated on history restore.

Music references inform prompt preparation. They are not automatically audio-to-audio conditioning, remix, voice-cloning or verified acoustic analysis. Speech transcription can be reported; non-speech audio may be poorly characterized. Model-inferred key, tempo, pitch or effects are not measurements. Adding input attachments does not provision new output-generation services.

## MCP

`sovereign_inspect_attachments` accepts existing attachment IDs and a task, returning the same shared brief. The authenticated gateway also provides `attachment_upload` for authorized clients that can upload bytes to its scoped URL. New tool registrations require restarting an already-running stdio MCP process.

## Validation

- Unit suite: 186 passed, including auth/origin checks, limits, signatures, private upload handling, provider payloads and text-only processing.
- Desktop/mobile checks: 18 passed across attachment workflows, all 13 council stages, Muse pipelines and Music Studio (16 in the first completed run, then the two council checks after fixing test readiness).
- Production storage confirmed private. Live image, short video and PDF were read correctly. A spoken WAV's actual test phrase reached the model; reader guidance was refined to report audio-derived text as a transcript candidate rather than dismissing it. A pure tone could not be reliably described; that limitation is exposed in the UI.
- Media integration examples follow Meta's official Responses, file-handling and video/audio-understanding documentation; signed storage operations follow Supabase Storage API documentation.

Final production deployment: dpl_AQPxzT32NGCGVmYzsE7YUmkpFoLY (READY). Corrected audio reader returned the synthetic spoken phrase as a transcript candidate (HTTP 200, Muse Spark 1.2). Live /muse returned 200 with the Attach files control and exact private-storage origin in CSP. No provider key values were printed.

