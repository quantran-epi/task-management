use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkillItem {
    pub name: String,
    pub description: String,
    pub argument_hint: Option<String>,
    pub source: String, // "builtin" | "project" | "user"
}

fn parse_skill_markdown(path: &Path, fallback_name: &str) -> (String, String, Option<String>) {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return (fallback_name.to_string(), String::new(), None),
    };

    let mut name = fallback_name.to_string();
    let mut description = String::new();
    let mut argument_hint = None;

    let lines: Vec<&str> = content.lines().collect();
    if lines.first().map(|l| l.trim()) == Some("---") {
        for line in &lines[1..] {
            let trimmed = line.trim();
            if trimmed == "---" {
                break;
            }

            if let Some(val) = trimmed.strip_prefix("name:") {
                let clean = val.trim().trim_matches('"').trim_matches('\'');
                if !clean.is_empty() {
                    name = clean.to_string();
                }
            } else if let Some(val) = trimmed.strip_prefix("description:") {
                let clean = val.trim().trim_matches('"').trim_matches('\'');
                description = clean.to_string();
            } else if let Some(val) = trimmed.strip_prefix("argument-hint:") {
                let clean = val.trim().trim_matches('"').trim_matches('\'');
                argument_hint = Some(clean.to_string());
            } else if let Some(val) = trimmed.strip_prefix("argument_hint:") {
                let clean = val.trim().trim_matches('"').trim_matches('\'');
                argument_hint = Some(clean.to_string());
            } else if let Some(val) = trimmed.strip_prefix("args:") {
                let clean = val.trim().trim_matches('"').trim_matches('\'');
                argument_hint = Some(clean.to_string());
            }
        }
    }

    (name, description, argument_hint)
}

fn scan_skills_dir(dir: &Path, source: &str, seen_names: &mut HashSet<String>, result: &mut Vec<SkillItem>) {
    if !dir.exists() || !dir.is_dir() {
        return;
    }

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let fallback_name = entry.file_name().to_string_lossy().to_string();

        let (skill_path, skill_fallback) = if path.is_dir() {
            let skill_file = path.join("SKILL.md");
            if skill_file.exists() {
                (skill_file, fallback_name)
            } else {
                continue;
            }
        } else if path.extension().map_or(false, |ext| ext == "md") {
            let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or(fallback_name);
            (path, stem)
        } else {
            continue;
        };

        let (name, description, argument_hint) = parse_skill_markdown(&skill_path, &skill_fallback);
        let name_trimmed = name.trim().trim_start_matches('/').to_string();
        if !name_trimmed.is_empty() && !seen_names.contains(&name_trimmed) {
            seen_names.insert(name_trimmed.clone());
            result.push(SkillItem {
                name: name_trimmed,
                description,
                argument_hint,
                source: source.to_string(),
            });
        }
    }
}

fn get_builtin_skills() -> Vec<SkillItem> {
    vec![
        SkillItem {
            name: "help".to_string(),
            description: "Show available commands and usage guide".to_string(),
            argument_hint: None,
            source: "builtin".to_string(),
        },
        SkillItem {
            name: "clear".to_string(),
            description: "Clear terminal log stream".to_string(),
            argument_hint: None,
            source: "builtin".to_string(),
        },
        SkillItem {
            name: "compact".to_string(),
            description: "Compact session conversation context".to_string(),
            argument_hint: None,
            source: "builtin".to_string(),
        },
        SkillItem {
            name: "cost".to_string(),
            description: "Display session token usage and estimated cost".to_string(),
            argument_hint: None,
            source: "builtin".to_string(),
        },
        SkillItem {
            name: "review".to_string(),
            description: "Review current git diff and changes".to_string(),
            argument_hint: Some("[--fix | --comment]".to_string()),
            source: "builtin".to_string(),
        },
        SkillItem {
            name: "init".to_string(),
            description: "Initialize CLAUDE.md documentation for this repo".to_string(),
            argument_hint: None,
            source: "builtin".to_string(),
        },
        SkillItem {
            name: "gsd-quick".to_string(),
            description: "Execute small, ad-hoc tasks with atomic commits".to_string(),
            argument_hint: Some("<task description>".to_string()),
            source: "builtin".to_string(),
        },
        SkillItem {
            name: "gsd-debug".to_string(),
            description: "Systematic debugging with persistent checkpoints".to_string(),
            argument_hint: Some("<bug description>".to_string()),
            source: "builtin".to_string(),
        },
        SkillItem {
            name: "gsd-execute-phase".to_string(),
            description: "Execute all plans in a phase with parallelization".to_string(),
            argument_hint: Some("<phase number>".to_string()),
            source: "builtin".to_string(),
        },
        SkillItem {
            name: "gsd-plan-phase".to_string(),
            description: "Create detailed phase plan with verification loop".to_string(),
            argument_hint: Some("<phase number>".to_string()),
            source: "builtin".to_string(),
        },
        SkillItem {
            name: "gsd-progress".to_string(),
            description: "Check progress, advance workflow, or dispatch intent".to_string(),
            argument_hint: None,
            source: "builtin".to_string(),
        },
        SkillItem {
            name: "gsd-help".to_string(),
            description: "Show available GSD commands and usage guide".to_string(),
            argument_hint: None,
            source: "builtin".to_string(),
        },
    ]
}

#[tauri::command]
pub async fn list_available_skills(repo_path: Option<String>) -> Result<Vec<SkillItem>, String> {
    let mut result = Vec::new();
    let mut seen_names = HashSet::new();

    // 1. Project skills if repo_path provided (<repo>/.claude/skills)
    if let Some(ref r_path) = repo_path {
        let repo_dir = PathBuf::from(r_path);
        let project_skills = repo_dir.join(".claude").join("skills");
        scan_skills_dir(&project_skills, "project", &mut seen_names, &mut result);
    }

    // 2. User skills (~/.claude/skills)
    if let Some(home) = dirs_home() {
        let user_skills = home.join(".claude").join("skills");
        scan_skills_dir(&user_skills, "user", &mut seen_names, &mut result);
    }

    // 3. Built-in fallback skills
    for builtin in get_builtin_skills() {
        if !seen_names.contains(&builtin.name) {
            seen_names.insert(builtin.name.clone());
            result.push(builtin);
        }
    }

    // Sort alphabetically by name
    result.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(result)
}

fn dirs_home() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var("USERPROFILE").ok().map(PathBuf::from)
    }
    #[cfg(not(windows))]
    {
        std::env::var("HOME").ok().map(PathBuf::from)
    }
}
