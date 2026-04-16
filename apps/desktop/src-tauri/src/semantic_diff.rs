use std::collections::BTreeSet;
use std::env;

use anyhow::{Context, Result, anyhow};
use reqwest::Client;
use schemars::JsonSchema;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::OnceCell;
use tokio::time::{Duration, timeout};
use vega_git::{
    CommitReplayFile, CommitReplayHunk, CommitReplayResult, ReplayFileStatus, ReplayLineKind,
    SemanticHunk, SemanticHunkKind,
};

static SEMANTIC_DIFF_RUNTIME: OnceCell<std::result::Result<SemanticDiffRuntime, String>> =
    OnceCell::const_new();

const DEFAULT_SEMANTIC_DIFF_FILE_TIMEOUT_SECS: u64 = 45;
const DEFAULT_SEMANTIC_DIFF_MODEL: &str = "gpt-4o";
const DEFAULT_OPENAI_ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";

#[derive(Clone)]
struct SemanticDiffRuntime {
    client: Client,
    api_key: String,
    endpoint: String,
    model: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
struct SemanticRawHunkInput {
    index: i32,
    header: String,
    patch: String,
    old_start: u32,
    old_lines: u32,
    new_start: u32,
    new_lines: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
struct SemanticFileInput {
    path: String,
    status: String,
    raw_hunks: Vec<SemanticRawHunkInput>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
struct AnnotatedLogicalHunkPlan {
    title: Option<String>,
    summary: Option<String>,
    rationale: Option<String>,
    #[serde(default)]
    review_notes: Vec<String>,
    confidence: Option<f64>,
    #[serde(default)]
    is_trivial: bool,
    #[serde(default)]
    raw_hunk_indexes: Vec<i32>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
struct SemanticAnnotationResponse {
    logical_hunks: Vec<AnnotatedLogicalHunkPlan>,
}

#[derive(Clone, Debug)]
struct SanitizedLogicalHunkPlan {
    title: String,
    summary: Option<String>,
    rationale: Option<String>,
    review_notes: Vec<String>,
    confidence: Option<f64>,
    is_trivial: bool,
    raw_hunk_indexes: Vec<usize>,
}

#[derive(Debug, Deserialize)]
struct OpenAiChatCompletionResponse {
    choices: Vec<OpenAiChoice>,
}

#[derive(Debug, Deserialize)]
struct OpenAiChoice {
    message: OpenAiMessage,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAiMessage {
    content: Option<String>,
    refusal: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAiErrorEnvelope {
    error: OpenAiError,
}

#[derive(Debug, Deserialize)]
struct OpenAiError {
    message: String,
}

pub async fn annotate_commit_replay(mut replay: CommitReplayResult) -> CommitReplayResult {
    let runtime_state = ensure_runtime().await.map_err(|error| error.to_string());
    let file_timeout_secs = semantic_diff_file_timeout_secs();

    for file in &mut replay.files {
        if file.is_binary || file.hunks.is_empty() {
            file.semantic_hunks.clear();
            continue;
        }

        file.semantic_hunks = match &runtime_state {
            Ok(runtime) => {
                match timeout(
                    Duration::from_secs(file_timeout_secs),
                    annotate_file(runtime, file),
                )
                .await
                {
                    Ok(Ok(semantic_hunks)) if !semantic_hunks.is_empty() => semantic_hunks,
                    Ok(Ok(_)) => build_fallback_semantic_hunks(file),
                    Ok(Err(error)) => {
                        eprintln!(
                            "[semantic-diff] failed to annotate {}: {error}",
                            display_path(file)
                        );
                        build_fallback_semantic_hunks(file)
                    }
                    Err(_) => {
                        eprintln!(
                            "[semantic-diff] timed out after {}s for {}",
                            file_timeout_secs,
                            display_path(file)
                        );
                        build_fallback_semantic_hunks(file)
                    }
                }
            }
            Err(error) => {
                eprintln!(
                    "[semantic-diff] runtime unavailable for {}: {error}",
                    display_path(file)
                );
                build_fallback_semantic_hunks(file)
            }
        };
    }

    replay
}

fn semantic_diff_file_timeout_secs() -> u64 {
    env::var("VEGA_SEMANTIC_DIFF_FILE_TIMEOUT_SECS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_SEMANTIC_DIFF_FILE_TIMEOUT_SECS)
}

async fn annotate_file(
    runtime: &SemanticDiffRuntime,
    file: &CommitReplayFile,
) -> Result<Vec<SemanticHunk>> {
    let response = request_semantic_annotation(runtime, &build_semantic_file_input(file)).await?;
    let logical_plans = sanitize_grouping_plans(response.logical_hunks, file);
    if logical_plans.is_empty() {
        eprintln!(
            "[semantic-diff] model returned no usable logical hunks for {}",
            display_path(file)
        );
        return Ok(build_fallback_semantic_hunks(file));
    }

    let mut covered_hunks = BTreeSet::new();
    let mut semantic_hunks = Vec::new();

    for (index, plan) in logical_plans.iter().enumerate() {
        covered_hunks.extend(plan.raw_hunk_indexes.iter().copied());

        semantic_hunks.push(build_semantic_hunk(
            file,
            index,
            plan.raw_hunk_indexes.clone(),
            if plan.is_trivial {
                SemanticHunkKind::Trivial
            } else {
                SemanticHunkKind::Annotated
            },
            plan.title.clone(),
            plan.summary
                .clone()
                .or_else(|| fallback_hunk_summary(file, &plan.raw_hunk_indexes)),
            plan.rationale.clone(),
            plan.review_notes.clone(),
            plan.confidence,
        ));
    }

    for raw_hunk_index in 0..file.hunks.len() {
        if covered_hunks.contains(&raw_hunk_index) {
            continue;
        }

        semantic_hunks.push(build_semantic_hunk(
            file,
            semantic_hunks.len(),
            vec![raw_hunk_index],
            SemanticHunkKind::Unavailable,
            fallback_hunk_title(file, &[raw_hunk_index]),
            fallback_hunk_summary(file, &[raw_hunk_index]),
            None,
            Vec::new(),
            None,
        ));
    }

    semantic_hunks.sort_by_key(|hunk| {
        (
            hunk.new_start.or(hunk.old_start).unwrap_or(u32::MAX),
            hunk.raw_hunk_indexes.first().copied().unwrap_or(usize::MAX),
        )
    });

    Ok(semantic_hunks)
}

async fn request_semantic_annotation(
    runtime: &SemanticDiffRuntime,
    file: &SemanticFileInput,
) -> Result<SemanticAnnotationResponse> {
    let schema = semantic_annotation_response_schema();
    let file_json = serde_json::to_string_pretty(file)
        .map_err(|error| anyhow!("failed to serialize semantic diff input: {error}"))?;

    let system_prompt = concat!(
        "You are annotating git diffs for code review.\n",
        "Return only valid JSON that matches the requested schema.\n",
        "Do not add markdown fences or commentary.\n",
        "Group raw diff hunks into logical review hunks.\n",
        "Prefer one logical hunk per distinct behavior change, refactor, or bug fix.\n",
        "Mark style-only, rename-only, import-only, or obviously mechanical updates as trivial.\n",
        "Every raw_hunk_indexes entry must refer to indexes from the provided file and should not overlap between logical hunks.\n",
        "It is acceptable to omit trivial hunks entirely.\n",
        "Ground the summary and rationale in the diff; leave rationale null when the reason is unclear."
    );

    let user_prompt = format!(
        "Return a JSON object that matches this schema exactly:\n{}\n\nFile diff input:\n{}",
        serde_json::to_string_pretty(&schema)
            .map_err(|error| anyhow!("failed to pretty print semantic diff schema: {error}"))?,
        file_json
    );

    let payload = json!({
        "model": runtime.model,
        "temperature": 0.1,
        "max_tokens": 1400,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "semantic_diff_annotation",
                "strict": true,
                "schema": schema
            }
        },
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_prompt }
        ]
    });

    let response = runtime
        .client
        .post(&runtime.endpoint)
        .bearer_auth(&runtime.api_key)
        .json(&payload)
        .send()
        .await
        .context("semantic diff API request failed")?;

    let status = response.status();
    let body = response
        .text()
        .await
        .context("failed to read semantic diff API response body")?;

    if !status.is_success() {
        if let Ok(error) = serde_json::from_str::<OpenAiErrorEnvelope>(&body) {
            return Err(anyhow!(
                "semantic diff API error {}: {}",
                status,
                error.error.message
            ));
        }

        return Err(anyhow!("semantic diff API error {}: {}", status, body));
    }

    let completion: OpenAiChatCompletionResponse = serde_json::from_str(&body)
        .map_err(|error| anyhow!("failed to parse semantic diff API response: {error}"))?;
    let choice = completion
        .choices
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("semantic diff API returned no choices"))?;

    if let Some(finish_reason) = choice.finish_reason.as_deref()
        && finish_reason == "length"
    {
        eprintln!(
            "[semantic-diff] response hit max_tokens for {}",
            file.path
        );
    }

    if let Some(refusal) = choice.message.refusal.and_then(non_empty) {
        return Err(anyhow!("semantic diff model refused: {refusal}"));
    }

    let content = choice
        .message
        .content
        .and_then(non_empty)
        .ok_or_else(|| anyhow!("semantic diff model returned empty content"))?;

    parse_json_response::<SemanticAnnotationResponse>(&content)
}

fn semantic_annotation_response_schema() -> serde_json::Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "logical_hunks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                        "title": { "type": ["string", "null"] },
                        "summary": { "type": ["string", "null"] },
                        "rationale": { "type": ["string", "null"] },
                        "review_notes": {
                            "type": "array",
                            "items": { "type": "string" }
                        },
                        "confidence": { "type": ["number", "null"] },
                        "is_trivial": { "type": "boolean" },
                        "raw_hunk_indexes": {
                            "type": "array",
                            "items": { "type": "integer" }
                        }
                    },
                    "required": [
                        "title",
                        "summary",
                        "rationale",
                        "review_notes",
                        "confidence",
                        "is_trivial",
                        "raw_hunk_indexes"
                    ]
                }
            }
        },
        "required": ["logical_hunks"]
    })
}

fn parse_json_response<T>(text: &str) -> Result<T>
where
    T: DeserializeOwned,
{
    if let Ok(parsed) = serde_json::from_str(text) {
        return Ok(parsed);
    }

    if let Some(block) = extract_json_block(text) {
        return serde_json::from_str(&block)
            .map_err(|error| anyhow!("invalid JSON response from semantic diff model: {error}"));
    }

    eprintln!(
        "[semantic-diff] raw model response was not parseable JSON: {}",
        text.chars().take(600).collect::<String>()
    );
    Err(anyhow!("semantic diff model returned no parseable JSON"))
}

fn extract_json_block(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(stripped) = trimmed.strip_prefix("```json") {
        let inner = stripped.strip_suffix("```").unwrap_or(stripped);
        let inner = inner.trim();
        if !inner.is_empty() {
            return Some(inner.to_string());
        }
    }

    if let Some(stripped) = trimmed.strip_prefix("```") {
        let inner = stripped.strip_suffix("```").unwrap_or(stripped);
        let inner = inner.trim();
        if !inner.is_empty() {
            return Some(inner.to_string());
        }
    }

    let object_start = trimmed.find('{');
    let object_end = trimmed.rfind('}');
    if let (Some(start), Some(end)) = (object_start, object_end)
        && start < end
    {
        return Some(trimmed[start..=end].to_string());
    }

    None
}

async fn ensure_runtime() -> Result<SemanticDiffRuntime> {
    match SEMANTIC_DIFF_RUNTIME.get_or_init(init_runtime).await {
        Ok(runtime) => Ok(runtime.clone()),
        Err(error) => Err(anyhow!(error.clone())),
    }
}

async fn init_runtime() -> std::result::Result<SemanticDiffRuntime, String> {
    let api_key = load_openai_api_key().ok_or_else(|| {
        "OPENAI_API_KEY not set and ~/openai.key not available".to_string()
    })?;
    let endpoint = env::var("VEGA_SEMANTIC_DIFF_ENDPOINT")
        .unwrap_or_else(|_| DEFAULT_OPENAI_ENDPOINT.to_string());
    let model = env::var("VEGA_SEMANTIC_DIFF_MODEL")
        .unwrap_or_else(|_| DEFAULT_SEMANTIC_DIFF_MODEL.to_string());

    eprintln!("[semantic-diff] runtime using direct model {model}");

    let client = Client::builder()
        .build()
        .map_err(|error| format!("failed to build semantic diff HTTP client: {error}"))?;

    Ok(SemanticDiffRuntime {
        client,
        api_key,
        endpoint,
        model,
    })
}

fn load_openai_api_key() -> Option<String> {
    env::var("OPENAI_API_KEY")
        .ok()
        .and_then(non_empty)
        .or_else(|| {
            let home = env::var("HOME").ok()?;
            let key_path = format!("{home}/openai.key");
            std::fs::read_to_string(key_path).ok().and_then(non_empty)
        })
}

fn build_semantic_file_input(file: &CommitReplayFile) -> SemanticFileInput {
    SemanticFileInput {
        path: display_path(file),
        status: replay_status_label(file.status).to_string(),
        raw_hunks: file
            .hunks
            .iter()
            .enumerate()
            .map(|(index, hunk)| SemanticRawHunkInput {
                index: index as i32,
                header: hunk.header.clone(),
                patch: render_patch(hunk),
                old_start: hunk.old_start,
                old_lines: hunk.old_lines,
                new_start: hunk.new_start,
                new_lines: hunk.new_lines,
            })
            .collect(),
    }
}

fn sanitize_grouping_plans(
    plans: Vec<AnnotatedLogicalHunkPlan>,
    file: &CommitReplayFile,
) -> Vec<SanitizedLogicalHunkPlan> {
    let mut used_indexes = BTreeSet::new();
    let mut sanitized = Vec::new();

    for plan in plans {
        let mut raw_hunk_indexes = BTreeSet::new();
        for raw_index in plan.raw_hunk_indexes {
            let Ok(index) = usize::try_from(raw_index) else {
                continue;
            };
            if index >= file.hunks.len() || used_indexes.contains(&index) {
                continue;
            }
            raw_hunk_indexes.insert(index);
        }

        if raw_hunk_indexes.is_empty() {
            continue;
        }

        let raw_hunk_indexes = raw_hunk_indexes.into_iter().collect::<Vec<_>>();
        used_indexes.extend(raw_hunk_indexes.iter().copied());

        sanitized.push(SanitizedLogicalHunkPlan {
            title: plan
                .title
                .and_then(non_empty)
                .unwrap_or_else(|| fallback_hunk_title(file, &raw_hunk_indexes)),
            summary: plan.summary.and_then(non_empty),
            rationale: plan.rationale.and_then(non_empty),
            review_notes: plan
                .review_notes
                .into_iter()
                .filter_map(non_empty)
                .take(4)
                .collect(),
            confidence: plan.confidence.map(|value| value.clamp(0.0, 1.0)),
            is_trivial: plan.is_trivial,
            raw_hunk_indexes,
        });
    }

    sanitized
}

fn build_fallback_semantic_hunks(file: &CommitReplayFile) -> Vec<SemanticHunk> {
    file.hunks
        .iter()
        .enumerate()
        .map(|(index, _)| {
            build_semantic_hunk(
                file,
                index,
                vec![index],
                SemanticHunkKind::Unavailable,
                fallback_hunk_title(file, &[index]),
                fallback_hunk_summary(file, &[index]),
                None,
                Vec::new(),
                None,
            )
        })
        .collect()
}

fn build_semantic_hunk(
    file: &CommitReplayFile,
    index: usize,
    raw_hunk_indexes: Vec<usize>,
    kind: SemanticHunkKind,
    title: String,
    summary: Option<String>,
    rationale: Option<String>,
    review_notes: Vec<String>,
    confidence: Option<f64>,
) -> SemanticHunk {
    let (old_start, old_end, new_start, new_end) = aggregate_ranges(file, &raw_hunk_indexes);

    SemanticHunk {
        id: format!("semantic-{}-{index}", display_path(file)),
        title,
        summary,
        rationale,
        review_notes,
        confidence,
        kind,
        raw_hunk_indexes,
        old_start,
        old_end,
        new_start,
        new_end,
    }
}

fn aggregate_ranges(
    file: &CommitReplayFile,
    raw_hunk_indexes: &[usize],
) -> (Option<u32>, Option<u32>, Option<u32>, Option<u32>) {
    let referenced = raw_hunk_indexes
        .iter()
        .filter_map(|index| file.hunks.get(*index));

    let mut old_start = None;
    let mut old_end = None;
    let mut new_start = None;
    let mut new_end = None;

    for hunk in referenced {
        old_start = min_option(old_start, hunk.old_start);
        old_end = max_option(old_end, inclusive_end(hunk.old_start, hunk.old_lines));
        new_start = min_option(new_start, hunk.new_start);
        new_end = max_option(new_end, inclusive_end(hunk.new_start, hunk.new_lines));
    }

    (old_start, old_end, new_start, new_end)
}

fn render_patch(hunk: &CommitReplayHunk) -> String {
    let mut patch = String::new();
    if !hunk.header.is_empty() {
        patch.push_str(&hunk.header);
        patch.push('\n');
    }

    for line in &hunk.lines {
        patch.push(match line.kind {
            ReplayLineKind::Context | ReplayLineKind::ContextEofNl => ' ',
            ReplayLineKind::Addition | ReplayLineKind::AddEofNl => '+',
            ReplayLineKind::Deletion | ReplayLineKind::DeleteEofNl => '-',
        });
        patch.push_str(&line.content);
        patch.push('\n');
    }

    patch
}

fn fallback_hunk_title(file: &CommitReplayFile, raw_hunk_indexes: &[usize]) -> String {
    if let Some(context) = raw_hunk_indexes.iter().find_map(|index| {
        file.hunks
            .get(*index)
            .and_then(|hunk| extract_header_context(&hunk.header))
    }) {
        return format!("Update {context}");
    }

    match file.status {
        ReplayFileStatus::Added => format!("Add {}", display_path(file)),
        ReplayFileStatus::Deleted => format!("Remove {}", display_path(file)),
        ReplayFileStatus::Renamed => format!("Rename {}", display_path(file)),
        ReplayFileStatus::Copied => format!("Copy {}", display_path(file)),
        ReplayFileStatus::Typechange => format!("Change file type for {}", display_path(file)),
        ReplayFileStatus::Modified | ReplayFileStatus::Unmodified => {
            format!("Update {}", display_path(file))
        }
    }
}

fn fallback_hunk_summary(file: &CommitReplayFile, raw_hunk_indexes: &[usize]) -> Option<String> {
    let mut additions = 0usize;
    let mut deletions = 0usize;

    for index in raw_hunk_indexes {
        let Some(hunk) = file.hunks.get(*index) else {
            continue;
        };

        for line in &hunk.lines {
            match line.kind {
                ReplayLineKind::Addition => additions += 1,
                ReplayLineKind::Deletion => deletions += 1,
                ReplayLineKind::Context
                | ReplayLineKind::ContextEofNl
                | ReplayLineKind::AddEofNl
                | ReplayLineKind::DeleteEofNl => {}
            }
        }
    }

    match (additions, deletions) {
        (0, 0) => None,
        (adds, 0) => Some(format!("Adds {adds} lines in {}.", display_path(file))),
        (0, dels) => Some(format!("Removes {dels} lines in {}.", display_path(file))),
        (adds, dels) => Some(format!(
            "Changes {} with {adds} added and {dels} removed lines.",
            display_path(file)
        )),
    }
}

fn extract_header_context(header: &str) -> Option<String> {
    header
        .rsplit("@@")
        .next()
        .map(str::trim)
        .and_then(|value| non_empty(value.to_string()))
}

fn display_path(file: &CommitReplayFile) -> String {
    file.new_path
        .clone()
        .or_else(|| file.old_path.clone())
        .unwrap_or_else(|| "untitled".to_string())
}

fn replay_status_label(status: ReplayFileStatus) -> &'static str {
    match status {
        ReplayFileStatus::Added => "added",
        ReplayFileStatus::Deleted => "deleted",
        ReplayFileStatus::Modified => "modified",
        ReplayFileStatus::Renamed => "renamed",
        ReplayFileStatus::Copied => "copied",
        ReplayFileStatus::Typechange => "typechange",
        ReplayFileStatus::Unmodified => "unmodified",
    }
}

fn inclusive_end(start: u32, len: u32) -> Option<u32> {
    if len == 0 {
        return None;
    }

    Some(start.saturating_add(len.saturating_sub(1)))
}

fn min_option(current: Option<u32>, next: u32) -> Option<u32> {
    Some(current.map_or(next, |current| current.min(next)))
}

fn max_option(current: Option<u32>, next: Option<u32>) -> Option<u32> {
    match (current, next) {
        (Some(left), Some(right)) => Some(left.max(right)),
        (Some(left), None) => Some(left),
        (None, Some(right)) => Some(right),
        (None, None) => None,
    }
}

fn non_empty(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}
