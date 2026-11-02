# Client theme rendering regression checklist

- [x] Backend emits token roles/scopes without literal syntax colors.
- [x] Local use resolves theme files, JSONC includes and user token customizations directly.
- [x] Remote use captures VS Code's built-in client theme export; no companion extension or installation command.
- [x] Cache exported rules in memory across Console/Data Viewer; invalidate on theme/customization changes and recreate after reload.
- [x] Coalesce concurrent requests and reject outdated responses.
- [x] Only clear the unchanged document created by this export, then wait for the UI tab to be clean before closing its exact tab.
- [x] Preserve pre-existing unsaved documents, user edits, and user focus changes.
- [x] Failed exports/timeouts fall back to readable UI colors without interrupting Stata or repeatedly opening editors.
- [x] Remove companion source, packaging hook, embedded VSIX, icon and installation documentation.
- [x] Real macOS-to-Linux Remote-SSH test: concurrent export, cache, custom colors, prompt-free cleanup, editor selection and Webview focus restoration.
- [ ] Windows local VS Code window and Windows-to-Linux Remote-SSH window.
- [ ] Linux desktop VS Code window.

Synchronization may briefly display a temporary theme editor. It is not a fully invisible data API. Stata platform runners and native libraries are unchanged.
