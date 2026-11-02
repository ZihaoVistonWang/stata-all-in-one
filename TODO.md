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
- [x] User verified Windows local VS Code and Windows-to-Linux Remote-SSH.
- [x] User verified macOS local VS Code and macOS-to-Linux Remote-SSH.
- [ ] Linux desktop VS Code window.

Synchronization may briefly display a temporary theme editor. It is not a fully invisible data API. Stata platform runners and native libraries are unchanged.

# Post-merge maintenance

- [x] Remove the unused companion theme refresh command; retain automatic theme/configuration listeners.
- [x] Keep Linux debug license diagnostics from switching to unsupported External App mode; preserve macOS/Windows behavior.
- [x] Run Linux auto-discovery in a terminable Worker so its timeout does not depend on synchronous filesystem work completing.
- [x] Regression tests cover blocked scans, worker errors/exits/startup failures, and platform-specific debug fallback behavior.
- [x] Half-core Linux server: 14 related tests pass; normal discovery finds the installed Stata 19 editions.
