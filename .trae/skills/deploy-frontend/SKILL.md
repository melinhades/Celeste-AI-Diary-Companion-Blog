---
name: deploy-frontend
description: Deploy the static frontend in blog-ui to Cloudflare Pages project instapix via wrangler direct upload. Use when the user asks to 更新前端、发布前端、上线前端、部署前端/网站, or to redeploy the site. Do not use for backend (blog-api / Render) changes.
---

# 一键更新前端

把 `blog-ui` 的当前工作区内容原样发布到 Cloudflare Pages，并校验线上生效。

## 固定事实

| 项 | 值 |
|---|---|
| 目标项目 | Cloudflare Pages `instapix`（Direct Upload，非 Git 集成） |
| 账号 ID | `5deea33a1b45460d0c37c19879508e95`（2846484252@qq.com） |
| 部署目录 | `blog-ui`，命令在仓库根目录执行 |
| 生产分支 | `main`（生产域名 https://instapix.icu、https://instapix.pages.dev） |
| 规模 | 约 11,000 文件 / 520 MB；未变化的文件由云端去重，不会重复上传 |

## 步骤

### 1. 检查登录

```powershell
npx --yes wrangler whoami
```

- 输出 `You are logged in with an OAuth Token` 且账号 ID 与上表一致 → 继续。
- 未登录或 token 过期 → 让用户在本机交互执行 `npx wrangler login`。不要使用其它凭证或跳过校验。

### 2. 缓存版本号（部署前必做）

`blog-ui` 的 CSS/JS 通过 `?v=` 参数控制缓存；只改文件不改版本号，线上会继续命中旧缓存。

```powershell
git status --short blog-ui
```

- 找出本轮改动的 `.css` / `.js`，确认引用它的 HTML 里 `?v=` 已升级。
- 未升级则改成当天日期加字母（如 `20261103a`），再继续部署。

### 3. 部署

```powershell
npx --yes wrangler pages deploy blog-ui --project-name instapix --branch main --commit-dirty=true
```

- **必须带 `--branch main`**：该项目的 Production 分支是 `main`。仓库当前分支是 `master`，不指定时 wrangler 会按 `master` 生成 **Preview** 部署，`instapix.icu` 完全不变（曾踩过这个坑）。
- 工作区通常有未提交改动，必须带 `--commit-dirty=true`，否则可能卡在交互确认。
- 上传较慢，用后台任务运行并给足超时（≥ 5 分钟）。
- 部署完成后用 `npx wrangler pages deployment list --project-name instapix` 确认最新一条的 Environment 是 `Production`、Branch 是 `main`。

### 4. 校验线上

- 从部署输出取三样东西：`Deployment complete!` 的预览 URL（`https://<id>.instapix.pages.dev`）、`Uploaded N files`、`Deployment alias URL`。
- 确认生产域名可访问且引用的是本次版本：

```powershell
curl.exe -sL https://instapix.icu/diary | Select-String "diary.css?v="
curl.exe -sL -o NUL -w "%{http_code}" https://instapix.icu/
```

- 若本次改了带 `?v=` 的资源，抽查该资源 URL：返回 200，且内容包含本次改动（例如新增的 CSS 规则）。

### 5. 汇报

输出：预览 URL、生产别名、本次上传文件数、校验结果。不要自动执行 `git commit` / `git push`，除用户明确要求。

## 注意

- 只发布 `blog-ui` 静态资源；后端 `blog-api`（Render）与数据库不在本 skill 范围。
- 部署日志里出现 `Failed to write to log file ... EPERM` 只是日志落盘失败，不影响部署结果，可忽略。
- 常见失败原因：未登录、账号不匹配、单文件超过 25 MiB、文件数超过 20,000。
