---
name: professional-depth-drill
description: Drill a module to domain-professional depth before rewriting. Use when the user wants to deepen an existing capability rather than expand surface area, or asks to audit what top professionals would do that hasn't been requested yet. Do not use for new features or greenfield work.
---

# Professional Depth Drill

Before rewriting any existing module, systematically answer four questions. Write the answers into the task plan document (usually under `.trae/specs/`) BEFORE touching code. Deliverable of this phase is a **depth audit**, not code.

## The Four Questions

### 1. What do top professionals in this domain do that hasn't been asked for?

Compare what is currently implemented against what the domain's best practitioners would deliver on the same inputs. Focus on **deeper representation of the same signal**, not new signals. The answer should be a table with columns:

| 维度 | 当前实现 | 他们会多做什么 |

Common dimensions to check: granularity of representation, temporal derivatives, contradiction/conflict detection, anchor-point localization, cross-session or cross-day trends, distribution-based anomaly detection vs hard thresholds, causal chains.

### 2. What raw materials would they start from instead of the pre-digested inputs currently used?

List every input to the current module, then identify the **earlier, noisier, higher-information-density source** that a pro would tap instead. Columns:

| 当前用的（已处理） | 他们要的原始素材 |

Example patterns: keystroke-level event streams vs aggregated delete counts, full diary text vs summaries, LLM raw chain-of-thought vs final JSON, contentEditable DOM mutations vs character-level diffs.

### 3. What specific methods and tools would they use?

For each upgrade identified in (1), list the concrete method. Must respect the project's **technology stack constraints** — no new libraries, no new cloud providers, only what's already in the repo. Columns:

| 方法 | 具体做法 | 当前没做什么 |

Methods come from: existing AiClient capabilities (chat / chat jsonMode / embed), existing DB tables, existing keyword dictionaries, pure Java math (z-score, cosine, autocorrelation, moving average), Spring scheduling.

### 4. What external proof would validate the result is correct?

List every validation method that does **not depend on the implementer's opinion**. Each must produce a number. Columns:

| 验证方法 | 目标阈值 |
|---|---|
| Gold-standard test set + Cohen's kappa (inter-annotator agreement) | κ ≥ 0.7 |
| LLM-as-Judge double-blind (old vs new) | Δscore ≥ 1.0, p < 0.05 |
| Ablation studies (drop each module, measure drop) | each drop ≥ 0.3 |
| External validity (correlation with real user behavior) | Pearson ≥ 0.2 |
| Longitudinal A/B test | 👍 rate lift, retention lift, p < 0.05 |

## Output Format

Structure the depth audit as a section in the task spec document under `## 深度审计`. Then transform the user's original prompt into a **precise execution prompt** that covers every deliverable from (1)-(4), plus explicit prohibited actions.

After the depth audit is written and the refined prompt is ready, **pause and call AdvisorTool** before writing any code — this is the mandatory checkpoint per project policy.
