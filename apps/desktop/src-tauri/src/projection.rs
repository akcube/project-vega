use crate::events::{PlanEntry, SessionUpdate, ToolContent, WorkspaceEvent};
use crate::view_model::{
    ChatMessage, DiffArtifact, MessageSegment, ReviewSummary, ToolCallState, WorkspaceSnapshot,
};

pub fn rebuild_snapshot(events: &[WorkspaceEvent]) -> WorkspaceSnapshot {
    let mut snapshot = WorkspaceSnapshot::default();
    for event in events {
        apply_workspace_event(&mut snapshot, event);
    }
    snapshot
}

pub fn apply_workspace_event(snapshot: &mut WorkspaceSnapshot, event: &WorkspaceEvent) {
    match event {
        WorkspaceEvent::UserMessage { text } => {
            finalize_current_message(snapshot);
            snapshot.messages.push(ChatMessage {
                id: next_message_id(snapshot),
                role: "user".to_string(),
                segments: vec![MessageSegment::Text { text: text.clone() }],
            });
        }
        WorkspaceEvent::SessionUpdate { update } => apply_session_update(snapshot, update),
    }
}

pub fn build_review_summary(snapshot: &WorkspaceSnapshot) -> ReviewSummary {
    let mut tool_calls = Vec::new();
    let mut diffs = Vec::new();

    for message in snapshot
        .messages
        .iter()
        .chain(snapshot.current_message.iter())
    {
        for segment in &message.segments {
            if let MessageSegment::ToolCall { tool_call } = segment {
                tool_calls.push(tool_call.clone());
                for item in &tool_call.content {
                    if let ToolContent::Diff {
                        path,
                        old_text,
                        new_text,
                    } = item
                    {
                        diffs.push(DiffArtifact {
                            path: path.clone(),
                            old_text: old_text.clone(),
                            new_text: new_text.clone(),
                        });
                    }
                }
            }
        }
    }

    tool_calls.reverse();
    diffs.reverse();

    ReviewSummary { tool_calls, diffs }
}

fn apply_session_update(snapshot: &mut WorkspaceSnapshot, update: &SessionUpdate) {
    match update {
        SessionUpdate::TextChunk { text } => append_text_segment(snapshot, text),
        SessionUpdate::ThinkingChunk { text } => append_thinking_segment(snapshot, text),
        SessionUpdate::ToolCall {
            tool_call_id,
            title,
            kind,
            status,
            content,
        } => {
            ensure_assistant_message(snapshot);
            if let Some(current) = snapshot.current_message.as_mut() {
                current.segments.push(MessageSegment::ToolCall {
                    tool_call: ToolCallState {
                        id: tool_call_id.clone(),
                        title: title.clone(),
                        kind: kind.clone(),
                        status: status.clone(),
                        content: content.clone(),
                    },
                });
            }
        }
        SessionUpdate::ToolCallUpdate {
            tool_call_id,
            status,
            content,
        } => {
            ensure_assistant_message(snapshot);
            if let Some(current) = snapshot.current_message.as_mut() {
                current.segments = current
                    .segments
                    .iter()
                    .map(|segment| match segment {
                        MessageSegment::ToolCall { tool_call } if tool_call.id == *tool_call_id => {
                            MessageSegment::ToolCall {
                                tool_call: ToolCallState {
                                    id: tool_call.id.clone(),
                                    title: tool_call.title.clone(),
                                    kind: tool_call.kind.clone(),
                                    status: if status.is_empty() {
                                        tool_call.status.clone()
                                    } else {
                                        status.clone()
                                    },
                                    content: if content.is_empty() {
                                        tool_call.content.clone()
                                    } else {
                                        content.clone()
                                    },
                                },
                            }
                        }
                        _ => segment.clone(),
                    })
                    .collect();
            }
        }
        SessionUpdate::Plan { entries } => {
            let rendered = render_plan(entries);
            if !rendered.is_empty() {
                append_thinking_segment(snapshot, &rendered);
            }
        }
        SessionUpdate::Done { .. } => finalize_current_message(snapshot),
        SessionUpdate::Error { message } => {
            append_text_segment(snapshot, &format!("Error: {message}"));
            finalize_current_message(snapshot);
        }
    }
}

fn render_plan(entries: &[PlanEntry]) -> String {
    entries
        .iter()
        .map(|entry| format!("[{}] {}", entry.status, entry.content))
        .collect::<Vec<_>>()
        .join("\n")
}

fn append_text_segment(snapshot: &mut WorkspaceSnapshot, text: &str) {
    if text.is_empty() {
        return;
    }

    ensure_assistant_message(snapshot);
    if let Some(current) = snapshot.current_message.as_mut() {
        match current.segments.last_mut() {
            Some(MessageSegment::Text { text: existing }) => existing.push_str(text),
            _ => current.segments.push(MessageSegment::Text {
                text: text.to_string(),
            }),
        }
    }
}

fn append_thinking_segment(snapshot: &mut WorkspaceSnapshot, text: &str) {
    if text.is_empty() {
        return;
    }

    ensure_assistant_message(snapshot);
    if let Some(current) = snapshot.current_message.as_mut() {
        match current.segments.last_mut() {
            Some(MessageSegment::Thinking { text: existing }) => existing.push_str(text),
            _ => current.segments.push(MessageSegment::Thinking {
                text: text.to_string(),
            }),
        }
    }
}

fn ensure_assistant_message(snapshot: &mut WorkspaceSnapshot) {
    if snapshot.current_message.is_none() {
        snapshot.current_message = Some(ChatMessage {
            id: next_message_id(snapshot),
            role: "assistant".to_string(),
            segments: Vec::new(),
        });
    }
}

fn finalize_current_message(snapshot: &mut WorkspaceSnapshot) {
    if let Some(message) = snapshot.current_message.take() {
        if !message.segments.is_empty() {
            snapshot.messages.push(message);
        }
    }
}

fn next_message_id(snapshot: &WorkspaceSnapshot) -> String {
    format!(
        "msg-{}",
        snapshot.messages.len() + usize::from(snapshot.current_message.is_some()) + 1
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::SessionUpdate;

    #[test]
    fn reducer_builds_transcript_from_streaming_updates() {
        let events = vec![
            WorkspaceEvent::UserMessage {
                text: "Investigate the build".to_string(),
            },
            WorkspaceEvent::SessionUpdate {
                update: SessionUpdate::ThinkingChunk {
                    text: "Checking the".to_string(),
                },
            },
            WorkspaceEvent::SessionUpdate {
                update: SessionUpdate::ThinkingChunk {
                    text: " failing path".to_string(),
                },
            },
            WorkspaceEvent::SessionUpdate {
                update: SessionUpdate::TextChunk {
                    text: "I found the issue.".to_string(),
                },
            },
            WorkspaceEvent::SessionUpdate {
                update: SessionUpdate::Done {
                    stop_reason: "end_turn".to_string(),
                },
            },
        ];

        let snapshot = rebuild_snapshot(&events);
        assert_eq!(snapshot.messages.len(), 2);
        assert!(snapshot.current_message.is_none());

        let assistant = snapshot.messages.last().unwrap();
        assert_eq!(assistant.role, "assistant");
        assert_eq!(assistant.segments.len(), 2);
    }

    #[test]
    fn review_summary_collects_latest_tool_calls_and_diffs() {
        let mut snapshot = WorkspaceSnapshot::default();
        apply_workspace_event(
            &mut snapshot,
            &WorkspaceEvent::SessionUpdate {
                update: SessionUpdate::ToolCall {
                    tool_call_id: "call-1".to_string(),
                    title: "Edit app shell".to_string(),
                    kind: "edit".to_string(),
                    status: "completed".to_string(),
                    content: vec![ToolContent::Diff {
                        path: "src/App.tsx".to_string(),
                        old_text: Some("old".to_string()),
                        new_text: "new".to_string(),
                    }],
                },
            },
        );
        apply_workspace_event(
            &mut snapshot,
            &WorkspaceEvent::SessionUpdate {
                update: SessionUpdate::Done {
                    stop_reason: "end_turn".to_string(),
                },
            },
        );

        let review = build_review_summary(&snapshot);
        assert_eq!(review.tool_calls.len(), 1);
        assert_eq!(review.diffs.len(), 1);
        assert_eq!(review.diffs[0].path, "src/App.tsx");
    }
}
