# Vega North Star

## Product Statement

Vega is a workspace-native control plane for coding agents. It helps developers monitor, steer, and review agent work across multiple tasks without losing context.

## The Experience We Are Chasing

A developer opens a project and sees active work, not a blank shell. Each task opens into a workspace with a fixed set of useful views: the main agent lane, review surfaces, diff context, and supporting artifacts. The system remembers enough state to recover quickly after a restart, and it can rehydrate prior work without the user hunting for transcript files or piecing together what happened.

While stronger agents do the work, lighter monitoring logic helps the user notice incomplete tests, suspicious claims, risky edits, and missing follow-through. The product should feel like a fast operational console for parallel software work rather than a collection of isolated chat sessions.

## North Star Outcomes

- Users can manage multiple agent tasks without context collapse.
- Reopening a task is fast and deterministic.
- Review happens inside the workspace, not in external tools glued together by hand.
- Provider-specific details stay hidden behind stable product abstractions.
- The first-party workflow is strong enough that most users do not need custom setup.

## What Vega Is Not

- not just another terminal chat wrapper
- not a generic dashboard with every possible customization surface
- not a thin browser for provider transcript files
- not a workspace manager that leaves review and monitoring as external chores
