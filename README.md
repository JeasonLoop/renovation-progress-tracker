# 筑记 Renovation Progress Tracker

一个面向个人装修过程的进度、验收、预算和现场记录工具。它采用本地优先的数据模型，适合在手机现场记录，也适合在桌面端集中整理；生产环境可部署到 Cloudflare Workers Static Assets，并用 D1 与 KV 承载登录、云端快照和私有图片附件。

## Highlights

- 进度管理：阶段、任务、状态流转、延期与完成情况一屏查看
- 验收记录：水电等节点验收、照片证据、不合格项和整改闭环
- 预算材料：预算分类、合同付款、材料候选对比、票据附件
- 本地优先：浏览器自动保存，支持 JSON 备份恢复、CSV 导出和打印
- 多账号登录：注册、账号唯一校验、管理员初始化、12 小时签名会话
- 云端同步：D1 保存项目快照，基于 revision 检测多设备写入冲突
- 私有附件：图片上传到 Cloudflare KV，读取和删除都需要登录态
- 安全默认值：HttpOnly Cookie、Origin 校验、基础限流、安全响应头和密钥脱敏配置

## Tech Stack

| Layer | Choice |
| --- | --- |
| App | Next.js App Router, React 19, TypeScript |
| UI | Tailwind CSS v4, Phosphor Icons |
| Runtime | Cloudflare Workers Static Assets |
| Data | Browser localStorage, Cloudflare D1 |
| Files | Cloudflare KV |
| Auth | PBKDF2-SHA-256 password hashes, HMAC signed session cookies |

## Quick Start

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

In local frontend-only development, the app falls back to `localStorage` based mock auth. In the Cloudflare Worker runtime, auth and cloud data use D1, KV, and Worker secrets.

## Project Structure

```text
src/app/              Next.js pages and route-level UI
src/components/       Renovation workspace and reusable UI pieces
src/lib/              Local storage, cloud sync, seed data, shared types
worker/index.ts       Cloudflare Worker API, auth, upload, security headers
migrations/           D1 schema migrations
scripts/              Secret provisioning and production deployment helpers
docs/                 Architecture notes and implementation plans
```

## Cloudflare Setup

The checked-in `wrangler.jsonc` is safe for open source and uses placeholder resource IDs. Before deploying your own copy, create Cloudflare resources and replace:

| Binding | Resource |
| --- | --- |
| `ZHUJI_UPLOADS` | KV namespace ID |
| `RENOVATION_DB` | D1 database ID |
| `database_name` | Your D1 database name |
| `name` | Your Worker name |

Apply migrations:

```bash
npx wrangler d1 migrations apply RENOVATION_DB --remote
```

Provision the initial administrator password and session secret:

```bash
ADMIN_PASSWORD="replace-with-your-admin-password" npm run secrets:provision
```

Deploy:

```bash
npm run build
npx wrangler deploy
```

For a deployment with health checks:

```bash
PRODUCTION_URL="https://your-domain.example" npm run deploy:prod
```

If your direct Worker URL differs from the final public domain, also set `PRODUCTION_ORIGIN`.

## Private Local Deployment

For personal/private deployments, keep real production values in ignored local files:

- `.env.local` for `ADMIN_PASSWORD`, `PRODUCTION_URL`, `PRODUCTION_ORIGIN`, and `WRANGLER_CONFIG`
- `wrangler.production.jsonc` for real Cloudflare Worker, KV, and D1 IDs

The deployment scripts automatically load `.env.local`, so day-to-day private deploys can be:

```bash
npm run secrets:provision
npm run deploy:prod
```

Do not commit those private files.

## Environment Variables

| Name | Required | Used by | Notes |
| --- | --- | --- | --- |
| `ADMIN_PASSWORD` | Secret provisioning | `scripts/provision-admin-secrets.mjs` | Plaintext only exists locally; script stores a hash in Cloudflare Secret |
| `ADMIN_PASSWORD_HASH` | Worker runtime | Cloudflare Secret / `.dev.vars` | PBKDF2 hash used to initialize `admin` |
| `SESSION_SECRET` | Worker runtime | Cloudflare Secret / `.dev.vars` | HMAC key for signed session cookies |
| `PRODUCTION_URL` | Production deploy script | `scripts/deploy-production.mjs` | Final public site URL |
| `PRODUCTION_ORIGIN` | Optional smoke checks | deploy/provision scripts | Direct Worker URL or same as public URL |
| `WRANGLER_CONFIG` | Optional private deploys | deploy/provision scripts | Example: `wrangler.production.jsonc` |

## Security Notes

- Passwords are stored as PBKDF2-SHA-256 hashes with per-password salts.
- Session cookies are signed, HttpOnly, SameSite=Strict, and Secure on HTTPS.
- Mutating auth/data/upload endpoints require same-origin requests.
- Login and registration attempts are rate-limited through D1 atomic upserts.
- Image uploads are size-limited and checked against file signatures.
- D1 queries use prepared statements and bound parameters.
- Cloud snapshots use revisions to avoid silent multi-device overwrite.

## Private-to-Public Release Checklist

If this project has been developed in a private GitHub repository, do not only inspect the latest files before making it public. GitHub will expose the full git history.

Recommended path:

1. Confirm `.env.local`, `.dev.vars`, `wrangler.production.jsonc`, `.wrangler/`, `.next*`, logs, and `node_modules/` are ignored.
2. Remove real Cloudflare IDs, production domains, API tokens, passwords, and personal paths from tracked files.
3. Rewrite history with an orphan single-commit release or a history-filtering tool.
4. Scan the rewritten history for known sensitive strings.
5. Force push while the repository is still private.
6. Only then switch GitHub visibility from Private to Public.

If a real token or password was ever committed, rotate it even after history cleanup. Resource IDs and domains are not usually credentials, but they are still production fingerprints and should not be published casually.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Next.js dev server |
| `npm run build` | Build the static Next.js app |
| `npm run preview:cloudflare` | Build and run with Wrangler locally |
| `npm run secrets:provision` | Generate and upload Worker secrets |
| `npm run deploy` | Build and deploy with the public `wrangler.jsonc` |
| `npm run deploy:prod` | Build, migrate, deploy, and smoke-check production |

## Documentation

- [Architecture](docs/architecture.md)
- [Product requirements](docs/plans/2026-07-28-renovation-progress-tracker-design.md)
- [Cloud sync design](docs/plans/2026-07-28-cloud-sync-design.md)

## License

MIT
