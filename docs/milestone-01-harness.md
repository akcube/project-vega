# Milestone 01: Harness

## Goal

Build the first real vertical slice of Vega:

- create a project
- create a task inside that project
- bind the task to a worktree and agent config
- start a run through ACP
- stream and normalize session updates
- reopen the task and recover workspace state

## Scope

### In

- Tauri desktop scaffold
- React workspace shell
- Rust backend state and session control
- SQLite persistence
- ACP live session integration
- task reopen path
- basic review-oriented transcript and activity rendering

### Out

- full pane rearrangement
- multi-agent orchestration
- advanced monitor intelligence
- browser and terminal view parity
- production-ready diff replay

## Acceptance Criteria

1. A user can create a project and attach at least one repo or doc resource.
2. A user can create a task under that project with a worktree and provider/model selection.
3. Starting a run creates durable run metadata.
4. Streaming ACP updates are normalized before rendering.
5. Reopening a task after app restart restores a coherent workspace state.
6. The frontend renders screen-specific view models rather than raw ACP payloads.

## First Implementation Steps

1. Scaffold `apps/desktop`.
2. Port the working ACP bridge ideas from `conductor-lite` into a dedicated session layer.
3. Replace frontend-only transcript state with backend-owned hydration.
4. Implement the minimal schema for projects, project resources, tasks, runs, snapshots, and optional normalized events.
5. Build `open_task(task_id)` as the first deep backend abstraction.
