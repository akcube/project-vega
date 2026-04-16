# Vega Implementation Plan

Revision: 2026-04-16

## Goal

Build the first durable foundation for Vega: a Tauri desktop app with a Rust backend and a React frontend that lets a developer create tasks, attach coding-agent runs, reopen them reliably, and review the resulting activity through stable workspace views.

The first milestone is not "all the views." It is one deep abstraction:

- a task can be opened
- its current workspace state can be reconstructed
- a live run can be attached if it exists
- a prior run can be replayed or resumed if needed
- the frontend never needs to know how that reconstruction happened

## Product Constraints

This plan follows these design constraints:

- User-journey oriented: the product takes on complexity so the user does not have to.
- Opinionated: one coherent workflow should cover most users.
- Modular: interfaces stay small; implementations absorb complexity.
- AI-native: transcript, diff, monitor findings, and artifacts must all fit the same workspace model.
- Durable: tasks must survive app restarts and provider/runtime churn.

## Key Architectural Decisions

### 1. Vega keeps its own local product model

ACP/provider session replay is useful, but it is not enough by itself.

Vega will store its own local state for:

- task and project metadata
- project resources such as repos and docs
- task configuration
- run metadata
- worktree association
- monitor findings
- review state
- artifact metadata
- normalized event journal and/or derived snapshots

Provider logs and ACP replay are treated as ingest sources, not the only persistence layer.

### 2. One canonical backend reduction pipeline

All transcript and activity materialization goes through one Rust-owned path:

```text
live ACP stream / ACP session load / provider log import
  -> session ingestion
  -> normalized VegaEvent journal
  -> projection reducer
  -> screen-specific read models
  -> frontend rendering
```

This avoids separate logic for:

- live streaming
- task reopen
- offline hydrate
- provider fallback import

### 3. Frontend reads view models, not backend-shaped DTOs

The UI should not render raw ACP, raw storage tables, or one giant catch-all projection.

The frontend should consume read models such as:

- `WorkspaceView`
- `RunInspectorView`
- `ReviewView`
- `TaskListView`

Each read model exists to support a screen, not to mirror storage.

### 4. Hide task-open logic behind one backend service

The open flow is a policy decision and must not leak into React or Tauri command handlers.

The backend exposes one conceptual operation:

- `open_task(task_id) -> WorkspaceView`

Internally, that service can:

- load local snapshot
- attach to a live runtime
- trigger ACP session replay
- import provider logs
- mark state stale if replay/import is unavailable

The caller should not know which path was taken.

## Module Map

This is the preferred backend decomposition.

### `core`

Owns shared value objects, IDs, statuses, and internal event types.

Examples:

- `TaskId`, `RunId`, `ProjectId`
- `RunStatus`, `TaskStatus`
- `ProviderKind`
- `VegaEvent`

This module should be small and stable.

### `catalog`

Owns task and project identity plus editable task-level configuration.

Owns:

- projects
- project resources
- tasks
- task-owned worktree/config

Minimal interface:

- `create_project(input) -> ProjectId`
- `create_task(project_id, input) -> TaskId`
- `update_task_config(task_id, patch)`
- `load_task_summary(task_id) -> TaskSummary`
- `list_tasks(project_id) -> Vec<TaskSummary>`

Does not own:

- live sessions
- transcript replay
- UI layout
- artifact retrieval

### `runs`

Owns agent run lifecycle and session locator metadata.

Owns:

- run creation
- run completion
- provider session identifiers
- run config snapshots

Minimal interface:

- `start_run(task_id, launch_spec) -> RunId`
- `finish_run(run_id, outcome)`
- `record_session_locator(run_id, locator)`
- `get_current_run(task_id) -> Option<RunRecord>`
- `list_runs(task_id) -> Vec<RunRecord>`

### `sessions`

Owns ACP/provider integration and ingestion.

Owns:

- live ACP client sessions
- provider adapters
- session replay
- provider transcript import
- normalization into `VegaEvent`

Minimal interface:

- `start_live_session(run_id, launch_spec) -> SessionHandle`
- `attach_live(run_id) -> Option<SessionHandle>`
- `replay(run_id) -> ReplayResult`
- `ingest_provider_history(run_id) -> IngestResult`

This module hides provider-specific behavior completely.

### `projection`

Owns the normalized event journal, snapshot materialization, and read-model generation.

Owns:

- append-only normalized events
- reducer logic
- snapshot versioning
- rebuild/hydrate

Minimal interface:

- `append(run_id, event)`
- `rebuild(task_id) -> TaskSnapshot`
- `hydrate(task_id) -> Option<TaskSnapshot>`
- `workspace_view(task_id) -> WorkspaceView`
- `run_view(run_id) -> RunInspectorView`
- `review_view(task_id) -> ReviewView`

This module is the canonical local materialization layer.

### `artifacts`

Owns artifact indexing and retrieval.

Owns:

- diff metadata
- file references
- terminal capture references
- browser artifacts
- monitor reports

Minimal interface:

- `record_artifact(run_id, artifact_meta) -> ArtifactId`
- `list_artifacts(task_id) -> Vec<ArtifactSummary>`
- `get_artifact(artifact_id) -> ArtifactDetail`

Artifacts are not the same thing as transcript events.

### `integrations`

Owns reusable agent capabilities and registry state.

Owns:

- agent profiles
- MCP server definitions
- skill definitions
- validation of launch capability sets

Minimal interface:

- `register_agent_profile(spec) -> AgentProfileId`
- `register_mcp_server(spec) -> McpServerId`
- `register_skill(spec) -> SkillId`
- `resolve_launch_spec(task_id) -> LaunchSpec`

### `workspace`

Owns task-open orchestration and runtime attachment policy.

This is the module that hides temporal decomposition.

Minimal interface:

- `open_task(task_id) -> WorkspaceView`
- `refresh_task(task_id) -> WorkspaceView`
- `start_task_run(task_id) -> WorkspaceView`
- `stop_task_run(task_id)`

Internally it may consult `catalog`, `runs`, `sessions`, `projection`, and `artifacts`.

### `storage`

Owns persistence details only.

Owns:

- SQLite schema
- migrations
- repository implementations

It should not contain policy.

## Storage Contract

The earlier plan left local event storage too vague. This is now explicit.

### Canonical local state

Vega's backend database is canonical for product state and local materialization.

That includes:

- task/project/config records
- project resource records
- run records and config snapshots
- worktree metadata
- normalized event journal
- derived snapshots
- artifact metadata
- monitor findings

### External state

Provider logs, provider session IDs, and ACP replay are external sources.

They are used to:

- resume live work
- rebuild missing local journal state
- verify or enrich local history
- recover when the app was closed during a run

They are not the only truth source the product depends on.

### Raw transcript retention

For milestone one, do not store full raw provider transcripts by default.

Instead:

- store normalized `VegaEvent` records
- store provider session locators and import metadata
- store raw transcript/log references as optional retained artifacts

This keeps the local model provider-agnostic and reduces coupling to raw vendor formats.

## Minimal Data Model

The first schema should support these concepts.

### `projects`

- `id`
- `name`
- `description`
- `created_at`

### `project_resources`

- `id`
- `project_id`
- `kind`
- `label`
- `locator`
- `metadata_json`
- `created_at`

### `tasks`

- `id`
- `project_id`
- `title`
- `status`
- `worktree_path`
- `provider`
- `model`
- `permission_policy`
- `mcp_subset_json`
- `skill_subset_json`
- `current_run_id`
- `last_open_view`
- `created_at`
- `updated_at`

### `runs`

- `id`
- `task_id`
- `provider`
- `status`
- `provider_session_id`
- `provider_log_path`
- `session_locator_json`
- `config_snapshot_json`
- `started_at`
- `ended_at`

### `vega_events`

- `id`
- `task_id`
- `run_id`
- `seq`
- `kind`
- `payload_json`
- `source_kind`
- `source_ref_json`
- `created_at`

### `snapshots`

- `task_id`
- `run_id`
- `last_seq`
- `workspace_snapshot_json`
- `updated_at`

### `artifacts`

- `id`
- `task_id`
- `run_id`
- `kind`
- `locator_json`
- `metadata_json`
- `created_at`

## Frontend State Model

The frontend store is disposable.

It owns:

- selected task
- active panel/view
- optimistic form state
- stream attachment state
- transient UI interaction state

It does not own the canonical transcript or task history.

## Reload Semantics

When a user clicks an existing task:

1. React calls `open_task(task_id)`.
2. The backend loads the latest local snapshot and task/run metadata.
3. If a live runtime exists, it attaches the stream.
4. If local state is missing or stale, the backend may trigger replay/import internally.
5. The backend returns a `WorkspaceView`.
6. React renders it without caring where the state came from.

This gives one simple interface and keeps replay logic hidden.

## Screen Read Models

The UI should start with a small set of purposeful views.

### `TaskListView`

- projects
- task summaries
- task status
- current run badge

### `WorkspaceView`

- task header
- current run summary
- fixed workspace views/tabs
- transcript lanes
- current artifacts rail
- monitor findings summary

### `RunInspectorView`

- run metadata
- config snapshot
- event timeline summary
- replay/import status

### `ReviewView`

- diffs
- code comments
- test status
- review findings

## Initial Repo Shape

```text
project-vega/
  docs/
    implementation-plan.md
  apps/
    desktop/
      src/
      src-tauri/
  crates/
    core/
    catalog/
    runs/
    sessions/
    projection/
    artifacts/
    integrations/
    workspace/
    storage/
```

For the first milestone, these can begin as modules under `apps/desktop/src-tauri/src/` and only later be extracted into crates if the boundaries hold.

## Milestone 1

Build a thin but real harness:

- create/open a project
- create a task
- attach task config to provider/model/worktree
- start a run through ACP
- normalize session updates into `VegaEvent`
- persist events and snapshot state locally
- reopen task after restart
- render `WorkspaceView`

Out of scope for milestone one:

- full multi-pane browser/terminal/editor stack
- multi-agent coordination
- advanced monitor intelligence
- final diff replay theater

## First Implementation Steps

1. Scaffold `apps/desktop` from the reference Tauri + React + shadcn setup.
2. Build Rust modules for `catalog`, `runs`, `sessions`, `projection`, and `workspace`.
3. Implement SQLite migrations for the minimal schema above.
4. Port ACP streaming from the reference app into `sessions`.
5. Replace frontend-owned transcript state with backend-owned event journal plus snapshot hydrate.
6. Expose only these initial commands:
   - `create_project`
   - `list_tasks`
   - `create_task`
   - `open_task`
   - `start_task_run`
   - `send_prompt`
   - `cancel_run`
7. Build the first `WorkspaceView` UI using shadcn.
8. Add snapshot rebuild tests and ACP normalization tests.

## Modular Design Checks

We should reject designs that show these red flags:

- React decides whether to attach live, replay, or import.
- one giant `TaskProjection` DTO mirrors storage tables
- provider-specific replay logic leaks outside `sessions`
- `storage` contains business rules
- `catalog` knows about transcript/event parsing
- event cache is treated as ad hoc optional state with no rebuild contract

## Final Direction

The correct simplification is not "store nothing locally and just reload from ACP."

The correct simplification is:

- one local product model
- one reduction pipeline
- one task-open abstraction
- several small screen-specific read models
- provider replay/import hidden behind the session layer

That keeps the user-facing workflow simple while pulling the operational complexity down into a few deep backend modules.
