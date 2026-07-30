# 筑记：装修进度与验收助手

筑记是一个面向个人装修过程的进度、验收、预算和现场记录工具。它采用本地优先的数据模型，适合在手机上现场记录，也适合在桌面端集中整理；生产环境可部署到 Cloudflare Workers Static Assets，并使用 D1 与 KV 承载登录、云端快照和私有图片附件。

## 功能亮点

- 进度管理：阶段、任务、状态流转、延期与完成情况一屏查看
- 验收记录：水电等节点验收、照片证据、不合格项和整改闭环
- 预算材料：预算分类、合同付款、材料候选对比、票据附件
- 本地优先：浏览器自动保存，支持 JSON 备份恢复、CSV 导出和打印
- 多账号登录：注册、账号唯一校验、管理员初始化、12 小时签名会话
- 云端同步：D1 保存项目快照，基于 revision 检测多设备写入冲突
- 私有附件：图片上传到 Cloudflare KV，读取和删除都需要登录态
- 安全默认值：HttpOnly Cookie、Origin 校验、基础限流、安全响应头和密钥脱敏配置

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 应用框架 | Next.js App Router、React 19、TypeScript |
| 界面 | Tailwind CSS v4、Phosphor Icons |
| 运行环境 | Cloudflare Workers Static Assets |
| 数据 | 浏览器 localStorage、Cloudflare D1 |
| 文件 | Cloudflare KV |
| 认证 | PBKDF2-SHA-256 密码哈希、HMAC 签名会话 Cookie |

## 快速开始

```bash
npm install
npm run dev
```

然后打开 `http://localhost:3000`。

本地纯前端开发时，应用会降级使用基于 `localStorage` 的模拟注册和登录；在 Cloudflare Worker 运行时，认证和云端数据会使用 D1、KV 与 Worker Secret。

## 项目结构

```text
src/app/              Next.js 页面与路由级 UI
src/components/       装修工作台和可复用 UI 组件
src/lib/              本地存储、云端同步、种子数据、共享类型
worker/index.ts       Cloudflare Worker API、认证、上传、安全响应头
migrations/           D1 数据库迁移
scripts/              Secret 写入与生产部署脚本
docs/                 架构说明和实现计划
```

## Cloudflare 部署

仓库中的 `wrangler.jsonc` 已做开源脱敏处理，里面使用的是占位资源 ID。部署自己的版本前，需要先创建 Cloudflare 资源并替换：

| 配置项 | 需要替换为 |
| --- | --- |
| `ZHUJI_UPLOADS` | KV namespace ID |
| `RENOVATION_DB` | D1 database ID |
| `database_name` | 你的 D1 数据库名称 |
| `name` | 你的 Worker 名称 |

应用数据库迁移：

```bash
npx wrangler d1 migrations apply RENOVATION_DB --remote
```

配置初始管理员密码和会话密钥：

```bash
ADMIN_PASSWORD="replace-with-your-admin-password" npm run secrets:provision
```

部署：

```bash
npm run build
npx wrangler deploy
```

如果希望部署时附带健康检查：

```bash
PRODUCTION_URL="https://your-domain.example" npm run deploy:prod
```

如果直接 Worker 地址和最终公开域名不同，也可以额外设置 `PRODUCTION_ORIGIN`。

## 私有本地部署

个人或私有生产部署时，建议把真实生产信息放进被忽略的本地文件：

- `.env.local`：保存 `ADMIN_PASSWORD`、`PRODUCTION_URL`、`PRODUCTION_ORIGIN`、`WRANGLER_CONFIG`
- `wrangler.production.jsonc`：保存真实 Cloudflare Worker、KV、D1 绑定 ID

部署脚本会自动读取 `.env.local`，所以日常私有部署可以直接运行：

```bash
npm run secrets:provision
npm run deploy:prod
```

不要提交这些私有文件。

## 环境变量

| 变量名 | 是否必需 | 使用位置 | 说明 |
| --- | --- | --- | --- |
| `ADMIN_PASSWORD` | 写入 Secret 时必需 | `scripts/provision-admin-secrets.mjs` | 明文只存在本地；脚本会把哈希写入 Cloudflare Secret |
| `ADMIN_PASSWORD_HASH` | Worker 运行时必需 | Cloudflare Secret / `.dev.vars` | 用于初始化 `admin` 管理员账号的 PBKDF2 哈希 |
| `SESSION_SECRET` | Worker 运行时必需 | Cloudflare Secret / `.dev.vars` | 用于签名会话 Cookie 的 HMAC 密钥 |
| `PRODUCTION_URL` | 生产部署脚本必需 | `scripts/deploy-production.mjs` | 最终公开访问地址 |
| `PRODUCTION_ORIGIN` | 可选 | 部署/密钥脚本 | 直接 Worker 地址，或与公开地址相同 |
| `WRANGLER_CONFIG` | 可选 | 部署/密钥脚本 | 私有 Wrangler 配置，例如 `wrangler.production.jsonc` |

## 安全说明

- 密码使用 PBKDF2-SHA-256 哈希保存，并为每个密码生成独立 salt。
- 会话 Cookie 使用签名、HttpOnly、SameSite=Strict，HTTPS 下自动加 Secure。
- 会修改状态的认证、数据和上传接口都要求同源请求。
- 登录和注册尝试通过 D1 原子 UPSERT 做基础限流。
- 图片上传有大小限制，并会校验文件签名。
- D1 查询使用 prepared statement 和参数绑定。
- 云端快照使用 revision 防止多设备静默覆盖。

## 私有仓库转公开检查清单

如果这个项目先在 GitHub 私有仓库中开发，再切换为公开仓库，不要只检查最新文件。公开仓库会暴露完整 git 历史。

推荐流程：

1. 确认 `.env.local`、`.dev.vars`、`wrangler.production.jsonc`、`.wrangler/`、`.next*`、日志和 `node_modules/` 都被忽略。
2. 从已跟踪文件中移除真实 Cloudflare ID、生产域名、API Token、密码和个人路径。
3. 使用 orphan 单提交发布或历史过滤工具重写历史。
4. 扫描重写后的完整历史，确认没有已知敏感字符串。
5. 在仓库仍是私有状态时 force push。
6. 最后再到 GitHub 设置中把仓库从 Private 改为 Public。

如果真实 Token 或密码曾经进入提交历史，即使清理了历史也应该立即轮换。资源 ID 和域名通常不等同于密钥，但它们会暴露生产资源指纹，公开前也建议移除。

## 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动本地 Next.js 开发服务 |
| `npm run build` | 构建静态 Next.js 应用 |
| `npm run preview:cloudflare` | 构建后用 Wrangler 本地预览 |
| `npm run secrets:provision` | 生成并上传 Worker Secret |
| `npm run deploy` | 使用公开版 `wrangler.jsonc` 构建并部署 |
| `npm run deploy:prod` | 构建、迁移、部署并做生产健康检查 |

## 文档

- [架构说明](docs/architecture.md)
- [产品需求](docs/plans/2026-07-28-renovation-progress-tracker-design.md)
- [云端同步设计](docs/plans/2026-07-28-cloud-sync-design.md)

## 许可证

MIT
