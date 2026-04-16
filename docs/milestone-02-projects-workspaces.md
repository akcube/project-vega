# Milestone 02: Project Boards And Active Workspaces

Revision: 2026-04-16

## Goal

Reshape Vega around the user's actual control loop:

- projects are planned and managed in a board view
- tasks live in kanban workflow states
- tasks open into active workspaces
- workspaces host agent, terminal, and review views
- reopening a task reuses its existing session when possible
- task worktrees are created by Vega from project source repositories

This milestone is complete when the product no longer feels like a single chat surface with sidebars. It must instead feel like two coherent operating modes:

- `Projects`
- `Active Workspaces`

## Product Decisions

### 1. Projects collect source repos up front

A project must be created with at least one git repository source.

Projects may contain multiple repositories. The frontend may fake drag/drop intake initially, but the backend must persist real project repository records and validate repository paths before project creation succeeds.

### 2. Tasks are repo-bound and Vega creates the worktree

Task creation must never ask the user for a free-form worktree path.

Instead:

- if the project has one repo, Vega auto-selects it
- if the project has multiple repos, the user must select one
- Vega derives branch name, worktree name, and worktree path
- Vega creates the worktree through the git backend service

### 3. Workflow state is different from runtime state

Task kanban state and agent execution state must be modeled separately.

Task workflow state:

- `todo`
- `in_progress`
- `blocked`
- `completed`

Run/session state stays technical and is used only for runtime control and diagnostics.

### 4. Workspaces are first-class

An active workspace is not the same thing as a task and not the same thing as a run.

Each open workspace owns:

- the task it is showing
- its order in the workspace strip
- its selected view (`agent`, `terminal`, `review`)

### 5. Reopening a task must not silently start a new run

Opening a task should:

- reuse the in-memory session if present
- otherwise load the provider session if `provider_session_id` exists and the provider supports `loadSession`
- only create a new run when the user explicitly starts one

### 6. Transcript history is task-scoped

Conversation history must be rebuilt across all runs for a task, not only the current run.

Run boundaries still matter for metadata, but they must not cause early task history to disappear from the rendered transcript.

## UX Shape

## Projects Mode

Layout:

- top nav with `Projects` selected
- left project sidebar
- center project board

Board:

- header with project name, brief, and actions
- columns: `Todo`, `In Progress`, `Blocked`, `Completed`
- cards show title, source repo, provider/model, and quick actions

Project creation:

- full intake sheet, not a tiny modal
- required: `name`, `brief`, `basic plan`
- drag/drop area for repositories and docs
- repository sources displayed immediately as attached items

Task creation:

- title
- provider
- model
- repo picker only when needed
- no raw worktree path input

## Active Workspaces Mode

Layout:

- top nav with `Active Workspaces` selected
- workspace strip below nav
- active workspace body

Workspace body:

- left vertical view rail: `Agent`, `Terminal`, `Review`
- center active pane
- right task inspector

The separate run pane is removed. Run and session metadata move into the task inspector.

## Theming

Use a One Dark style direction:

- dark graphite base
- cool gray surfaces
- restrained green accent for live or selected state
- minimal gradients
- thin separators
- strong typography

Avoid card soup. Repeated task cards inside the board are fine, but panels should read as layout regions first.

## Backend Architecture

This milestone should move the current backend toward these boundaries.

### `catalog_service`

Owns:

- project creation and deletion
- project repositories and docs
- task creation and deletion
- task workflow state transitions

### `workspace_registry`

Owns:

- opening a task into the workspace strip
- closing a workspace
- selecting a workspace
- persisting selected workspace view

### `session_runtime`

Owns:

- ACP initialization
- provider capability inspection
- session creation
- session loading or resume
- prompt dispatch
- cancellation

### `projection`

Owns:

- normalized task events
- task-scoped transcript rebuild
- workspace read models
- project board read models

### `terminal_service`

Owns:

- PTY creation
- PTY resize
- PTY input and output streams

### `storage`

Owns persistence only.

## Persistence Changes

Add real migrations. Do not rely only on `CREATE TABLE IF NOT EXISTS`.

Schema additions and changes:

- `projects`
  - add `brief`
  - add `plan_markdown`
  - add lifecycle/deletion fields as needed
- `project_repositories`
  - one row per repo source
- `project_documents`
  - optional docs and supplemental resources
- `tasks`
  - replace current workflow-unsafe `status` with `workflow_state`
  - add `source_repo_id`
  - add `branch_name`
  - add `worktree_name`
  - keep `worktree_path`, but Vega owns it
- `active_workspaces`
  - `task_id`, `selected_view`, `strip_order`, `last_focused_at`
- `task_events`
  - support task-scoped ordering across runs

## Git Integration

Use the existing git backend service for worktree creation.

Task creation should:

1. resolve the source repo
2. derive branch/worktree names
3. compute a worktree path
4. call `vega_git::GitService::create_worktree`
5. persist the created worktree handle onto the task

## Session Reload Strategy

At workspace open time:

1. load task-scoped transcript from local projection
2. do not create a new run automatically
3. if a live session exists, attach to it
4. else if `provider_session_id` exists and the provider supports `loadSession`, load it
5. else leave the task reopenable but idle until the user explicitly starts a new run

## Testing Requirements

Backend:

- migrations from the prior v0 schema
- project creation fails without a repo
- single-repo project auto-selects source repo for task creation
- multi-repo project requires repo selection
- task creation creates a worktree and persists derived values
- project deletion cascades only Vega-local records
- task deletion closes active workspaces
- reopening a task does not create a new run
- task transcript rebuild preserves history across runs

Frontend:

- top-level nav switches modes
- project intake captures dropped resources
- board renders columns by workflow state
- task creation auto-selects sole repo
- task creation requires repo selection when multiple repos exist
- workspace strip open/close/select behavior
- vertical workspace tabs switch panes correctly

## Rollout Order

1. Add milestone doc and lock the product contract.
2. Add schema migrations and domain changes.
3. Replace repo-as-generic-resource with first-class project repositories.
4. Replace raw task worktree input with repo-driven task creation.
5. Build `Projects` mode and kanban interactions.
6. Build `Active Workspaces` mode and remove the run pane.
7. Fix ACP session reload and task-scoped transcript rebuild.
8. Add terminal pane and PTY plumbing.
9. Run focused tests and launch the app locally.
