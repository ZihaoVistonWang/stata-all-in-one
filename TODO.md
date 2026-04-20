# TODO

This file tracks implementation work, validation tasks, and longer-term roadmap items for the repository. Keep it under version control and update it as milestones change.

## Phase 1 Remaining TODOs

### CLI / Terminal UX
- Re-verify that the dedicated `Stata CLI` path remains the only execution path even when VS Code restores a default shell terminal from the previous session, and make the terminal experience single-path and predictable.
- Decide whether the `Stata CLI` terminal should support direct interactive command input. If interactive input is intended, implement and validate a clear input path; if not, document that the terminal is output-only in Phase 1 and defer interactive input explicitly.
- Add a terminal width warning. If the visible terminal width is narrower than 80 columns when code runs, append a warning line telling the user that the terminal is too narrow and should be widened.
- Keep the default `Stata CLI` panel location on the right, but improve the UX around width persistence since VS Code panel width is not reliably remembered in the current flow.
- Revisit terminal output colors, especially table/statistical output, so the CLI view is easier to read and closer to a usable Stata console experience.

### CLI Execution Semantics
- Re-verify that first-run behavior both starts the CLI session and executes the requested code in one action.
- Re-verify session working-directory semantics:
- On first CLI startup, default to the current `.do` file directory when `cdToDoFileDir` is enabled.
- After a failed relative-path command, a later manual `cd` followed by the same relative-path command must succeed in the same session.
- Keep Stata command failures in CLI output only (`r(xxx)` etc.), and only offer GUI fallback for extension/backend failures.
- Continue aligning temporary do-file behavior with GUI mode:
- Use the same filename (`stata_all_in_one_temp.do`)
- Place it in the working/document directory when possible
- Delete it after a short delay
- Use `do "..."` rather than `include "..."` for temp-file execution

### Manual Regression Checks Required By This Repo
- Press `F5` and validate the changed execution flow in real `.do` files inside Extension Development Host.
- Validate changed commands and keybindings, especially `runSection` / `Cmd+D`, CLI stop behavior, and any fallback prompts.
- Validate `showHelp` / `Cmd+Shift+H` behavior, including whether help output appears in the expected place and whether CLI/GUI execution changes affected it.
- Validate outline behavior was not regressed while changing run-code modules.
- Validate platform logic under `src/modules/runCode/`:
- macOS CLI main path
- macOS GUI fallback path
- Windows GUI-only path and its user-facing messaging
- Validate CLI compatibility assumptions across different Stata macOS editions/versions:
- Confirm whether non-StataNow editions also ship the required dylib/runtime entry points for the current native bridge approach
- Clarify whether extra precompiled native binaries or version-specific handling are needed for older/different Stata releases
- Record that current testing hardware only has the latest StataNow on macOS, so cross-version verification is still pending and requires another installation or another machine
- If grammar/highlighting changes are present, re-check syntax highlighting and completion behavior in `.do` files.

### Known Issues To Resume Tomorrow
- The terminal panel width still feels too narrow in left/right layouts, and panel sizing is still largely controlled by VS Code rather than the extension.
- There is still a code-highlighting problem after git commit `188ad5616153c4c4051d8b93a472186483ec3b3b`; the post-fix highlighting still needs another round of investigation and repair.
- Terminal/table color tuning is still incomplete.
- The final Phase 1 pass should include a clean, explicit checklist of what was manually tested and what remains unverified.

## Future Roadmap

### Phase 2: Windows CLI Implementation
- Implement Windows CLI path using StataSO DLL (libstata-*.dll)
- Cross-platform native module compilation
- Windows dylib discovery logic
- Integration with Windows PowerShell automation fallback

### Phase 3: Data/Frame/Mata JavaScript API
- Implement Data class for dataset manipulation
- Implement Frame class for multi-frame support
- Implement Mata class for matrix operations
- Provide JS API to read/write Stata datasets directly

### Phase 4: r()/e()/s() Return Value Access
- Implement getReturn(), getEReturn(), getSReturn() functions
- Provide dictionary-style access to Stata return values
- Support scalar, macro, and matrix extraction
- Integrate with NumPy for matrix data

### Phase 5: Status Visualization
- Add VS Code status bar indicator for CLI session state
- Show initialization status, dylib path, execution state
- Add showBackendStatus command with detailed info panel
- Optional: Add retryCliSelfCheck command for manual reconnection

### Phase 6: Configuration Options
- Add executionMode setting (auto/cli/gui)
- Add pollingInterval setting for output buffer
- Add graphExportFormat setting (svg/png/pdf)
- Add persistentSession setting for session lifecycle control

### Ultimate TODO
- Evaluate and implement a `Webview`-based Stata Console that replaces or complements the current `Terminal` rendering layer so input blocks, output coloring, code highlighting, separators, runtime display, and Codex-like interaction can be fully controlled.

## Technical Decisions
- ThreadSafeFunction for async execution (non-blocking)
- Independent session per VS Code window
- Universal2 compilation for macOS compatibility
- Runtime dylib loading via dlopen/dlsym (no hardcoded paths)
