# ApiMocktle

[**English**](README.md) | [简体中文](README.zh-CN.md)

**Mock** (mimicry — like a parrot, highlighting API mocking) + **Turtle** (the shell, symbolising stable data structures) → **Mocktle**. A local-first API management desktop app built on **Tauri v2 + React + Rust + SQLite**.

To be honest, the name came first and the explanation came after — the AI suggested it. The real reason is that I keep a parrot 🦜 and a turtle 🐢.

It bundles account management, project management, API catalogs, document and data-model editing, environment variables, request debugging, **automated test flow orchestration**, Swagger/OpenAPI import & export, **LAN document sharing**, and **MCP server (AI agent integration)** into one offline-capable desktop app. Your data stays on your machine.

## Screenshots

> Click a thumbnail to view the full-size image.

| Module | Feature 1 | Feature 2 | Feature 3 | Feature 4 |
| --- | --- | --- | --- | --- |
| **Projects** | **Project list**<br/>Cards show API/model/quick-request/self-test counts and your role<br/><a href="assets/readme/01-projects.png"><img src="assets/readme/01-projects.png" width="300" alt="Project list"/></a> | **New project**<br/>Project name + 885 icon choices<br/><a href="assets/readme/02-project-create.png"><img src="assets/readme/02-project-create.png" width="300" alt="New project"/></a> | **Edit project**<br/>Change name and icon<br/><a href="assets/readme/03-project-edit.png"><img src="assets/readme/03-project-edit.png" width="300" alt="Edit project"/></a> | **Quick switch**<br/>Multi-project tab bar + search<br/><a href="assets/readme/04-project-tabs.png"><img src="assets/readme/04-project-tabs.png" width="300" alt="Project switch"/></a> |
| **API docs** | **API document**<br/>Tree catalog + parameter tables + multi-status responses<br/><a href="assets/readme/05-api-doc.png"><img src="assets/readme/05-api-doc.png" width="300" alt="API document"/></a> | **Edit API**<br/>Query/Path/Header/Cookie params and 6 body types<br/><a href="assets/readme/06-api-edit.png"><img src="assets/readme/06-api-edit.png" width="300" alt="Edit API"/></a> | **Schema editor**<br/>Tree editor for request/response JSON Schema<br/><a href="assets/readme/07-api-schema.png"><img src="assets/readme/07-api-schema.png" width="300" alt="Schema editor"/></a> | **Data models**<br/>Reuse model definitions across APIs via `$ref`<br/><a href="assets/readme/08-api-model.png"><img src="assets/readme/08-api-model.png" width="300" alt="Data models"/></a> |
| **Request runner** | **Run parameters**<br/>Environment variable resolution, parameter overrides, text preserved when switching body type<br/><a href="assets/readme/09-api-run.png"><img src="assets/readme/09-api-run.png" width="300" alt="Run parameters"/></a> | **Response**<br/>Formatted JSON response + elapsed time<br/><a href="assets/readme/10-api-run-result.png"><img src="assets/readme/10-api-run-result.png" width="300" alt="Response"/></a> | **Request/response headers**<br/>Actual outgoing headers + response headers, one-click cURL copy<br/><a href="assets/readme/11-api-headers.png"><img src="assets/readme/11-api-headers.png" width="300" alt="Headers"/></a> | **Run history**<br/>Auto-saves the last 10 runs, one-click restore<br/><a href="assets/readme/12-api-history.png"><img src="assets/readme/12-api-history.png" width="300" alt="Run history"/></a> |
| **Automated tests** | **Task list**<br/>Folder grouping + status/fail-fast management<br/><a href="assets/readme/13-test-tasks.png"><img src="assets/readme/13-test-tasks.png" width="300" alt="Task list"/></a> | **Flow canvas**<br/>Drag-and-drop with 9 node types + ELK auto-layout<br/><a href="assets/readme/14-flow-canvas.png"><img src="assets/readme/14-flow-canvas.png" width="300" alt="Flow canvas"/></a> | **Node config**<br/>Visual editing of request overrides, assertions and extractors<br/><a href="assets/readme/15-flow-config.png"><img src="assets/readme/15-flow-config.png" width="300" alt="Node config"/></a> | **Run flow**<br/>Environment selection + single-node debug + live logs<br/><a href="assets/readme/16-flow-run.png"><img src="assets/readme/16-flow-run.png" width="300" alt="Run flow"/></a> |
| **Environments** | **Environment space**<br/>Global variables and secrets in one place<br/><a href="assets/readme/17-env-global.png"><img src="assets/readme/17-env-global.png" width="300" alt="Environment space"/></a> | **Global parameters**<br/>Global Header/Query/Cookie/Body parameters<br/><a href="assets/readme/18-env-params.png"><img src="assets/readme/18-env-params.png" width="300" alt="Global parameters"/></a> | **Edit environment**<br/>Base URL + environment variables + global parameters<br/><a href="assets/readme/19-env-edit.png"><img src="assets/readme/19-env-edit.png" width="300" alt="Edit environment"/></a> | **Switch environment**<br/>Switch from the top toolbar at any time<br/><a href="assets/readme/20-env-switch.png"><img src="assets/readme/20-env-switch.png" width="300" alt="Switch environment"/></a> |
| **Doc sharing** | **Sharing panel**<br/>LAN sharing service + link list<br/><a href="assets/readme/21-share-panel.png"><img src="assets/readme/21-share-panel.png" width="300" alt="Sharing panel"/></a> | **Create share**<br/>Title / password / expiry<br/><a href="assets/readme/22-share-create.png"><img src="assets/readme/22-share-create.png" width="300" alt="Create share"/></a> | **Choose scope**<br/>Share everything or pick specific endpoints<br/><a href="assets/readme/23-share-scope.png"><img src="assets/readme/23-share-scope.png" width="300" alt="Choose scope"/></a> | **Edit share**<br/>Keep / set / remove the access password<br/><a href="assets/readme/24-share-edit.png"><img src="assets/readme/24-share-edit.png" width="300" alt="Edit share"/></a> |

## Features

### API management

- Tree catalog: drag to reorder, rename, duplicate, move, delete, restore from recycle bin
- Resource types: API endpoint / Markdown doc / data model / quick request
- API editing: path, Query/Path/Header/Cookie parameters; body supports JSON / XML / form-data / url-encoded / raw / binary
- Tree-based JSON Schema body editor (field name, type, example value, description); data models are reusable across APIs via `$ref`
- Responses support multiple HTTP status codes, each with its own JSON Schema
- Unsaved changes are kept in a **local draft**, so switching pages loses nothing

### Request debugging

- Runs in its own Run tab: response body, response headers, request headers, one-click cURL copy
- Query parameters and JSON body are sent together; `{{var}}` environment variables are resolved at runtime
- One-click body fill from schema examples or `default` values (JSONC comments supported)
- Run history is saved automatically (last 10 runs, errors included) and viewable in a drawer
- Per-request timeout, automatic cookie handling, binary response preview/save, optional TLS certificate verification bypass

### Automated testing (since v1.4)

- Drag-and-drop flow canvas with 9 node types: start / end / HTTP request / condition / loop / wait / parallel / set variable / assertion
- ELK auto-layout; enhanced edges (bezier/polyline, branch labels, loop body/exit labels); path highlighting
- Flow execution engine: environment selection, live logs, node status highlighting (pulse/green/red), fail-fast mode
- PreScript hooks, While/ForEach loops, conditional waits, sub-flow execution, persisted execution records
- Flow validation, node outline, execution-history panel, task folder grouping
- **MCP server**: **25 tools** that let an AI agent read API context and create test tasks in one step; AI prompt is generated automatically

### Environments and variables

- Project-level global environment switching (dev/prod/etc.)
- Global variables, environment variables, secrets and base URL in one place, using `{{varName}}` template syntax
- Dynamic variables (QuickJS script engine): scriptable built-ins, argument injection, completion hints
- Session variables; global Header / Query / Cookie / Body parameters; per-user local values override team values

### Import, export and sharing

- Import: OpenAPI 3.x / Swagger 2.0, JSON or YAML, silently merged into the current project
- Export: OpenAPI 3.0 / Swagger 2.0 spec documents, Markdown / MHTML docs, cURL
- **LAN doc sharing**: read-only guest page with password auth, no-password or password-protected links, edits propagate, live refresh
- Personal token (YAPI-compatible): sync projects with the [Java plugin](https://github.com/xiaohuiduan/ApiMocktle-java-plugin)

### Experience and personalisation

- Design style system: CSS-variable driven, 4 styles (including glassmorphism), light/dark themes fully supported
- Three UI density levels: compact / standard / loose
- Multi-project tabs: browser-style switching, context menu, save-state feedback (saving / failed / unsaved)
- Status bar: current environment name / URL + count of unsaved tabs
- Global network proxy: SOCKS5 / HTTP(S), persisted, applied immediately, with connection test
- Unified icon system powered by lucide, 885 built-in icons
- **Internationalisation: English and Simplified Chinese, switchable at runtime** (Settings → Language). See [i18n](#internationalisation)

## Internationalisation

The UI ships in English and Simplified Chinese.

- **Default on first launch**: follows the operating system language (Chinese systems → Chinese, everything else → English).
- **Switch at runtime**: Settings → Language → *Follow system / 中文 / English*. The change applies immediately, no restart.
- **Persisted** in `localStorage` under `i18n:language`. The stored value is the *mode* (`system` / `zh-CN` / `en-US`), so "follow system" keeps tracking OS changes.
- **The LAN share page** follows the visitor's browser language, since guests do not share the host's preferences.
- **Not translated by design**: user-authored content (API names, document bodies, project names, dynamic-variable descriptions) and backend error strings.

## Changelog

### 1.0 → 1.1 (2026-05)

- 📄 **Response formatting** — JSON responses are pretty-printed in the run view
- 💡 **Field hints** — tooltips on API document field names and descriptions
- 🔄 **Environment parameter system** — global/environment parameter merging, enable toggles, better variable input
- ✨ **Particle effects** — animated backgrounds on the login and project-list pages
- 📎 **File upload** — form-data file upload support
- 🏷️ **Version number** — version shown from Git tags
- 📐 **Run tab layout** — draggable split panes, horizontal overflow fixed
- 🧹 **UI/UX polish** — removed the Auth module from quick request/doc editing, refined project cards

### 1.1 → 1.2 (2026-05)

- 🌐 **Global network proxy** — a new "Network proxy" tab in Settings supporting SOCKS5 and HTTP(S)
- ⚙️ **Config persistence** — proxy config written to `app_data_dir/config/app_config.json` and preserved across updates
- 🏷️ **Proxy indicator** — proxy type tag in RunTab/quick request/result views, hover shows host:port
- 🔗 **Connection test** — test proxy connectivity against a custom URL
- 🎨 **Icon library expansion** — grew to 885 icons in 7 categories

### 1.2 → 1.3 (2026-05)

- 💬 **Structured error messages** — HTTP errors classified into 8 scenarios, with message + fix suggestion + technical detail + one-click retry
- 🔒 **Skip certificate verification** — one-click TLS certificate bypass for HTTPS requests
- 🏷️ **Multi-project tabs** — browser-style switching, context menu, quick-switch dropdown, project-card stats
- 🕐 **Run history** — last 10 runs auto-saved for APIs and quick requests, errors included, details in a drawer
- ⌨️ **Ctrl+S to save** — every save-enabled page supports Ctrl+S / Cmd+S
- 📐 **Layout rework** — user menu moved to the sidebar footer, edit/run contexts visually separated

### 1.3 → 1.4 (2026-06)

- 🎨 **Visual test flow editor** — drag-and-drop canvas, 9 node types, ELK auto-layout, richer edges and branch labels
- 🧠 **MCP server (AI agent integration)** — MCP tools including `get_flow_prompt` for fetching API context and `create_task_with_flow` for creating a test task in one step
- 🔄 **Flow execution engine** — environment selection, live logs, node status highlighting, fail-fast
- ⚡ **Engine completion** — PreScript hooks, While/ForEach loops, conditional waits, sub-flows, persisted execution records
- ✅ **Flow validation / node outline / execution history panel**
- 📂 **Test task folders** — split-pane layout, tasks movable between folders
- 🔀 **RunTab data separation** — runtime edits no longer overwrite the document definition; stored separately with three restore options
- 🤖 **AI prompt generation** — the import dialog offers a complete prompt template (including `$ref` resolution and assertion/extractor formats)

### 1.4 → 1.5 (2026-06 ~ 08)

- 🎨 **Design style system overhaul** — CSS variables + 4 styles across the app + transition animations + three density levels (compact/standard/loose)
- 🔗 **Flow path highlighting** — hover preview + click to lock, two-colour upstream/downstream tracing
- 🛡️ **Mock dependency interception** — automated tests support dependency mocks and single-node debug runs
- 🖥️ **Run tab rebuilt** — improved parameter interaction, body text preserved when switching types, one-click cURL copy, JSONC trailing comments, history parameter restore
- 🌍 **Environments became project-level** — improved environment config UI (base-URL protocol selector, single base URL)
- 📥 **Unified import/export/share entry** — fixed Swagger 2.0 quick export and cURL cookie/body loss
- 📝 **Local drafts** — unsaved changes are saved automatically
- 📄 **MHTML export** — simple styling focused on API content
- ⚡ **Quick request runner rebuilt** — five top-level tabs + send cookies
- 🗂️ **Request body table layout** — required toggle added, columns aligned

### 1.5 → 1.6 (2026-08)

- ⏱️ **Per-request timeout** — configurable per endpoint
- 🔢 **Dynamic variables** — dynamic variables with completion hints and a help dialog
- 🍪 **Automatic cookie handling** — request cookies saved and sent back automatically
- 🖼️ **Binary responses** — preview/save image and other binary responses
- 🔧 **Tab bar and shortcut fixes** — Ctrl+S capture listener, tab close button visibility

### 1.6 → 1.7 (2026-08)

- 🔬 **Dynamic variable engine rewritten** — script engine moved from Rhai to QuickJS, script-only typing, single-point evaluation in Rust, management panel
- 🌐 **LAN document sharing** — read-only guest page + password auth + share-link management (no-password/password links, editing, no manual password entry, random 6-character passwords)
- 📦 **Share service packaging** — resources bundled, smaller Monaco output, trimmed CI assets
- 🔑 **Login/register card switching** — no more full-page navigation, session-duration picker always visible
- 🎨 **Theme system repairs** — global CSS variables follow the theme, dark-theme defaults filled in, skeletons and entry animations
- 📊 **Status bar and tab feedback** — status bar shows environment name/URL and unsaved tab count; tabs show saving spinner, failure icon, unsaved asterisk
- 🧾 **Full request headers** — the exact outgoing headers (including Host/UA/Content-Length), defaults greyed out when not sent
- 🧪 **Test UX improvements** — onboarding guide, arbitrary parallel branches, toolbar restored to the main row, parameter tables fill their columns
- 🤖 **MCP server overhaul** — trimmed tools, unified prompts, fixed parallel-node merge exit labels
- 🐛 **Fixes** — form-data/url-encoded body parameter misalignment, deep-link route fallback, empty-state guidance in the API tree

### 1.7 → 1.8 (2026-09 ~ 11)

- 🌐 **Internationalisation** — English and Simplified Chinese UI, switchable at runtime (Settings → Language), defaults to the operating system language; antd and dayjs locales follow the UI language
- 🤖 **MCP doc-writing tools** — `api-doc.*` tools for creating folders, upserting endpoints, saving schemas and environments; optional auto-start; defaults to loopback-only binding unless LAN access is needed
- 📥 **Apifox native import** — a dedicated importer for Apifox native export files, with transactional and idempotent writes
- 🔄 **OpenAPI import fidelity** — `required` and union types preserved, `x-apifox` extensions restored on export, `allOf` expanded on the doc page
- 🧪 **Rust test runner** — `pnpm test:rust` works around the Windows manifest problem, and imports receive one-shot index deduplication
- 🔍 **Export filtering** — fuzzy search by name / path / method when choosing which endpoints to export
- 🐛 **Fixes** — `file` parameter type preserved from form APIs, Prompt/MCP now include form bodies, batch delete handled as a root set, YAPI push no longer rewrites catalog ownership, history restore no longer leaves parameters at document placeholder values
- 📄 **Bilingual README** — this document plus [`README.zh-CN.md`](README.zh-CN.md)

## Why this project

Tools like Apifox and Postman depend on external services. This project keeps the everyday API-management workflow inside a codebase you can audit, run and modify yourself. Combined with Tauri, it is genuinely local-first, works offline, and carries no data-exfiltration risk — a real concern after the well-known API-tool supply-chain poisoning incidents.

## Tech stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Tauri v2 |
| Frontend | React 18 + React Router v7 + Vite 7 |
| UI | Ant Design 5 + TailwindCSS 3 + Lucide React |
| Editors | Monaco Editor (JSON) + ByteMD (Markdown) |
| Canvas | @xyflow/react (flow charts) + ELK.js (auto-layout) |
| Script engine | QuickJS (dynamic variables / test scripts) |
| Backend | Rust + Axum (YAPI/MCP HTTP services) |
| Database | SQLite (rusqlite, bundled) |
| Internationalisation | i18next + react-i18next |
| Realtime | Yjs CRDT (collaborative documents) |

## Project structure

```text
src/                    Frontend source
  app/                  Page routes
  components/           UI components (ApiTab, JsonSchema, project panels, ...)
  contexts/             React contexts (auth, menu helpers, global)
  features/
    test-flow/          Test flow editor
      components/       Canvas, toolbar, node palette, config drawer, import/run dialogs
      nodes/            Node components (BaseNode, ConditionNode, LoopNode, ...)
      store/            Zustand store (useFlowStore)
      hooks/            Execution engine (useFlowExecution), persistence (useFlowPersistence)
      types/            Flow type definitions
      contexts/         FlowEditorContext, FlowInstanceContext
  hooks/                Global hooks (useApiMenu, useTestTask, ...)
  i18n/                 Internationalisation: resources, detector, storage, antd/dayjs sync
  utils/                Utilities (Markdown/HTML export)

src-tauri/              Rust backend
  src/
    commands/           Tauri commands (auth, projects, menu_items, test_tasks, test_flow, environments)
    db/                 SQLite repositories (auth_repo, project_repo, menu_repo, test_repo, flow_repo)
    services/           Business logic (import parsing, test engine)
    http/               YAPI-compatible HTTP service + MCP server
  Cargo.toml
```

## Getting started

### Requirements

- Node.js `>= 20`
- pnpm `>= 9`
- Rust (stable toolchain)

### Install dependencies

```sh
pnpm install
```

### Run in development

```sh
pnpm tauri:dev
```

### Build

```sh
pnpm tauri:build
```

### Build a portable Windows version

Produces a **copy-and-run** directory: no installation, and data travels with the folder.

```sh
pnpm portable:win
```

The output lands in `dist-portable/ApiMocktle/`:

```
ApiMocktle/
├── ApiMocktle.exe   # Main executable
├── dist/            # Static frontend assets (used by the share page)
└── data/            # Runtime data, created on first launch
```

Copy the whole `ApiMocktle` directory to another Windows machine and double-click `ApiMocktle.exe`.
Everything is written to `data/` next to the executable (database, config, WebView2 `localStorage`),
and is **fully isolated from the installed version**, which never touches `%APPDATA%`.

> The portable build needs a writable directory. Launching from a read-only location such as `Program Files` fails with an error.

Building it requires a cross-compilation toolchain:

```sh
rustup target add x86_64-pc-windows-msvc
cargo install cargo-xwin
```

`cargo-xwin` downloads the MSVC SDK (~1 GB, needs internet) on first run, then works offline.

### Run tests

```sh
pnpm test          # Frontend unit tests (vitest)
pnpm test:rust     # Rust unit tests
```

On Windows, do **not** run `cargo test --lib` directly: cargo's `rustc-link-arg-tests` does not apply to
the lib unit-test target, so the test binary has no embedded manifest and exits with
`STATUS_ENTRYPOINT_NOT_FOUND (0xC0000139)` before `main`. `pnpm test:rust` links the binary and then
embeds `src-tauri/test.manifest` with `mt.exe` before running, which is why it needs the Windows SDK.

## Database

- Default location: `%APPDATA%/com.apimocktle.desktop/runtime/apimocktle.sqlite` (Windows)
- Tables are created automatically on startup
- Portable build: `<exe directory>/data/runtime/apimocktle.sqlite`
- Tables: `users`, `sessions`, `projects`, `project_members`, `menu_items`, `recycle_items`, `meta`,
  `share_links`, `personal_tokens`, `request_history`, `cookie_jar`, `dynamic_variables`,
  `test_folders`, `test_tasks`, `test_flow_graphs`, `test_executions`, `test_steps`, `test_step_results`

## Import / export notes

- Import accepts `.json`, `.yaml`, `.yml`; both OpenAPI 3.x and Swagger 2.0
- Export produces complete OpenAPI 3.0 / Swagger 2.0 documents (paths + definitions/schemas)
- Markdown / MHTML documents and cURL commands are also supported
- Import merges silently; existing resources are never cleared
- Document sharing generates a LAN URL to a read-only page (optionally password-protected)

## Acknowledgements

1. The UI and interaction design reference [Codennnn / Apifox-UI](https://github.com/Codennnn/Apifox-UI). Thanks to the original author for the high-quality UI reproduction and for open-sourcing it; this project adapts, refactors and extends it.
2. [qq201128 / Apifox-Local](https://github.com/qq201128/Apifox-Local) added many features on top of Apifox-UI, which gave me a much stronger base to build on.
3. Thanks to the mimo 100T programme for two hundred million free credits (even if I burned through them in a day 🤣).
4. Thanks to DeepSeek V4 Pro for a price cut during the May holiday: I built the whole project for under ¥100.
