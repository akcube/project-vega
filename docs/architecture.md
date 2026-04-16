# Architecture

## System Shape

Vega starts as a Tauri desktop application with:

- a React frontend for workspace views
- a Rust backend for state, session control, ingestion, and persistence
- ACP as the main integration protocol for live runs and session replay

## Core Domain Units

### Project

The top-level container. A project can own one or more repositories plus shared design docs or related resources.

### Task

A unit of work inside a project. For v0, each task always owns exactly one worktree and opens into one fixed workspace.

### Run

A single agent execution associated with exactly one task. A task may have multiple historical runs, but only one current run.

### Workspace

The user-facing surface for a task. The workspace has a fixed number of views in v0 and does not need general layout persistence yet.

## Backend Boundaries

### `catalog`

Owns projects, project resources, tasks, and task-owned config.

### `runs`

Owns run lifecycle, config snapshots, and provider session locators.

### `sessions`

Owns ACP connections, replay, provider import, and normalization into Vega events.

### `projection`

Owns the reduction pipeline from normalized events into workspace snapshots and screen read models.

In practical terms, this is the code that turns protocol/history updates into the hydrated task state the UI actually renders.

### `workspace`

Owns `open_task(task_id)` and hides whether the task was hydrated from a local snapshot, a live session, ACP replay, or provider log import.

### `storage`

Owns SQLite and migrations only.

## Data Flow

```text
live ACP updates / ACP session load / provider log import
  -> sessions
  -> normalized VegaEvent
  -> projection
  -> workspace snapshot and screen read models
  -> frontend
```

The frontend should never need to know which source produced the hydrated task state.

## Why Projects Stay

Projects are worth keeping from day one because they own shared context above tasks:

- multiple repos
- design docs
- later: repo-level defaults, code maps, and cross-task views

## Why Layout State Waits

V0 has a fixed workspace shape with a constant set of views. That means a separate layout subsystem would be shallow. The only state we may remember initially is something small like `last_open_view`.

## Initial Repo Structure

```text
apps/
  desktop/
    src/
      app/
      features/
      components/ui/
      lib/
      stores/
    src-tauri/
      src/
      tests/

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

The crates directory reflects planned backend seams. In milestone one, these can still begin as modules under `apps/desktop/src-tauri/src/`.
