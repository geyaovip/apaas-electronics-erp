# 电子行业 ERP

面向电子产品采购、销售、仓储和财务协作的开源 ERP。业务从客户、供应商与产品 SKU 开始，连接 **采购单分批入库 → 库存与应付**、**销售合同分批出库 → 库存与应收**，并记录盘点和收付款。系统有独立前端、API 与 PostgreSQL 数据库，核心流程使用本地账号。

[在线入口](https://apaas-electronics-erp.492746023.workers.dev) · [线上发布记录](docs/09-线上发布记录.md) · [业务规则](apps/electronics-erp/docs/01-产品需求.md)

## 业务能力

| 板块 | 当前能力 |
| --- | --- |
| 基础资料 | 客户与商机、产品 SKU、供应商；单据明细保留创建时的名称、SKU 和价格快照。 |
| 采购与应付 | 确认采购单后按行分批入库；每批记录实收数量、入库单和库存流水，应付按实际入库金额累计。 |
| 销售与应收 | 确认销售合同后按行分批出库；每批记录实发数量、出库单和库存流水，应收按实际出库金额累计。 |
| 仓储 | 实时库存、出入库流水、盘点差异与低库存阈值；库存不足时整批出库事务回滚，超收超发被拒绝。 |
| 财务 | 应收应付余额与分次收付款，拒绝超额支付和同一账款的重复付款参考号。 |
| 成员与 AI | 管理员创建成员，销售/采购/仓库/财务按服务端权限操作；AI 助手和单据履约分析提供只读建议。 |

金额以人民币两位小数处理，业务数量使用正整数。单据状态、库存流水与账款变化可追溯；详细约束见[产品需求](apps/electronics-erp/docs/01-产品需求.md)。

## 本地部署

需要 **Node.js 22、Docker Engine/Desktop 与 Docker Compose**。从空数据库启动时，脚本生成随机管理员和数据库密码，执行迁移并启动 Web、API、PostgreSQL。

```bash
git clone https://github.com/geyaovip/apaas-electronics-erp.git
cd apaas-electronics-erp
node scripts/init-local.mjs
node scripts/start-local.mjs
```

打开 [http://localhost:4500](http://localhost:4500)，使用该应用的管理员凭据登录。管理员账号与密码位于根目录权限受限的 `.env`；首次登录后建议修改密码。初始化不会覆盖已有凭据。

```bash
docker compose --env-file .env -f deploy/compose.yaml ps
curl -fsS http://localhost:4500/api/v1/health
node scripts/backup-local.mjs
```

数据库保存在独立 Docker 卷。停机、备份恢复、密码恢复和生产部署详见[部署与运维](docs/08-开源本地部署.md)；保存业务数据后不要执行 `docker compose down -v`。

## 技术结构

| 层 | 实现 | 目录 |
| --- | --- | --- |
| Web | React、TypeScript、Vite，适配桌面与手机浏览器 | [`apps/electronics-erp/frontend/`](apps/electronics-erp/frontend/) |
| API | NestJS、采购/销售/库存/财务规则与服务端权限 | [`apps/electronics-erp/backend/`](apps/electronics-erp/backend/) |
| 数据 | PostgreSQL 17、Prisma 模型与迁移 | [`apps/electronics-erp/backend/prisma/`](apps/electronics-erp/backend/prisma/) |
| 本地运行 | Docker Compose 启动 Web、API 与独立数据库 | [`deploy/`](deploy/) |
| 公网部署 | Cloudflare Worker 托管前端并转发同源 `/api/*`；云服务器运行 API 与数据库 | [`cloudflare/`](cloudflare/)、[`wrangler.jsonc`](wrangler.jsonc) |

公开仓库不包含线上管理员凭据或生产数据。自行部署时请按[生产运维记录](docs/09-线上发布记录.md)配置镜像、HTTPS 网关和 Worker Secret。

## AI 配置与边界

管理员从左下角齿轮进入设置页的“模型接入”，填写兼容 OpenAI Responses API 的 API 根地址、模型名称和 API Key，可先测试再保存。密钥在服务端加密保存，页面不回显；本地初始化脚本会生成随机密钥；其他部署方式需生成并长期保管 `AI_CONFIG_ENCRYPTION_KEY`（可运行 `openssl rand -hex 32`）。也可在 API 服务端配置 `OPENAI_API_KEY`、`OPENAI_MODEL` 和可选的 `OPENAI_BASE_URL` 作为默认值。未接入兼容 OpenAI Responses API 的模型时，ERP 核心业务照常运行，AI 入口会提示未启用。采购单与销售合同详情的履约分析将系统核算数量和模型说明分开展示；建议只读，不能自动入库、出库或记账。上下文读取遵循当前用户权限。参见[AI 能力与数据边界](docs/06-AI能力实施规划.md)。

## 开发与验证

先按上文启动本地环境，再安装开发依赖并运行构建和集成测试：

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build:erp
corepack pnpm test:erp
```

集成测试覆盖采购确认、按行分批出入库、盘点、增量应收应付、收付款、重复单号与权限隔离。测试**会写入所连接的数据库**，只能对独立测试环境运行。GitHub 的 [Build 工作流](.github/workflows/build.yml)负责构建检查；API 镜像工作流见[配置](.github/workflows/api-image.yml)。参与开发见[CONTRIBUTING.md](CONTRIBUTING.md)。

## 当前边界与文档

- 税务发票、退货、多仓库、序列号追溯、复杂 BOM 和多币种尚未实现；ERP 不应替代专门的 MES 生产流程。
- 飞书、钉钉、企业微信接入尚未完成；模型建议的实际质量仍需使用者验证。
- [文档路由](apps/electronics-erp/AGENTS.md) · [技术设计](apps/electronics-erp/docs/02-技术设计.md) · [界面与验收](apps/electronics-erp/docs/03-界面与验收.md)
- 源码采用 [Apache-2.0](LICENSE)；安全问题请按 [SECURITY.md](SECURITY.md) 私密报告。
