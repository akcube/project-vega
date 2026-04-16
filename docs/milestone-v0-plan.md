# Milestone V0 Delivery Plan

Revision: 2026-04-16

## Objective

Ship a locally runnable Tauri app that lets a user:

- create a project
- attach repo/doc resources to that project
- create tasks inside the project
- bind each task to exactly one worktree plus provider/model config
- start an ACP-backed run for a task
- stream agent output into a task workspace
- reopen the task and recover a coherent workspace state from local storage

V0 is complete only when:

- the app runs locally
- unit tests cover the core reducer, storage, and command paths
- build/test commands pass without hand-waving around failures

## Product Scope

### In

- one desktop app under `apps/desktop`
- projects with resources
- tasks with one worktree each
- one current run per task, plus historical runs
- fixed workspace views per task
- live agent stream over ACP
- persisted workspace rehydration
- polished UI with restrained motion and clear operational hierarchy

### Out

- arbitrary pane layout editing
- multi-agent orchestration
- browser and terminal parity with dedicated panes
- advanced monitor intelligence beyond simple placeholders
- provider-native session import beyond stored session/log references

## UX Direction

Using `frontend-skill`, the UI direction for v0 is:

- **Visual thesis:** a dark graphite operations surface with warm mineral highlights and precise green activity signals, designed to feel calm, fast, and alive.
- **Content plan:** project rail, task rail, workspace header, primary work surface, right-side review context.
- **Interaction thesis:** a soft glimmer on active thinking/tool surfaces, smooth tab underline transitions, and subtle fade/slide presence for live state changes.

### Surface Composition

The app should feel like one continuous workspace, not stacked dashboard cards.

- left rail: projects
- second rail: tasks in the selected project
- center: current workspace view
- right rail: review/context sidebar

The first screen is the working surface itself.

### Fixed Task Views

Each task workspace has a constant set of views:

1. `Agent`
2. `Review`
3. `Run`

We persist only `last_open_view` per task. No general layout model in v0.

### Motion

Ship these subtle motions:

- active tab indicator with shared-position animation
- live thinking/tool-call shimmer
- message and diff sections fade in with small vertical motion

Motion must stay restrained and operational, not decorative.

## Simplified Backend Model

### Why this model

Per the current product assumptions:

- `Project` is the top-level unit
- one task belongs to one project
- one task owns one worktree
- one run belongs to one task exactly
- workspace shape is fixed

That means the data model can stay smaller than the earlier generalized version.

### Tables

#### `projects`

- `id`
- `name`
- `description`
- `created_at`

#### `project_resources`

- `id`
- `project_id`
- `kind` (`repo` | `doc`)
- `label`
- `locator`
- `metadata_json`
- `created_at`

#### `tasks`

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

#### `runs`

- `id`
- `task_id`
- `provider`
- `status`
- `provider_session_id`
- `provider_log_path`
- `config_snapshot_json`
- `started_at`
- `ended_at`

#### `task_events`

- `id`
- `task_id`
- `run_id`
- `seq`
- `kind`
- `payload_json`
- `created_at`

#### `workspace_snapshots`

- `task_id`
- `run_id`
- `snapshot_json`
- `updated_at`

## Module Plan

V0 should start with these backend modules under `apps/desktop/src-tauri/src/`.

### `domain.rs`

Stable persistent/domain types only:

- projects
- resources
- tasks
- runs
- enums and value objects

### `events.rs`

Internal normalized session update types only.

### `view_model.rs`

Frontend-facing read models only, such as `TaskWorkspaceViewModel`.

### `store.rs`

Owns:

- SQLite schema creation
- CRUD for projects/resources/tasks/runs
- append/list task events
- load/save workspace snapshots

This module should not know ACP wire details.

### `projection.rs`

Owns:

- transforming normalized updates into workspace state
- rebuilding snapshot state from stored events
- extracting review summaries and run summaries for the UI

This stays pure: event list in, workspace snapshot/read model out.

### `session.rs`

Owns:

- ACP subprocess lifecycle
- `initialize`
- `session/new`
- prompt streaming
- parsing `session/update`
- emitting normalized update events

This should adapt the `conductor-lite` session manager but route everything through the v0 projection/storage path.

### `workspace_service.rs`

Owns the hard invariants for v0:

- one current run per task
- run start/cancel/reopen sequencing
- task event append ordering
- snapshot persistence after updates
- open-task hydration semantics

This is the deep orchestration module for milestone v0.

### `commands.rs`

Owns Tauri command entrypoints only:

- `create_project`
- `list_projects`
- `add_project_resource`
- `create_task`
- `list_tasks`
- `open_task`
- `send_prompt`
- `cancel_run`
- `set_last_open_view`

No business logic beyond request mapping into `workspace_service`.

### `lib.rs`

Owns app assembly and shared state wiring.

## Frontend Plan

### App Shell

The frontend starts with one top-level composition:

- `ProjectRail`
- `TaskRail`
- `WorkspaceShell`
- `ContextSidebar`

### Screen Components

#### `ProjectRail`

Shows:

- project switcher
- create project action
- lightweight project identity

#### `TaskRail`

Shows:

- tasks for selected project
- task status
- provider/model pill
- create task action

#### `WorkspaceShell`

Owns:

- task header
- view tabs
- active view content
- composer when `Agent` view is active

#### `AgentView`

Shows:

- transcript lane
- thinking blocks
- tool call blocks
- inline diff previews
- message composer

#### `ReviewView`

Shows:

- latest diffs
- tool output summaries
- review notes placeholder

#### `RunView`

Shows:

- run metadata
- session/log references
- project resources relevant to the task

#### `ContextSidebar`

Shows:

- task metadata
- worktree path
- project resources
- latest activity summary

## State Flow

### Backend

```text
ACP update
  -> normalize
  -> workspace_service
      -> append task_event
      -> reduce into workspace snapshot
      -> persist snapshot
      -> emit UI update
```

### Frontend

```text
open_task(task_id)
  -> fetch TaskWorkspaceViewModel
  -> render workspace
  -> attach live stream if response marks it active
```

## Test Strategy

V0 must have real unit tests, not only build checks.

### Rust Unit Tests

Add tests for:

1. `projection` reducer
   - text chunks append correctly
   - thinking chunks are grouped correctly
   - tool calls create/update correctly
   - snapshot rebuild from event list matches streamed state

2. `store`
   - schema bootstraps cleanly
   - project/task/run creation persists correctly
   - task events round-trip correctly
   - snapshot save/load round-trips correctly

3. `workspace_service`
   - `open_task` returns persisted state when no live session exists
   - starting a new run updates `current_run_id` coherently
   - cancellation updates run/task state coherently
   - setting `last_open_view` persists

4. integration-style storage + reducer test
   - fake normalized session updates are appended
   - snapshot rebuild after reopen matches streamed state

### Frontend Unit Tests

Add tests for:

1. workspace-state mapping
   - `TaskWorkspaceViewModel` renders the correct default view
   - switching tabs updates the selected view
   - transcript blocks render the right segment types

2. component-level state
   - active task selection changes displayed workspace
   - loading/empty states are correct

### Validation Commands

V0 is not done until these pass:

- `cargo test`
- `pnpm test`
- `pnpm build`
- `cargo check`

If we add a combined root script, that combined script must pass too.

## Delivery Sequence

1. Scaffold `apps/desktop` from `conductor-lite`
2. Rename and trim the app shell to Vega
3. Implement `workspace_service` as the first deep backend abstraction
4. Expand backend schema from tasks-only to project/task/run storage
5. Add normalized event persistence plus snapshot rebuild
6. Rework frontend from task chat to project/task workspace shell
7. Apply the final visual treatment and motion
8. Add unit tests
9. Run all validation commands
10. Launch the local app for manual testing

## Risks To Watch

- ACP parsing copied too literally from the prototype and leaking wire details into other modules
- lifecycle invariants split across store/session/commands instead of owned by `workspace_service`
- frontend store becoming canonical instead of disposable
- over-building workspace chrome before hydrate/reload works
- treating snapshots as authoritative without a rebuild path
- UI visual treatment turning into nested cards or noisy gradients

## Definition Of Done

Milestone v0 is achieved when:

- a user can create/open a project and task
- a user can send a prompt to a task run
- the workspace updates live
- the workspace state survives reopen
- tests pass cleanly
- the app is running locally for manual verification
