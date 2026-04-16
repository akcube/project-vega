use std::collections::HashSet;
use std::env;

use anyhow::{Context, Result, anyhow};
use reqwest::Client;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::OnceCell;
use tokio::time::{Duration, timeout};

use crate::domain::{
    PlanningIssueSeverity, PlanningReadiness, ProjectPlanGuidance, ProjectPlanningInput,
    ProjectPlanningIssue, ProjectResourceKind, ProjectTaskSuggestions, SuggestedProjectTask,
};

static PROJECT_PLANNER_RUNTIME: OnceCell<std::result::Result<ProjectPlannerRuntime, String>> =
    OnceCell::const_new();

const DEFAULT_GUIDANCE_TIMEOUT_SECS: u64 = 10;
const DEFAULT_TASK_TIMEOUT_SECS: u64 = 18;
const DEFAULT_GUIDANCE_MODEL: &str = "gpt-4o-mini";
const DEFAULT_TASK_MODEL: &str = "gpt-4o";
const DEFAULT_OPENAI_ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";

#[derive(Clone)]
struct ProjectPlannerRuntime {
    client: Client,
    api_key: String,
    endpoint: String,
    guidance_model: String,
    task_model: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlannerInputPayload {
    name: String,
    brief: String,
    plan_markdown: String,
    repositories: Vec<PlannerResourcePayload>,
    documents: Vec<PlannerResourcePayload>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlannerResourcePayload {
    label: String,
    locator: String,
}

#[derive(Debug, Deserialize)]
struct GuidanceModelResponse {
    summary: Option<String>,
    readiness: PlanningReadiness,
    #[serde(default)]
    suggestions: Vec<String>,
    #[serde(default)]
    issues: Vec<GuidanceIssueModel>,
}

#[derive(Debug, Deserialize)]
struct GuidanceIssueModel {
    severity: PlanningIssueSeverity,
    title: String,
    detail: String,
}

#[derive(Debug, Deserialize)]
struct TaskSuggestionModelResponse {
    summary: Option<String>,
    #[serde(default)]
    tasks: Vec<TaskSuggestionModel>,
}

#[derive(Debug, Deserialize)]
struct TaskSuggestionModel {
    title: String,
    summary: Option<String>,
    rationale: Option<String>,
    source_repo_label: Option<String>,
    confidence: Option<f64>,
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

pub async fn suggest_project_plan(input: ProjectPlanningInput) -> ProjectPlanGuidance {
    let prepared = prepare_input(input);
    if prepared.brief.is_empty() && prepared.plan_markdown.is_empty() {
        return fallback_plan_guidance(&prepared);
    }

    let runtime_state = ensure_runtime().await.map_err(|error| error.to_string());

    match runtime_state {
        Ok(runtime) => {
            let timeout_secs = env_u64(
                "VEGA_PROJECT_PLAN_GUIDANCE_TIMEOUT_SECS",
                DEFAULT_GUIDANCE_TIMEOUT_SECS,
            );
            match timeout(timeout_secs, request_plan_guidance(&runtime, &prepared)).await {
                Ok(Ok(guidance)) => guidance,
                Ok(Err(error)) => {
                    eprintln!("[project-planner] plan guidance failed: {error}");
                    fallback_plan_guidance(&prepared)
                }
                Err(_) => {
                    eprintln!(
                        "[project-planner] plan guidance timed out after {}s",
                        timeout_secs.as_secs()
                    );
                    fallback_plan_guidance(&prepared)
                }
            }
        }
        Err(error) => {
            eprintln!("[project-planner] plan guidance runtime unavailable: {error}");
            fallback_plan_guidance(&prepared)
        }
    }
}

pub async fn suggest_project_tasks(input: ProjectPlanningInput) -> ProjectTaskSuggestions {
    let prepared = prepare_input(input);
    if prepared.plan_markdown.is_empty() {
        return fallback_task_suggestions(&prepared);
    }

    let runtime_state = ensure_runtime().await.map_err(|error| error.to_string());

    match runtime_state {
        Ok(runtime) => {
            let timeout_secs = env_u64("VEGA_PROJECT_TASK_TIMEOUT_SECS", DEFAULT_TASK_TIMEOUT_SECS);
            match timeout(timeout_secs, request_task_suggestions(&runtime, &prepared)).await {
                Ok(Ok(tasks)) if !tasks.tasks.is_empty() => tasks,
                Ok(Ok(_)) => fallback_task_suggestions(&prepared),
                Ok(Err(error)) => {
                    eprintln!("[project-planner] task suggestion failed: {error}");
                    fallback_task_suggestions(&prepared)
                }
                Err(_) => {
                    eprintln!(
                        "[project-planner] task suggestion timed out after {}s",
                        timeout_secs.as_secs()
                    );
                    fallback_task_suggestions(&prepared)
                }
            }
        }
        Err(error) => {
            eprintln!("[project-planner] task suggestion runtime unavailable: {error}");
            fallback_task_suggestions(&prepared)
        }
    }
}

async fn request_plan_guidance(
    runtime: &ProjectPlannerRuntime,
    input: &PlannerInputPayload,
) -> Result<ProjectPlanGuidance> {
    let input_json = serde_json::to_string_pretty(input)
        .map_err(|error| anyhow!("failed to serialize plan guidance input: {error}"))?;
    let schema = plan_guidance_schema();

    let system_prompt = concat!(
        "You are helping a software engineer shape a project plan before tasks are created.\n",
        "Return only valid JSON that matches the requested schema.\n",
        "Be concise, concrete, and opinionated.\n",
        "Use suggestions for forward-looking ideas that would strengthen the plan.\n",
        "Use issues only for ambiguity, sequencing risk, missing validation, or likely scope gaps.\n",
        "Treat the plan as a draft in progress and avoid demanding polish too early."
    );

    let user_prompt = format!(
        "Review this project draft and return structured guidance.\n\
         Focus on what is missing, underspecified, risky, or worth thinking about next.\n\
         Keep suggestions specific to the provided project, brief, plan, and resources.\n\n\
         Schema:\n{}\n\nDraft:\n{}",
        serde_json::to_string_pretty(&schema)
            .map_err(|error| anyhow!("failed to format plan guidance schema: {error}"))?,
        input_json
    );

    let response: GuidanceModelResponse = request_json_response(
        runtime,
        &runtime.guidance_model,
        0.2,
        900,
        "project_plan_guidance",
        schema,
        system_prompt,
        user_prompt,
    )
    .await?;

    Ok(sanitize_plan_guidance(response, input))
}

async fn request_task_suggestions(
    runtime: &ProjectPlannerRuntime,
    input: &PlannerInputPayload,
) -> Result<ProjectTaskSuggestions> {
    let input_json = serde_json::to_string_pretty(input)
        .map_err(|error| anyhow!("failed to serialize task suggestion input: {error}"))?;
    let schema = task_suggestions_schema();

    let system_prompt = concat!(
        "You turn software project plans into concrete implementation tasks.\n",
        "Return only valid JSON that matches the requested schema.\n",
        "Suggest work that can plausibly become separate engineering tasks or worktrees.\n",
        "Favor implementable units over vague themes.\n",
        "Avoid tasks that are too tiny, overly broad, or purely managerial.\n",
        "If multiple repositories are provided, choose source_repo_label values only from the repository labels in the input."
    );

    let user_prompt = format!(
        "Generate the best next task candidates for this project draft.\n\
         Prefer 4 to 8 tasks.\n\
         Each task should be specific enough to hand to an agent.\n\
         Merge trivial chores into a broader task when appropriate.\n\n\
         Schema:\n{}\n\nDraft:\n{}",
        serde_json::to_string_pretty(&schema)
            .map_err(|error| anyhow!("failed to format task suggestion schema: {error}"))?,
        input_json
    );

    let response: TaskSuggestionModelResponse = request_json_response(
        runtime,
        &runtime.task_model,
        0.25,
        1200,
        "project_task_suggestions",
        schema,
        system_prompt,
        user_prompt,
    )
    .await?;

    Ok(sanitize_task_suggestions(response, input))
}

async fn request_json_response<T>(
    runtime: &ProjectPlannerRuntime,
    model: &str,
    temperature: f64,
    max_tokens: u32,
    schema_name: &str,
    schema: serde_json::Value,
    system_prompt: &str,
    user_prompt: String,
) -> Result<T>
where
    T: DeserializeOwned,
{
    let payload = json!({
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": schema_name,
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
        .context("project planner API request failed")?;

    let status = response.status();
    let body = response
        .text()
        .await
        .context("failed to read project planner API response body")?;

    if !status.is_success() {
        if let Ok(error) = serde_json::from_str::<OpenAiErrorEnvelope>(&body) {
            return Err(anyhow!(
                "project planner API error {}: {}",
                status,
                error.error.message
            ));
        }

        return Err(anyhow!("project planner API error {}: {}", status, body));
    }

    let completion: OpenAiChatCompletionResponse = serde_json::from_str(&body)
        .map_err(|error| anyhow!("failed to parse project planner API response: {error}"))?;
    let choice = completion
        .choices
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("project planner API returned no choices"))?;

    if let Some(finish_reason) = choice.finish_reason.as_deref()
        && finish_reason == "length"
    {
        eprintln!("[project-planner] model response hit max_tokens");
    }

    if let Some(refusal) = choice.message.refusal.and_then(non_empty) {
        return Err(anyhow!("project planner model refused: {refusal}"));
    }

    let content = choice
        .message
        .content
        .and_then(non_empty)
        .ok_or_else(|| anyhow!("project planner model returned empty content"))?;

    parse_json_response::<T>(&content)
}

fn plan_guidance_schema() -> serde_json::Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "summary": { "type": ["string", "null"] },
            "readiness": {
                "type": "string",
                "enum": ["early", "needs_clarification", "solid"]
            },
            "suggestions": {
                "type": "array",
                "items": { "type": "string" }
            },
            "issues": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                        "severity": {
                            "type": "string",
                            "enum": ["critical", "warning", "note"]
                        },
                        "title": { "type": "string" },
                        "detail": { "type": "string" }
                    },
                    "required": ["severity", "title", "detail"]
                }
            }
        },
        "required": ["summary", "readiness", "suggestions", "issues"]
    })
}

fn task_suggestions_schema() -> serde_json::Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "summary": { "type": ["string", "null"] },
            "tasks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                        "title": { "type": "string" },
                        "summary": { "type": ["string", "null"] },
                        "rationale": { "type": ["string", "null"] },
                        "source_repo_label": { "type": ["string", "null"] },
                        "confidence": { "type": ["number", "null"] }
                    },
                    "required": [
                        "title",
                        "summary",
                        "rationale",
                        "source_repo_label",
                        "confidence"
                    ]
                }
            }
        },
        "required": ["summary", "tasks"]
    })
}

fn prepare_input(input: ProjectPlanningInput) -> PlannerInputPayload {
    let mut repositories = Vec::new();
    let mut documents = Vec::new();

    for resource in input.resources {
        let label = resource.label.trim().to_string();
        let locator = resource.locator.trim().to_string();
        if label.is_empty() && locator.is_empty() {
            continue;
        }

        let payload = PlannerResourcePayload {
            label: if label.is_empty() {
                locator.clone()
            } else {
                label
            },
            locator,
        };

        match resource.kind {
            ProjectResourceKind::Repo => repositories.push(payload),
            ProjectResourceKind::Doc => documents.push(payload),
        }
    }

    PlannerInputPayload {
        name: input.name.trim().to_string(),
        brief: input.brief.trim().to_string(),
        plan_markdown: input.plan_markdown.trim().to_string(),
        repositories,
        documents,
    }
}

fn sanitize_plan_guidance(
    response: GuidanceModelResponse,
    input: &PlannerInputPayload,
) -> ProjectPlanGuidance {
    let mut suggestions = response
        .suggestions
        .into_iter()
        .filter_map(non_empty)
        .take(6)
        .collect::<Vec<_>>();

    let mut issues = response
        .issues
        .into_iter()
        .filter_map(|issue| {
            Some(ProjectPlanningIssue {
                severity: issue.severity,
                title: non_empty(issue.title)?,
                detail: non_empty(issue.detail)?,
            })
        })
        .take(5)
        .collect::<Vec<_>>();

    if suggestions.is_empty() && issues.is_empty() {
        let fallback = fallback_plan_guidance(input);
        suggestions = fallback.suggestions;
        issues = fallback.issues;
    }

    ProjectPlanGuidance {
        summary: non_empty(response.summary.unwrap_or_default())
            .or_else(|| fallback_plan_guidance(input).summary),
        readiness: response.readiness,
        suggestions,
        issues,
    }
}

fn sanitize_task_suggestions(
    response: TaskSuggestionModelResponse,
    input: &PlannerInputPayload,
) -> ProjectTaskSuggestions {
    let valid_repo_labels = input
        .repositories
        .iter()
        .map(|resource| resource.label.as_str())
        .collect::<HashSet<_>>();
    let default_repo_label = if input.repositories.len() == 1 {
        input.repositories[0].label.clone()
    } else {
        String::new()
    };
    let mut seen_titles = HashSet::new();
    let mut tasks = Vec::new();

    for (index, task) in response.tasks.into_iter().enumerate() {
        let Some(title) = non_empty(task.title) else {
            continue;
        };
        let dedupe_key = title.to_lowercase();
        if !seen_titles.insert(dedupe_key) {
            continue;
        }

        let source_repo_label = task.source_repo_label.and_then(|label| {
            let trimmed = label.trim().to_string();
            if trimmed.is_empty() {
                None
            } else if valid_repo_labels.contains(trimmed.as_str()) {
                Some(trimmed)
            } else if !default_repo_label.is_empty() {
                Some(default_repo_label.clone())
            } else {
                None
            }
        });

        let summary = non_empty(task.summary.unwrap_or_default())
            .unwrap_or_else(|| format!("Ship {}", title.to_lowercase()));

        tasks.push(SuggestedProjectTask {
            id: format!("suggested-task-{}-{}", index + 1, slugify(&title)),
            title,
            summary,
            rationale: task.rationale.and_then(non_empty),
            source_repo_label,
            confidence: task.confidence.map(|value| value.clamp(0.0, 1.0)),
        });

        if tasks.len() >= 8 {
            break;
        }
    }

    if tasks.is_empty() {
        return fallback_task_suggestions(input);
    }

    ProjectTaskSuggestions {
        summary: non_empty(response.summary.unwrap_or_default()).or_else(|| {
            Some("Potential implementation tasks inferred from the current draft.".to_string())
        }),
        tasks,
    }
}

fn fallback_plan_guidance(input: &PlannerInputPayload) -> ProjectPlanGuidance {
    let bullet_count = extract_task_candidates(&input.plan_markdown).len();
    let mentions_testing = contains_any(
        &input.plan_markdown,
        &["test", "testing", "verify", "validation", "qa"],
    );
    let mentions_rollout = contains_any(
        &input.plan_markdown,
        &["deploy", "release", "rollout", "migration", "launch"],
    );
    let mentions_repo_split = input.repositories.len() <= 1
        || input.repositories.iter().any(|resource| {
            contains_any(&input.plan_markdown, &[&resource.label, &resource.locator])
        });

    let readiness = if input.plan_markdown.len() < 40 || bullet_count == 0 {
        PlanningReadiness::Early
    } else if input.brief.len() < 40 || !mentions_testing {
        PlanningReadiness::NeedsClarification
    } else {
        PlanningReadiness::Solid
    };

    let mut suggestions = Vec::new();
    let mut issues = Vec::new();

    if bullet_count == 0 {
        suggestions.push(
            "Break the plan into concrete milestones or bullets so tasks can be generated cleanly."
                .to_string(),
        );
    }
    if !mentions_testing {
        suggestions.push("Call out how each milestone will be verified so task owners know what done looks like.".to_string());
    }
    if input.repositories.len() > 1 && !mentions_repo_split {
        suggestions.push("Tag major workstreams with the repo that owns them so multi-repo task routing is less ambiguous.".to_string());
    }
    if !mentions_rollout {
        suggestions.push(
            "Consider whether rollout, migration, or follow-up cleanup work deserves its own step."
                .to_string(),
        );
    }

    if input.brief.len() < 24 {
        issues.push(ProjectPlanningIssue {
            severity: PlanningIssueSeverity::Warning,
            title: "Brief is still thin".to_string(),
            detail: "The project goal is short enough that the task generator may miss user-facing intent or constraints.".to_string(),
        });
    }

    if input.plan_markdown.len() < 40 {
        issues.push(ProjectPlanningIssue {
            severity: PlanningIssueSeverity::Warning,
            title: "Plan is still very early".to_string(),
            detail: "Add a few more concrete steps before relying on the suggested task breakdown."
                .to_string(),
        });
    }

    if issues.is_empty() && suggestions.is_empty() {
        suggestions.push("The draft is coherent enough to turn into tasks; the next improvement is sharper sequencing between the first and second milestones.".to_string());
    }

    ProjectPlanGuidance {
        summary: Some(match readiness {
            PlanningReadiness::Early => {
                "The draft is still forming; add more concrete implementation steps.".to_string()
            }
            PlanningReadiness::NeedsClarification => {
                "The draft has shape, but a few missing details could cause muddy task breakdowns."
                    .to_string()
            }
            PlanningReadiness::Solid => {
                "The draft is detailed enough to start turning into concrete tasks.".to_string()
            }
        }),
        readiness,
        suggestions,
        issues,
    }
}

fn fallback_task_suggestions(input: &PlannerInputPayload) -> ProjectTaskSuggestions {
    let repo_label = if input.repositories.len() == 1 {
        Some(input.repositories[0].label.clone())
    } else {
        None
    };

    let tasks = extract_task_candidates(&input.plan_markdown)
        .into_iter()
        .take(8)
        .enumerate()
        .map(|(index, title)| SuggestedProjectTask {
            id: format!("suggested-task-fallback-{}-{}", index + 1, slugify(&title)),
            summary: format!(
                "Carry out the {} workstream described in the current plan.",
                title.to_lowercase()
            ),
            title,
            rationale: None,
            source_repo_label: repo_label.clone(),
            confidence: None,
        })
        .collect::<Vec<_>>();

    ProjectTaskSuggestions {
        summary: Some(if tasks.is_empty() {
            "Add more concrete bullets to the plan to unlock suggested tasks.".to_string()
        } else {
            "These tasks were inferred from the current plan draft.".to_string()
        }),
        tasks,
    }
}

fn extract_task_candidates(plan_markdown: &str) -> Vec<String> {
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();

    for line in plan_markdown.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let cleaned = trimmed
            .trim_start_matches(|ch: char| {
                ch == '-' || ch == '*' || ch == '+' || ch.is_ascii_digit() || ch == '.' || ch == ')'
            })
            .trim()
            .trim_matches('#')
            .trim();

        let title = cleaned
            .split(':')
            .next()
            .unwrap_or(cleaned)
            .trim()
            .trim_end_matches('.')
            .to_string();

        if title.len() < 6 {
            continue;
        }

        let key = title.to_lowercase();
        if seen.insert(key) {
            candidates.push(title);
        }
    }

    if !candidates.is_empty() {
        return candidates;
    }

    input_paragraph_candidates(plan_markdown)
}

fn input_paragraph_candidates(plan_markdown: &str) -> Vec<String> {
    plan_markdown
        .split(['\n', '.'])
        .map(str::trim)
        .filter(|entry| entry.len() >= 12)
        .take(6)
        .map(|entry| entry.trim_end_matches('.').to_string())
        .collect()
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    let haystack = haystack.to_lowercase();
    needles
        .iter()
        .filter(|needle| !needle.is_empty())
        .any(|needle| haystack.contains(&needle.to_lowercase()))
}

async fn ensure_runtime() -> Result<ProjectPlannerRuntime> {
    match PROJECT_PLANNER_RUNTIME.get_or_init(init_runtime).await {
        Ok(runtime) => Ok(runtime.clone()),
        Err(error) => Err(anyhow!(error.clone())),
    }
}

async fn init_runtime() -> std::result::Result<ProjectPlannerRuntime, String> {
    let api_key = load_openai_api_key()
        .ok_or_else(|| "OPENAI_API_KEY not set and ~/openai.key not available".to_string())?;
    let endpoint = env::var("VEGA_PROJECT_PLANNER_ENDPOINT")
        .unwrap_or_else(|_| DEFAULT_OPENAI_ENDPOINT.to_string());
    let guidance_model = env::var("VEGA_PROJECT_PLAN_GUIDANCE_MODEL")
        .unwrap_or_else(|_| DEFAULT_GUIDANCE_MODEL.to_string());
    let task_model =
        env::var("VEGA_PROJECT_TASK_MODEL").unwrap_or_else(|_| DEFAULT_TASK_MODEL.to_string());

    eprintln!(
        "[project-planner] runtime using guidance={} task={}",
        guidance_model, task_model
    );

    let client = Client::builder()
        .build()
        .map_err(|error| format!("failed to build project planner HTTP client: {error}"))?;

    Ok(ProjectPlannerRuntime {
        client,
        api_key,
        endpoint,
        guidance_model,
        task_model,
    })
}

fn env_u64(name: &str, default: u64) -> Duration {
    Duration::from_secs(
        env::var(name)
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .filter(|value| *value > 0)
            .unwrap_or(default),
    )
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

fn parse_json_response<T>(text: &str) -> Result<T>
where
    T: DeserializeOwned,
{
    if let Ok(parsed) = serde_json::from_str(text) {
        return Ok(parsed);
    }

    if let Some(block) = extract_json_block(text) {
        return serde_json::from_str(&block)
            .map_err(|error| anyhow!("invalid JSON response from project planner model: {error}"));
    }

    eprintln!(
        "[project-planner] raw model response was not parseable JSON: {}",
        text.chars().take(600).collect::<String>()
    );
    Err(anyhow!("project planner model returned no parseable JSON"))
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

fn non_empty(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut last_was_dash = false;

    for ch in value.trim().chars() {
        let mapped = if ch.is_ascii_alphanumeric() {
            Some(ch.to_ascii_lowercase())
        } else if ch.is_whitespace() || ch == '-' || ch == '_' {
            Some('-')
        } else {
            None
        };

        match mapped {
            Some('-') if !last_was_dash && !slug.is_empty() => {
                slug.push('-');
                last_was_dash = true;
            }
            Some(ch) if ch != '-' => {
                slug.push(ch);
                last_was_dash = false;
            }
            _ => {}
        }
    }

    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        "task".to_string()
    } else {
        slug.to_string()
    }
}
