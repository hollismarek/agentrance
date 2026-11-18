# Agentrance milestones

## Activity inspector

Implemented: a collapsible inspector per conversation; operation patches merged by ACP toolCallId; provider-reported commands, output, exit codes, permissions, state, and observed elapsed time. Expand operations for snapshots and original event history. Permission controls send only explicit user decisions. Unknown output and timing remain labelled unknown. Provider stderr is not command stderr and is not presented as command output. No terminal execution capability was added.

SQLite stores activity and permission events with timestamps; existing rows remain readable without fabricated timing. A turn ending without a final tool result is shown as “No final result.” Historical permission requests cannot be approved.

Validation: activity reducer tests, database migration/replay tests, TypeScript compilation, and Rust checks pass. Automated browser verification was skipped at the user's request; tests/activity-preview.html and tests/activity-browser.mjs provide an optional local fixture. The user has tried the Tauri app directly. Actual output visibility and timing depend on the provider's ACP reports.

## Next: repository inspection workspace (planned)

1. **Project file browser:** lazy directory listing rooted in each session's configured project. Canonicalize paths and enforce containment, including symlinks. Respect hidden/ignored paths by default, with explicit visibility settings. Directory entries remain display data; selecting a file never executes it.
2. **Read-only code viewer:** file tabs with syntax highlighting, line numbers, search, and bounded reads. Handle binary, large, missing, and non-UTF-8 files explicitly. Open tool-reported locations only after root validation; require an explicit choice for files outside the project. No save/edit commands.
3. **Diff viewer:** unified/side-by-side read-only comparison of ACP diff content and explicitly requested local Git changes. Distinguish provider-proposed changes from filesystem changes, mark stale snapshots, and link validated paths back to the code viewer. No apply, stage, or revert actions.

Use the existing single window: separate collapsible project panel alongside the conversation area, and a resizable inspection area; retain the conversation/provider rail for history and follow the focused conversation’s project in split panes. Test containment and symlink escapes, large/binary files, line navigation, diff additions/deletions, and independent pane selection before committing this milestone.

## Remaining original v0.1 scope

Ollama HTTP with qwen3:4b and agent-directed read-only repository exploration, polished provider/session configuration and final desktop packaging remain separate milestones. reqwest and futures-util are reserved for Ollama. Native bundling is enabled; development uses the separate debug channel. Agentrance does not store provider authentication or add application telemetry.

## UI resilience and configuration follow-up

Implemented after provider review: separate sidebar, session pane, composer, provider settings, and session orchestration; local error boundaries around activity, individual conversations, and the app. Optional malformed tool metadata is handled defensively. Fresh provider defaults resolve the runtime launch directory (the project root under the Tauri development runner), rather than a developer-specific path. Existing valid saved configuration is retained. Invalid saved JSON is reported without overwriting it; saving settings validates fields, unique IDs, argument lists, environment values, and absolute paths. Session startup also checks the directory exists.

The SQLite mutex now covers persistence only. Event sequence numbers are merged and deduplicated on the frontend, preserving stored order if concurrent IPC emissions arrive out of order. Startup history replay and buffering retain activity emitted before session creation returns. Compare creation failures leave successful sessions visible and usable.

Validation: 15 activity cases, 4 provider/event-order cases, 2 Rust storage tests, TypeScript compilation, and a Vite production build pass. Browser automation remains skipped. Provider authentication, tool permission policy, and development packaging settings are unchanged.

## Continue saved conversations

Saved history now offers **Continue conversation**. New chats persist the provider configuration ID and ACP session ID, plus their existing project directory, in SQLite. Continuing launches the matching configured CLI using its existing authentication and the original project root. It prefers advertised `session/resume` support and otherwise uses advertised `session/load`; providers without either capability leave history readable and report the limitation. No fresh conversation is silently substituted if restoration fails or the provider has removed its session.

For older chats, migration recovers an ACP session ID only when saved permission requests for that local conversation contain exactly one distinct nonempty session ID. Chats without that evidence remain read-only. Legacy provider names must match one current configuration unambiguously; new chats match the stable configuration ID. Executable arguments, environment overrides, and authentication data are not copied into the history database.

`session/load` replay notifications do not duplicate the locally saved transcript/activity. Reconnection creates a lifecycle boundary that expires old permissions; request numbers reused by later provider processes cannot resolve old approval records. Closing a connection kills its process without deleting the conversation. Comparisons still start fresh sessions.

Validation: scripted ACP subprocess tests cover load/resume capability negotiation, exact saved session IDs and original roots, transcript replay suppression, separate sessions, continued streaming, and shutdown. SQLite migration tests cover recoverable, ambiguous, and missing legacy IDs. Frontend tests cover provider matching, connection lifecycle ordering, and stale permissions across reconnects. Live Kiro continuation still needs a hands-on check in the Tauri app.

## History labels and cleanup

History entries, open tabs, and conversation headers now use a one-line preview of the first user prompt instead of Agentrance's internal UUID. Titles are derived locally for existing chats too, without sending content to a model. Entries show provider, project, and last recorded activity, and are ordered by that activity. The per-entry options button offers Rename (a persistent custom title) and Delete chat.

Deletion requires confirmation in the app, removes the local session and activity rows in a single SQLite transaction, and closes any idle connection. Running or reconnecting conversations cannot be deleted until stopped/finished. The provider's independently saved session is not deleted. Late provider notifications and in-flight UI refreshes cannot repopulate a deleted local conversation. Closing a tab still only closes its connection; it keeps history.

Validation: summary derivation for old/new chats, persistent rename, Unicode truncation, deletion isolation/idempotence, and transaction rollback tests pass alongside the existing tests (22 frontend cases, 7 Rust tests). TypeScript, Rust, and production frontend build checks pass. Browser automation remains skipped as previously agreed.

## Review follow-up

Closing a read-only history tab no longer writes a connection-closed event or changes its last-activity time. Rename submissions trim surrounding whitespace (the backend remains authoritative), and delete dialogs initially focus Cancel.

Known lifetime limitation: deleted-chat suppression IDs are retained in the backend and frontend until the app exits. They prevent in-flight provider callbacks or stale history requests from repopulating deleted entries. Safe reclamation needs to wait for reader-task termination and outstanding UI requests; pruning immediately after deletion commits is unsafe. This per-run growth remains a later lifecycle improvement, not an immediate removal of the race guard.

## Per-conversation agent selector (Kiro V3)

Each conversation now has an Agent dropdown beside the Activity toggle. It remains visible with the inspector collapsed and does not expand/collapse the inspector when used. The header also shows the active agent's reported name. Saved chats retain their last reported selection; continue the chat before changing it. Switching is disabled during a response, reconnection, or another switch, and independent conversations retain independent controls.

Choices come from ACP session setup and live reports. Advertised select configuration options for mode take precedence and use `session/set_config_option`; otherwise an advertised session modes list uses the V3-supported `session/set_mode`. Grouped configuration choices are supported. Missing or withdrawn controls are labelled unavailable, and unadvertised IDs are rejected in Rust. No V2 launch-flag adapter or legacy Kiro extension is used. New default Kiro configurations explicitly launch V3; existing saved executable/argument settings are preserved.

Configuration and mode replies/notifications update the backend in protocol wire order, and persisted snapshots carry a per-connection revision so delayed publication cannot overwrite newer state. Resume/load restores the reported controls without replaying duplicate conversation content. Failed switches leave the last reported selection intact and show the provider's error. Permission requests continue through the existing explicit approval flow; agent selection does not approve commands or modify authentication.

Validation: 29 JavaScript cases and 11 Rust tests pass, including scripted ACP subprocess switches via both V3 session APIs, failures, unsupported IDs, busy-state rejection, provider-originated changes, restoration, and snapshot ordering. A React static-render check confirms the dropdown remains present outside the collapsed Activity body. TypeScript, Rust, and production build checks pass. Browser automation remains skipped; live Kiro custom-agent selection needs a hands-on check.

Protocol references: https://kiro.dev/docs/cli/v3/acp-migration/ and https://agentclientprotocol.com/protocol/v1/session-config-options .

## Distinguish agent profiles from models

The Activity toolbar now has separate **Agent** and **Model** selectors. Agent profiles such as Default, Plan, or Bug Fix configure the workflow; they are not model names. Model choices and the current value come from the provider's advertised model configuration option, with no hardcoded model catalog or inferred agent-to-model mapping. An **Agent & model details** disclosure, independent of Activity expansion, lists provider-supplied descriptions and model identifiers. Agent descriptions can be enriched from matching advertised modes when configuration choices omit them.

Kiro model metadata `_meta.kiro.rateMultiplier` and `rateUnit` is retained when supplied, and relative rates appear in model choices/details. Missing rates remain missing; this is not a total-cost estimate. “auto” stays an automatic model setting, with an explanation that the provider may select models by task rather than naming a fixed underlying model. Other provider aliases likewise remain exactly what the provider reports.

Model changes use the advertised configuration ID through `session/set_config_option`, validate choices on the backend, and share the existing per-session operation guard. Responses and updates can change dependent agent/model settings, including model pins when switching profiles. Agent and model values are persisted together in revisioned control snapshots. No permission policy or authentication handling is changed.

Validation: 31 JavaScript cases and 13 Rust tests pass. New coverage includes independent agent/model IDs, descriptions and pricing metadata, rejected and busy model changes, dependent model changes during profile switches, snapshot replay/order, and static rendering of model details outside the collapsed inspector. TypeScript, Rust, and production build checks pass. Live Kiro behavior remains a manual check in the Tauri app; browser automation is still skipped.

## Consolidated Help and conversation copying

**Menu → Help & About** centralizes getting-started instructions, keyboard shortcuts, comparisons, activity/permissions, history management, copying, and privacy/provider-account information. Provider settings also moved into the menu. The sidebar privacy footer, composer instruction line, and in-pane documentation disclosure were removed; the main header is shorter. Operational statuses and approval controls stay in the workspace. A small **?** beside the selectors opens the same Help screen at that conversation's agent/model reference, including its reported descriptions and rates. Help has Escape/Close, trapped keyboard focus, and focus restoration. A first-run walkthrough remains a future enhancement.

Each question has Copy question, and each finished response has Copy answer and Copy Q&A. Plain-text copying preserves the original Markdown, code blocks, whitespace, and question/answer association while excluding tool and approval payloads. In-progress responses are not copy-ready, while earlier completed turns remain copyable. Copy actions show progress, confirmation, and a retryable error. The Linux native command writes through GTK on the main thread, using the toolkit already used by Tauri; it provides no clipboard-read API and is invoked only by a copy action. Other platforms report that native copying is not implemented in this build.

The transcript is now grouped into turns using user/response/lifecycle events, preserving old logs without turn-end markers and interrupted responses. Agent/model extraction and turn grouping are memoized, and rate labels are computed once per option. Agent/model switches remain serialized because their provider settings can be dependent.

Validation: 38 JavaScript cases and 13 Rust tests pass, plus TypeScript, Rust, and production build checks. New tests cover streamed Markdown copying, Q&A pairing, exclusion of activity data, finished versus streaming turns, interruption/resume boundaries, central Help references, compact workspace markup, and copy-control availability. Native clipboard transfer and visual/focus behavior still need a hands-on check in the Tauri app; browser automation remains skipped as agreed.

## KDE/Wayland icon registration

The bundled artwork alone did not supply KDE with an application-menu entry or matching Wayland identity. Tauri now registers the existing `local.agentdesk.app` identifier as its GTK application ID. The per-user desktop installer writes a matching `local.agentdesk.app.desktop` entry and 32/128/256-pixel hicolor icon resources. It refreshes available KDE/icon caches without launching or stopping the app.

A `custom-protocol` Cargo feature enables a standalone release build with the frontend embedded, so the application-menu launcher does not require a development server. The launcher points at this checkout's release binary. Development and standalone windows share the same application identity; close existing windows before launching the updated app. GTK's application-ID registration permits one process for this identity, while sessions remain independent within the window.

The installer defaults to a read-only preview; `--install` registers only per-user files. Three tests validate the launcher, matching IDs/icon resources, repeat installation, preservation of unrelated entries, rejection of missing binaries, and desktop command quoting. See scripts/README.md for regeneration and installation. Desktop installation outside the project requires execution permission in Codex.

Development and standalone webviews have different origins: conversation history and CLI authentication are shared, but browser-local provider preferences may need to be re-entered when moving between them. Consolidating those preferences into app-wide storage is a later packaging improvement.


## Standard Tauri desktop icon assets and packaging

Added Windows ICO, macOS ICNS and high-resolution PNG assets using Tauri's icon
generator, enabled the standard bundler, and added an HTML favicon. Removed the
KDE-specific cache refresh from the optional Linux development-launcher script.
The native window icon was already being applied by Tauri automatically; adding
a favicon does not fix a compositor's generic Wayland taskbar icon. The user's
reported generic icon occurs in `npm run tauri dev` and remains unverified at
runtime. Native packaging is now configured, but installers have not been built
or tested on Windows/macOS or Linux in this milestone.


## Align the native Wayland window identity

The user's development trace showed `xdg_toplevel.set_app_id("agent-desk")`,
while the installed desktop entry and icon use `local.agentdesk.app`.
`enableGTKAppId` alone did not align these: GTK3 derives the Wayland ID from
its program name. Before Tauri initializes GTK, Linux startup now sets that
name from the Tauri context identifier. This uses the existing GTK dependency
and does not change Windows/macOS startup. The live development watcher rebuilt and restarted the app; the new trace
confirmed `set_app_id("local.agentdesk.app")`. Cargo check and all 13 Rust tests
passed. The visible taskbar icon still requires user confirmation.

## Independent composers and a two-pane workspace

Each conversation now owns a composer and an in-memory draft, retained across tab
switches, layout changes, and moves between panes. Send and Stop target only that
conversation. Closing/deleting a chat discards its draft; application restarts do
not restore unsent drafts.

Layout selects a single pane, side-by-side panes, or stacked panes. Each pane has
its own tabs; clicking a pane targets new sessions and history opens. Existing
open conversations are selected in their current pane. Move to other pane transfers
the selected tab. Single-pane mode merges tabs without closing sessions. The
divider supports pointer dragging and keyboard arrows (Home resets to halfway).

Compare opens a dedicated prompt dialog and creates fresh independent sessions
for all configured providers, distributed across the two panes; additional
providers remain available as tabs. Comparison prompts do not consume chat drafts.
Help describes these controls. Provider protocol, history, and approvals are
unchanged.

Validation: five workspace cases cover opening/focusing, comparison distribution,
moving tabs, single-pane merging and closing/deletion. Two composer cases cover
input/send isolation, Shift+Enter, IME, repeated Enter and disabled sending. All
existing frontend tests, TypeScript compilation and the production build pass.
Visual sizing and native pointer dragging still need a hands-on check in Tauri;
browser automation remains skipped as agreed.


## Workspace review follow-up

Confirmed that `useSessions.panes` is a stable state array, changed only by explicit
navigation; its effect dependency must preserve repeated opens of the same chat.
Made the pane flex shorthand explicit (`grow 1 0%`) so the two pane weights divide
space remaining after the divider. Percentage bases totaling 100% would also need
to account for divider width. Kept pointer selection because blank pane space does
not receive keyboard focus automatically. Single-pane empty instructions now omit
"Click this pane". TypeScript, frontend tests and the production build pass.

## Timeout lifecycle hardening

ACP request timeouts now stop the provider transport, suppress subsequent events,
clear pending permissions/requests and mark the conversation disconnected before
releasing its turn lock. Reconnection is required before another prompt. Event
emission and shutdown share a gate so output cannot escape after shutdown.
A fake-provider test checks timeout, disconnection, rejected follow-ups and absence
of late text. All 14 Rust tests pass.

## Recover failed prompt drafts

Send now reports success/failure to its owning composer. A failed send restores
its cleared draft only when its revision still matches: subsequent typing,
deliberate clearing and closing the chat prevent restoration. Other conversation
drafts are untouched. Two regression cases cover these paths. Frontend tests,
TypeScript and production build pass. A partially delivered response can still
leave its prompt in history; restoring the draft never automatically resends it.

## Bounded provider diagnostics

Provider stderr is drained in fixed-size chunks into an 8 KB in-memory tail.
Startup/restore errors and transport failures include available stderr, labelled
as provider diagnostics. It is never emitted as command stdout, tool output, or
chat text. An EOF waits at most 200 ms for final diagnostics, then aborts the
stderr reader so descendants cannot hold startup failure reporting open. Shutdown
also aborts that reader. Stop notifications are idempotent: an already closed
connection cannot emit a later timeout disconnection into a replacement session.

Regression tests cover a login-related startup exit, no invented tool/text events,
and bounded diagnostics without newlines. All 16 Rust tests and 3 installer tests
pass. Frontend tests, TypeScript and production build passed for the draft change.
Live-provider timeout and startup-error UI interactions have not been forced in
the running app; subprocess tests exercise those failures without interrupting
real conversations.

## Stable and development channels

Debug startup overrides the Tauri identifier, product/window name and native icon
before the runtime initializes. Development uses `local.agentdesk.app.dev` and a
DEV-marked icon; release retains the existing identity and artwork. A runtime
channel command adds a DEV badge to the workspace. SQLite and webview storage use
separate identities; existing history stays under Stable, with no copying of live
databases or provider credentials. The channel configuration has a regression test.

Standard Tauri packaging remains the cross-platform distribution path. The Linux
workstation additionally has an opt-in snapshot installer: it stages immutable
release binaries/icons outside the checkout, registers a stable menu entry,
retains the previous snapshot and provides a rollback command. Installing does
not restart running apps or migrate their data. A hidden development entry lets
Wayland resolve the DEV taskbar icon independently. Tests cover immutable copies,
repeat promotion, rollback, preservation of data, invalid candidates and isolated
DEV registration. Windows/macOS native installers remain untested here.

Provider settings now use a validated, atomically replaced JSON file in each
channel's native app-data directory, rather than relying on webview localStorage
isolation (which varies across platforms). Stable may import its legacy webview
configuration once; Development does not import that shared legacy key. A storage
test verifies isolation, repeat writes and preservation after invalid saves.

Validation: frontend tests, TypeScript, production frontend build, 18 Rust tests
and six Python installer cases pass. Release compilation succeeds; the Linux
stable snapshot was installed outside the checkout and its executable hash was
verified against the built artifact. Native side-by-side operation and the new
DEV icon still need the user's hands-on confirmation. A project handoff document
is available at docs/HANDOFF.md for a new Codex conversation in Stable.

## Collapsible workspace sidebar

The workspace header now offers Hide sidebar / Show sidebar to reclaim horizontal
space on small screens. The sidebar stays mounted while hidden, retaining its
selection and history state. The toggle reports its expanded state to assistive
technology and remains available when collapsed. Header controls wrap on narrow
windows. Visibility resets to expanded when the app restarts.

Validation: frontend tests, TypeScript and production build pass. The Development
launch command completed; native small-screen appearance and toggling still need
a hands-on check. Stable was not restarted or upgraded.


## Compact sidebar rail

Collapsing now retains a 64-pixel sidebar rail. The sidebar itself owns the
« / » toggle; New session becomes a plus button using the last selected provider,
and provider selection is hidden until expanded. History shows provider-initial
icons with accessible conversation labels and title/provider/project tooltips.
Expand to access rename/delete controls. Help describes the updated controls.

Validation: frontend tests, TypeScript and production build pass. Native visual
verification remains a hands-on Development check; Stable is unchanged.


## Preparation for repository inspection

Provider startup, channel loading, legacy import and settings persistence now live
in useProviders. WorkspaceLayout owns pane rendering and divider sizing; App keeps
navigation and draft state. Existing provider, draft and permission behavior is
preserved. CSS is formatted into named sections with its original rule order and
cascade unchanged.

New session's accessible label includes the selected provider. Conversation
headers show separate wrapping Provider, Status, Agent and Model fields, with a
wrapping project path. Resume errors include the unavailable original path and
explain restoring it or starting a new session at a relocated project; changing
provider settings does not relocate saved conversations.

The planned file browser will use a separate collapsible project panel, following
the focused conversation's root. The existing conversation rail retains history
and provider controls. The project browser itself remains a future milestone.

Validation: frontend tests, TypeScript/production build, offline Cargo check and
all 18 Rust tests, plus six Python installer tests pass. Existing CSS rule order
and contents were compared mechanically. Development launch completed; native
visual checks remain manual. Stable was not restarted or upgraded.

## Auto-growing prompt editor

Each composer starts at three lines and grows with typed, pasted or restored text
up to ten visible lines. Longer prompts scroll inside the editor. Clearing text
shrinks it again; pane-width changes recalculate wrapped text height. A scoped
ResizeObserver is disconnected when the editor ref changes or unmounts. Drafts,
sending and keyboard behavior remain per conversation.

Validation: frontend tests, TypeScript and production build pass. Development was
launched for the native check; paste/wrapping and native visual sizing still need
a hands-on check. Stable was not restarted or upgraded.


## Readable ACP permissions and activity scrolling

Permission cards now render standard ACP request snapshots as provider, optional
tool category/status, full agent-authored description, paths, raw input and
supported text/diff content. Missing descriptions get an explicit fallback.
Original request JSON remains in a closed Technical details disclosure. Requests
are not reconstructed from later updates; provider option names/IDs and explicit
approval behavior are unchanged. No Kiro-specific metadata interpretation added.

The inspector now permits flex shrinking, clips its outer bounds, and keeps a
single list scroll area with minimum height zero and browser scroll anchoring
disabled. Nested output blocks allow wheel scrolling to continue into the list
at their boundary rather than trapping it. It follows new activity when already at the bottom, preserves the
reader's position when scrolled up, and offers Latest activity to return directly
to the bottom without reopening the inspector.

Validation: frontend tests and TypeScript/production build pass. New rendering
coverage checks full descriptions, closed raw details, sparse/malformed requests,
paths, inputs and diffs. Development launch completed. Native scrolling under
streaming load remains a hands-on verification; no live user conversation was
used to force tool or permission events. Stable was not restarted or upgraded.

## Expanded activity reading preset

Open Activity now offers Expand activity / Shrink activity beside Latest activity.
Normal workspace height remains capped at 35%; expanded raises the cap to 60%.
The size control exposes its pressed state to assistive technology. Closing the
inspector resets the preset; switching conversations unmounts its local state,
so each newly displayed conversation starts at the normal size. Automatic
permission reveal does not downgrade an already expanded inspector. Following
the latest entry remains active across size changes only while reading at the
bottom; scrolling above continues to preserve the reader's position.

Validation: frontend tests, TypeScript and production build pass. Development
launch completed; native expanded sizing on short/stacked windows remains a
hands-on check. Stable was not restarted or upgraded.

## Public name: Agentrance

The product is now called Agentrance. Sidebar branding, Help, dialogs, runtime
errors, HTML/native window titles, packaging product names, generated Stable and
Development desktop-entry names, and current documentation use the new name.
Internal package/executable names, ACP client name, application identifiers,
release directories and app-data locations retain their existing values. No
history/settings migration or credential copying is needed. Existing installed
Stable snapshots are unchanged until explicitly upgraded.

Validation: frontend tests, TypeScript/production build, offline Cargo check,
18 Rust tests and six Python installer tests pass. Channel and desktop-entry
checks verify the new display names with the existing native identifiers.
Development launch was checked; Stable was not restarted or upgraded. Native
packaging on Windows/macOS remains unverified on this Linux workstation.

## macOS and Windows portability preparation

Native text clipboard writes are implemented for macOS/Windows with a
target-specific arboard dependency, serialized on the UI thread through the
existing write-only command. Linux keeps GTK. Windows release startup suppresses
the application console and provider spawning sets CREATE_NO_WINDOW while keeping
stdio piped. No provider permissions or authentication behavior changed.

A platform helper resolves absolute executables or bare names on explicit,
absolute PATH entries (honoring overrides), with actionable missing/non-executable
errors. Relative executable paths and Windows batch wrappers receive explicit
setup guidance; npm adapters can use node.exe plus their JavaScript entry file.
Project roots use dunce canonicalization for provider-compatible Windows paths
when safe; necessary verbatim paths remain intact. Saved roots are normalized
for launch without rewriting history or selecting a different project.

Fresh release defaults no longer assume the launcher directory is a project.
Missing configuration opens settings, with explicit project fields plus advanced
JSON. Empty roots route New session/Compare to settings. Development retains its
repository suggestion; valid saved settings and Stable's legacy import remain.

Fake ACP tests accept AGENTRANCE_TEST_PYTHON or detect a Python 3 interpreter.
Added native path/executable tests and frontend setup/Windows-path coverage. A
GitHub Actions workflow is prepared for Linux, macOS and Windows checks, without
release publication. It has not run remotely because no remote is configured.

Validation: frontend tests, TypeScript/production build, offline debug/release
Cargo checks, 20 Rust tests and six Python installer cases pass on Linux. ACP
tests also pass with an explicitly selected Python interpreter; workflow YAML
parses and Development launches successfully. macOS and Windows
native compilation, clipboard/UI/provider tests and packaging remain unverified
until those runners/machines are available. Stable was not restarted or upgraded.


## GitHub publication preparation

Added a root README covering current features, provider setup, Development,
platform limitations, tests, packaging and local data. Expanded ignore rules for
local settings, credentials, database files and editor/OS files, while retaining
.env.example eligibility. The current handoff uses a clone-relative description
instead of a workstation path. License selection remains pending.

Publication review scanned 250 historical text blobs and commit messages for
common credential patterns and found none. No tracked credential/database paths
were found; current PNG artwork contains no text/EXIF chunks. This is a heuristic
review. Existing author name/email and historical workstation paths remain in Git
history; no history rewrite or push was performed. README links and ignore rules
were checked. Application code and the installed Stable snapshot are unchanged.


## Adaptive workspace with up to four panes

Layout now supports three panes and a four-pane grid in addition to the
existing single, side-by-side and stacked modes. Three/four-pane layouts use
container-width breakpoints, reflowing to two or one column on narrower logical
screen widths. Grid panes retain a 420px minimum reading height and the workspace
scrolls when needed. Two-pane layouts retain pointer/keyboard divider resizing.
Focus pane temporarily shows the active pane at full size; Show all panes
restores the layout. Focused view follows history/new-session navigation, so
opening a conversation in a different pane cannot leave it hidden.

Move to selects a destination pane. Reducing the layout merges excess tabs into
the last visible pane while preserving the focused conversation, all sessions,
and session-owned drafts. Fresh comparisons in single-pane mode choose up to
four panes; additional providers remain tabs. Invalid pane actions are rejected.

## System-following light and dark appearance

Semantic CSS tokens cover workspace, sidebar, dialogs, Help, transcript, activity,
permission/status cards and controls in both palettes. Menu → Appearance defaults
to System, responds to OS changes live, and offers Light/Dark overrides. The
preference is stored under channel-specific localStorage keys; storage failures
leave it usable for the current run. Native select faces retain the established
light face/dark text treatment for GTK readability. No provider settings, history
schema, permissions or authentication handling changed.

Validation: frontend tests, TypeScript and production build pass. Added reducer
coverage for three/four-pane comparisons, extra tabs, moves, reducing/reopening
layouts, deletion and invalid actions; rendering checks cover four independent
composers. Theme tests cover OS changes, overrides and subscription cleanup, plus
4.5:1 minimum contrast for principal text/status combinations in both palettes.
Development is used for launch testing. Native visual sizing across QHD/laptop
screens and OS-theme changes still need hands-on verification; browser automation
remains deferred. Stable was not restarted or upgraded.


## Responsive layout naming

Renamed the three-pane option to Three panes, matching its responsive behavior:
three columns on wide workspaces, fewer columns on narrow ones. Help and README
use the same name. Layout behavior is unchanged. Production frontend build passes.


## Form-based Settings and installed-provider discovery

Menu → Settings replaces the JSON provider editor with display-name, executable,
project-folder, individual argument and environment-row fields. A shared project
can be applied explicitly to all providers. Saved provider IDs and exact argument
boundaries/environment values survive editing; duplicate environment keys are
rejected. Add/remove operations are staged until Save settings. Appearance moved
onto this screen; its changes still apply immediately, as labelled. The modal
supports Escape, focus trapping/restoration, and independent scrolling on small
screens. Existing atomic channel-specific settings storage remains unchanged.

Startup discovery reads filesystem metadata in PATH and common native/npm/Node
manager locations, bounded to 256 directories and limited version/manifest reads.
It finds Kiro CLI's V3 ACP launcher and Codex ACP adapters; plain codex is not
mistaken for an ACP server. npm adapters use an explicit node executable plus a
contained JavaScript bin entry read from package.json, including on Windows.
The check runs off the UI thread, has a three-second UI timeout, and prevents
concurrent scans. It never launches a CLI, installs software, authenticates,
changes permission policy, or creates a conversation. Presence is not proof of
version compatibility or login; session startup still performs negotiation.

Fresh setup prefills detected providers and asks for project folders. Saved
configurations, IDs and launch settings are not rewritten by discovery; Settings
shows available additions and a Check again button. Manual presets/custom ACP
configuration remain available when discovery finds nothing or times out.

Validation: frontend tests, TypeScript/production build, offline Cargo check and
22 Rust tests pass on Linux. New coverage checks form round trips/validation,
settings-only Appearance, native launchers, plain-Codex exclusion, npm runtime
requirements and manifest path containment without executing the fake launchers.
A read-only probe of the actual discovery implementation found Kiro and Codex ACP
on this workstation without launching either. Native Settings interaction and
Windows/macOS discovery layouts remain hands-on checks. Development is used for
launch testing; Stable is not restarted or upgraded.

## Additional native ACP discovery and keyboard scroll containment

Added Gemini CLI (--acp), OpenCode (acp), and Copilot CLI (--acp --stdio)
discovery and manual presets. Gemini/Copilot npm installations can use explicit
Node plus their package's contained bin entry. Discovery does not authenticate
or execute a provider; account availability and live compatibility remain manual
checks. Claude adapter discovery is not included in this pass.

Fixed layout shells now use overflow:clip rather than keyboard-scrollable hidden
overflow. A capture-phase scroll recovery guard resets only fixed shell offsets,
leaving actual content scroll areas alone. This addresses the reported Page Down
view displacement without intercepting Page Down in editors or content lists.
Frontend tests/build and Rust tests pass; exact native Page Down reproduction and
live added-provider checks remain manual in Development. Stable is unchanged.

## Review follow-up: history order and CSS-only keyboard containment

History's last-activity query excludes session_closed events, including previously
stored closures, so closing a live connection no longer promotes a conversation.
The lifecycle event remains persisted and replayable; permission expiry and
interrupted-turn handling are unchanged. A regression test checks ordering,
completion timestamps, closure-only chats, retained replay and genuine follow-ups.

Removed the global capture/window/root scroll-reset listeners. Fixed layout
shells retain overflow:clip; content areas retain their independent scrolling.
Native Page Down/Page Up and focus-navigation testing in Development is still
required to confirm CSS-only containment on the user's WebKit build.

Validation: frontend tests, TypeScript/production build and all 24 Rust tests pass.
Development launches successfully. Stable remains running unchanged. Licensing
remains deferred by the user while the GitHub repository is private.

## Multi-agent review follow-up: configuration identity and startup gating

New provider configurations now receive UUID-backed IDs, including fresh detected
setup defaults. Removing and re-adding a provider cannot recycle a prior ID and
bind its saved remote sessions to another backend. Existing configuration IDs
remain unchanged through editing and persistence.

Settings is disabled until provider initialization completes, and the form is
only mounted once ready. This avoids capturing an empty provider list while
first-run discovery is pending. Saved configurations still load independently
of background discovery. Startup failures do not expose a blank editable form.

The Help navigation finding was stale: current instructions already use Menu →
Settings and Menu → Settings → Appearance. Added regression assertions. Confirmed
Gemini's bin key is gemini and the installed Copilot package uses copilot with
npm-loader.js; new npm fixtures test both actual shapes and preserved ACP args.

Validation: frontend tests and production build pass; all 25 Rust tests pass.
Tests cover identity non-reuse after removal, retained existing IDs, startup menu
gating, current Help navigation and the new npm fixtures. Native CSS-only Page
Down verification remains manual. Stable is unchanged.

## Require persisted provider identities before first use

Start, opening Compare, and submitting a comparison now share a guard requiring
completed initialization and a saved initial provider configuration. Dismissing
first-run Settings cannot create conversations with ephemeral discovered IDs:
the next launch action reopens Settings instead. Only a successful settings save
clears needsSetup; failed saves and repeated dismissals remain gated. Existing
saved configurations continue to start normally. Settings explains why the
initial save is required. This prevents new affected chats; it does not rewrite
identities in previously created conversations.

Validation: all 11 frontend test files and the production build pass. Regression
coverage exercises repeated unsaved attempts, comparison submission, startup
loading and the saved-configuration path. Development launch testing is used;
Stable remains untouched.

## Direct approvals and prompt attachments

Active permission requests now appear in an always-visible, independently
scrollable approval area above the composer, outside Activity and tool-details
collapsers. Provider-supplied options remain explicit per-request decisions;
resolved/expired requests remain in the inspector. Similar requests from multiple
providers are not silently combined. A future explicitly selected multi-request
response could consolidate clicks while retaining each provider's scope.

Conversation composers have an Attach files plus button using the webview's
user-initiated file picker. A removable image/file strip appears only when files
are present. Draft attachments belong to the session across layout/tab changes,
are cleared with a successful send, and restore on failure only if no newer draft
edits superseded them. Sending is disabled while file reads are pending. Limits:
eight files, 5 MB each, 15 MB total. Attachments are in-memory; history records
filenames, not original attachment bytes. Comparison-dialog attachments are not
included in this first pass.

Rust validates encoded data, metadata/count/size limits and the current
connection's advertised prompt capabilities before recording/sending the prompt.
PNG/JPEG/WebP/GIF use ACP image blocks only with image capability. UTF-8 text
files use labeled text blocks. PDFs/binary files require embeddedContext and use
embedded resources. Unsupported inputs report an error rather than omission.
Binary resource acceptance does not guarantee a provider understands its format.
No arbitrary-path read command, provider authentication or approval-policy change
was introduced. Shared approvals remain a design discussion.

Validation: frontend tests/build and Rust tests pass, with coverage for directly
visible pending approvals, historical approval suppression, attachment isolation,
failed-send restoration, text blocks and rejected image/invalid data. Development
launch and native file-picker/real-provider image tests remain hands-on checks.
Stable is not restarted or upgraded.


## Compare attachments

The Compare dialog now uses the same attachment picker, removable thumbnail
strip and limits as conversation composers. File-only comparison prompts are
supported. Start comparison stays disabled while files load. The selected
attachment snapshot is sent to every successfully created session; Rust checks
each connection's capabilities independently. One provider's rejection does not
prevent others from receiving their prompts. Concurrent send failures are
aggregated with provider names rather than overwriting each other. Comparison
attachments remain independent from conversation drafts and are discarded when
the dialog closes, as with its existing text draft.

Validation: frontend tests/build pass, including Compare picker markup, hidden
empty-strip and initial send-state coverage. Native file-picker and multi-provider
image compatibility remain hands-on checks in Development. Stable is unchanged.
