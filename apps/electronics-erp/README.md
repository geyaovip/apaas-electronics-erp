# 电子行业 ERP

独立前端、NestJS API、PostgreSQL 数据库。当前覆盖客户与商机、产品 SKU、供应商、采购分批入库、销售合同分批出库、库存盘点与流水、应收应付和收付款。

## 推荐的本地部署

从仓库根目录运行 `node scripts/init-local.mjs` 和 `node scripts/start-local.mjs erp`。首次启动自动迁移、创建管理员；凭据在根目录 `.env`，登录只需邮箱和密码。详见[本地部署与运维](../../docs/08-开源本地部署.md)。

## 源码开发启动

在仓库根目录执行 `pnpm install`、`docker compose -f apps/electronics-erp/infra/compose.yaml up -d`，将 `apps/electronics-erp/backend/.env.example` 复制为 `.env` 并设置唯一的 `ERP_BOOTSTRAP_PASSWORD`（至少 12 位）。在 `apps/electronics-erp/backend/` 执行 `pnpm db:deploy`、`pnpm admin:create`、`pnpm build`、`pnpm start`；在 `apps/electronics-erp/frontend/` 执行 `pnpm dev`。打开 http://127.0.0.1:4500，使用管理员邮箱和密码登录。

`pnpm test:erp` 在运行中的本地 API 和数据库上验证采购、按行分批出入库、盘点、增量应收应付、收付款、重复单号、事务回滚与销售数据隔离；`pnpm build:erp` 构建前后端。本地成员登录、修改密码和管理员建号可独立使用。税务发票、退货、序列号追溯和复杂 BOM 不在当前业务范围。

开发测试可在仓库根目录运行 `pnpm local:seed`，在未提交的 `review-access.txt` 获取角色验收账号；正式部署不需要执行该命令。

AI 助手在登录后的右下角打开，采购单和销售合同详情自动带入当前记录、库存与角色允许查看的未收采购数据。单据详情另有结构化履约分析，将后端核算的数量依据和模型建议分开显示。建议只读，不能自动入库、出库或记账。后端 `.env` 同时配置 `OPENAI_API_KEY`、`OPENAI_MODEL` 后启用；真实模型质量尚未验收。
