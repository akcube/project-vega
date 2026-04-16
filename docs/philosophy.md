# Vega Philosophy

## Purpose

Vega exists to make agent-driven software engineering understandable and manageable for humans. The product should absorb operational complexity so the user can focus on decisions, review, and progress.

## Principles

### 1. User Journey First

Every feature must serve a clear developer workflow. We do not expose internal machinery unless it helps the user act faster or understand more.

### 2. Opinionated Beats Configurable By Default

There are many ways to use coding agents. Most users should not have to assemble their own workflow from low-level primitives. Vega should provide one coherent path that works well for the common case.

### 3. Simple Interfaces, Deep Implementations

The product should hide replay, ingestion, transcript normalization, worktree association, and provider-specific quirks behind a small set of stable operations. Simplicity at the surface is more important than simplicity in the implementation.

### 4. Human Context Management Is The Product

Most current agent tooling focuses on helping agents manage context. Vega focuses on helping humans manage context across many agents, tasks, and artifacts.

### 5. Monitoring Is A Core Primitive

Vega is not just a chat wrapper. It should help users understand what happened, what changed, what is risky, and what still needs review.

### 6. Review Must Be Native

Diffs, logs, reasoning traces, task notes, and monitor findings should all support review. The product should help a human recover context quickly and reach confident judgments.

### 7. Modularity Is A Product Requirement

We need deep modules with small interfaces. Rust backend modules should own policy and invariants. The frontend should consume stable view models, not raw protocol messages or storage tables.

### 8. The Martyr Principle

We take on hard problems so users do not have to. When a workflow is necessary but surprising, the right move is usually to redesign the abstraction rather than teach users more ceremony.

## Early Product Stance

For v0:

- `Project` is the top-level unit.
- A project can contain repos, docs, and multiple tasks.
- A `Task` always owns one worktree.
- A `Run` always belongs to exactly one task.
- A task opens into a fixed workspace with a constant set of views.
- We do not need a full layout system yet.
