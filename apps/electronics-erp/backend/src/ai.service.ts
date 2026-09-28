import { Injectable } from '@nestjs/common';
import { Prisma } from './generated/client';
import { z } from 'zod';
import { Actor, AppError, hash, parse } from './common';
import { PrismaService } from './prisma.service';
import { ErpService } from './erp.service';
import { AiTurn, generateAiAnswer } from './ai-model';
import { aiStatus, clearAiSettings, publicAiSettings, resolveAiConnection, saveAiSettings, testAiSettings } from './ai-settings';

const chatInput = z.object({ conversation_id: z.string().uuid().optional(), context_type: z.enum(['dashboard', 'purchase', 'contract']), context_id: z.string().uuid().optional(), message: z.string().trim().min(2).max(2000) });
type ContextType = z.infer<typeof chatInput>['context_type'];
const reviewInput = z.object({ context_type: z.enum(['purchase', 'contract']), context_id: z.string().uuid() });
const narrativeSchema = z.object({ summary: z.string().min(1).max(1200), actions: z.array(z.string().min(1).max(300)).max(5), missing_data: z.array(z.string().min(1).max(300)).max(5) });
const narrativeFormat = { name: 'erp_risk_review', schema: { type: 'object', additionalProperties: false, required: ['summary', 'actions', 'missing_data'], properties: { summary: { type: 'string' }, actions: { type: 'array', items: { type: 'string' } }, missing_data: { type: 'array', items: { type: 'string' } } } } };
type PurchaseFactsInput = { lines: { sku: string; quantity: number; receivedQty: number }[] };
type ContractFactsInput = { lines: { sku: string; quantity: number; shippedQty: number }[]; balances: { sku: string; quantity: number }[] };

@Injectable()
export class AiService {
  constructor(private db: PrismaService, private erp: ErpService) {}
  status(actor: Actor) { return aiStatus(this.db, actor.tenantId); }
  settings(actor: Actor) { return publicAiSettings(this.db, actor); }
  saveSettings(actor: Actor, body: unknown) { return saveAiSettings(this.db, actor, body); }
  testSettings(actor: Actor, body: unknown) { return testAiSettings(this.db, actor, body); }
  clearSettings(actor: Actor) { return clearAiSettings(this.db, actor); }
  private async answer(actor: Actor, instructions: string, context: unknown, turns: AiTurn[], format?: { name: string; schema: Record<string, unknown> }) {
    return generateAiAnswer(await resolveAiConnection(this.db, actor.tenantId), instructions, context, turns, format);
  }

  private async context(actor: Actor, type: ContextType, id?: string) {
    if (type !== 'dashboard' && !id) throw new AppError('VALIDATION_ERROR', '请选择业务记录后再提问', 400);
    if (type === 'purchase') {
      const order = await this.erp.getPurchase(actor, id!);
      const productIds = order.lines.map(line => line.productId);
      const balances = await this.db.inventoryBalance.findMany({ where: { tenantId: actor.tenantId, productId: { in: productIds } }, include: { product: { select: { sku: true, name: true, reorderPoint: true } } } });
      return { title: `采购单 · ${order.number}`, href: `/purchases/${id}`, data: { number: order.number, status: order.status, supplier: order.supplier.name, lines: order.lines.map(line => ({ sku: line.sku, name: line.name, quantity: line.quantity, receivedQty: line.receivedQty })), balances: balances.map(balance => ({ sku: balance.product.sku, quantity: balance.quantity, reorderPoint: balance.product.reorderPoint })) } };
    }
    if (type === 'contract') {
      const contract = await this.erp.getContract(actor, id!);
      const productIds = contract.lines.map(line => line.productId);
      const [balances, incoming] = await Promise.all([
        this.db.inventoryBalance.findMany({ where: { tenantId: actor.tenantId, productId: { in: productIds } }, include: { product: { select: { sku: true, name: true, reorderPoint: true } } } }),
        actor.role === 'sales' ? Promise.resolve([]) : this.db.purchaseLine.findMany({ where: { productId: { in: productIds }, order: { tenantId: actor.tenantId, status: { in: ['ordered', 'partial_received'] } } }, include: { order: { select: { number: true, status: true } } } }),
      ]);
      return { title: `销售合同 · ${contract.number}`, href: `/contracts/${id}`, data: { number: contract.number, status: contract.status, customer: contract.customer.name, lines: contract.lines.map(line => ({ sku: line.sku, name: line.name, quantity: line.quantity, shippedQty: line.shippedQty })), balances: balances.map(balance => ({ sku: balance.product.sku, quantity: balance.quantity, reorderPoint: balance.product.reorderPoint })), openPurchases: incoming.map(line => ({ number: line.order.number, sku: line.sku, quantity: line.quantity, receivedQty: line.receivedQty, status: line.order.status })) } };
    }
    return { title: '经营概览', href: '/', data: await this.erp.dashboard(actor) };
  }

  async list(actor: Actor) {
    const rows = await this.db.aiConversation.findMany({ where: { tenantId: actor.tenantId, userId: actor.id }, orderBy: { updatedAt: 'desc' }, take: 20, select: { id: true, contextType: true, contextId: true, title: true, updatedAt: true } });
    const checked = await Promise.allSettled(rows.map(async row => { await this.context(actor, row.contextType as ContextType, row.contextId || undefined); return row; }));
    return checked.filter((item): item is PromiseFulfilledResult<typeof rows[number]> => item.status === 'fulfilled').map(item => item.value);
  }
  async get(actor: Actor, id: string) {
    const row = await this.db.aiConversation.findFirst({ where: { id, tenantId: actor.tenantId, userId: actor.id } });
    if (!row) throw new AppError('NOT_FOUND', '对话不存在', 404);
    await this.context(actor, row.contextType as ContextType, row.contextId || undefined);
    return row;
  }
  async remove(actor: Actor, id: string) {
    const row = await this.db.aiConversation.findFirst({ where: { id, tenantId: actor.tenantId, userId: actor.id }, select: { id: true } });
    if (!row) throw new AppError('NOT_FOUND', '对话不存在', 404);
    await this.db.aiConversation.delete({ where: { id: row.id } });
    return { ok: true };
  }

  private facts(type: 'purchase' | 'contract', data: unknown) {
    if (type === 'purchase') return (data as PurchaseFactsInput).lines.map(line => ({ sku: line.sku, ordered: line.quantity, received: line.receivedQty, remaining: Math.max(0, line.quantity - line.receivedQty) }));
    const contract = data as ContractFactsInput;
    return contract.lines.map(line => {
      const pending = Math.max(0, line.quantity - line.shippedQty);
      const available = contract.balances.find(balance => balance.sku === line.sku)?.quantity ?? 0;
      return { sku: line.sku, pending, available, currentShortfall: Math.max(0, pending - available) };
    });
  }

  async latestRiskReview(actor: Actor, type: string, id: string) {
    const input = parse(reviewInput, { context_type: type, context_id: id });
    const source = await this.context(actor, input.context_type, input.context_id);
    const sourceHash = hash(JSON.stringify(source.data));
    const rows = await this.db.auditLog.findMany({ where: { tenantId: actor.tenantId, actorId: actor.id, action: 'ai.risk_review', resourceType: 'ai_risk_review', resourceId: id }, orderBy: { createdAt: 'desc' }, take: 5 });
    const row = rows.find(item => { const detail = item.detail as { contextType?: string; sourceHash?: string } | null; return detail?.contextType === type && detail.sourceHash === sourceHash; });
    const detail = row?.detail as { review?: z.infer<typeof narrativeSchema> & { facts: unknown[] } } | null;
    return { review: detail?.review || null, reviewed_at: row?.createdAt || null };
  }

  async reviewRisk(actor: Actor, body: unknown) {
    const input = parse(reviewInput, body);
    const source = await this.context(actor, input.context_type, input.context_id);
    const sourceHash = hash(JSON.stringify(source.data));
    const facts = this.facts(input.context_type, source.data);
    const raw = await this.answer(actor, '你是电子行业 ERP 履约分析助手。依据给定的订单进度、库存和可见采购数据解释风险。不要预测具体到货日期，不要把当前库存视为已预留。actions 只能是人工可审查的建议，不得声称已下单、入库、出库或记账。', { source: source.data, calculatedFacts: facts }, [{ role: 'user', content: '请说明当前单据的履约风险和待核实事项。' }], narrativeFormat);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new AppError('AI_INVALID_OUTPUT', 'AI 分析结果格式无效，请重试', 502); }
    const narrative = narrativeSchema.safeParse(parsed);
    if (!narrative.success) throw new AppError('AI_INVALID_OUTPUT', 'AI 分析结果格式无效，请重试', 502);
    const fresh = await this.context(actor, input.context_type, input.context_id);
    if (hash(JSON.stringify(fresh.data)) !== sourceHash) throw new AppError('VERSION_CONFLICT', '单据或库存已更新，请重新分析', 409);
    const review = { ...narrative.data, facts };
    const row = await this.db.auditLog.create({ data: { tenantId: actor.tenantId, actorId: actor.id, action: 'ai.risk_review', resourceType: 'ai_risk_review', resourceId: input.context_id, detail: { contextType: input.context_type, sourceHash, model: (await resolveAiConnection(this.db, actor.tenantId))?.model, review } as Prisma.InputJsonValue } });
    return { review, reviewed_at: row.createdAt, source: { title: source.title, href: source.href } };
  }
  async chat(actor: Actor, body: unknown) {
    const input = parse(chatInput, body);
    const source = await this.context(actor, input.context_type, input.context_id);
    const old = input.conversation_id ? await this.get(actor, input.conversation_id) : null;
    if (old && (old.contextType !== input.context_type || old.contextId !== (input.context_id || null))) throw new AppError('AI_CONTEXT_CHANGED', '业务对象已切换，请新建对话', 409);
    const history = (old?.messages || []) as AiTurn[];
    const prompt = [...history, { role: 'user' as const, content: input.message }];
    const answer = await this.answer(actor, '你是电子行业 ERP 业务助手。只分析订单已收或已发数量、当前库存与已确认采购。可以指出当前库存不足或采购未收齐，但没有供应商交期数据，不能预测具体到货日期。金额与财务数据仅按提供的信息回答。不得自动下单、入库、出库或记账。', { source: source.title, data: source.data }, prompt);
    const messages = [...prompt, { role: 'assistant' as const, content: answer }].slice(-20);
    let conversation;
    if (old) {
      const changed = await this.db.aiConversation.updateMany({ where: { id: old.id, tenantId: actor.tenantId, userId: actor.id, version: old.version }, data: { messages: messages as Prisma.InputJsonValue, version: { increment: 1 } } });
      if (!changed.count) throw new AppError('VERSION_CONFLICT', '对话已更新，请刷新后重试', 409);
      conversation = await this.db.aiConversation.findUniqueOrThrow({ where: { id: old.id } });
    } else conversation = await this.db.aiConversation.create({ data: { tenantId: actor.tenantId, userId: actor.id, contextType: input.context_type, contextId: input.context_id, title: source.title, messages: messages as Prisma.InputJsonValue } });
    await this.db.auditLog.create({ data: { tenantId: actor.tenantId, actorId: actor.id, action: 'ai.chat', resourceType: 'ai_conversation', resourceId: conversation.id, detail: { contextType: input.context_type, contextId: input.context_id || null, model: (await resolveAiConnection(this.db, actor.tenantId))?.model } } });
    return { conversation_id: conversation.id, answer, messages, sources: [{ title: source.title, href: source.href }] };
  }
}
