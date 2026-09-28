import { Injectable } from '@nestjs/common';
import { Prisma } from './generated/client';
import { z } from 'zod';
import { Actor, fail, id, label, parse, requireRole } from './common';
import { PrismaService } from './prisma.service';

const batchInput = z.object({
  version: z.number().int().positive(),
  document_number: label(80).optional(),
  note: z.string().max(2000).optional(),
  lines: z.array(z.object({ line_id: id, quantity: z.number().int().positive() })).min(1).max(100).optional(),
}).refine(value => !value.lines || new Set(value.lines.map(line => line.line_id)).size === value.lines.length, '同一行不能重复提交');
const stocktakeInput = z.object({
  document_number: label(80), note: z.string().max(2000).optional(),
  lines: z.array(z.object({ product_id: id, counted_qty: z.number().int().min(0) })).min(1).max(100),
}).refine(value => new Set(value.lines.map(line => line.product_id)).size === value.lines.length, '同一产品不能重复盘点');

@Injectable()
export class StockService {
  constructor(private db: PrismaService) {}

  async stocktake(actor: Actor, body: unknown) {
    requireRole(actor, 'admin', 'warehouse');
    const input = parse(stocktakeInput, body);
    return this.db.$transaction(async tx => {
      const balances = await tx.inventoryBalance.findMany({ where: { tenantId: actor.tenantId, productId: { in: input.lines.map(line => line.product_id) } } });
      if (balances.length !== input.lines.length) fail('PRODUCT_INVALID', '盘点产品不存在', 404);
      const document = await tx.stockDocument.create({ data: { tenantId: actor.tenantId, number: input.document_number, kind: 'stocktake', sourceId: 'inventory', note: input.note, actorId: actor.id } });
      const changes: { productId: string; before: number; after: number }[] = [];
      for (const line of input.lines) {
        const balance = balances.find(item => item.productId === line.product_id)!;
        const changed = await tx.inventoryBalance.updateMany({ where: { tenantId: actor.tenantId, productId: line.product_id, quantity: balance.quantity }, data: { quantity: line.counted_qty } });
        if (!changed.count) fail('VERSION_CONFLICT', '库存已变化，请刷新后重新盘点', 409);
        const delta = line.counted_qty - balance.quantity;
        changes.push({ productId: line.product_id, before: balance.quantity, after: line.counted_qty });
        if (delta !== 0) await tx.stockMovement.create({ data: { tenantId: actor.tenantId, productId: line.product_id, direction: delta > 0 ? 'in' : 'out', quantity: Math.abs(delta), sourceType: 'stocktake', sourceId: document.id, documentId: document.id, actorId: actor.id } });
      }
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, actorId: actor.id, action: 'inventory.stocktaken', resourceType: 'stock_document', resourceId: document.id, detail: { documentNumber: document.number, changes } as Prisma.InputJsonObject } });
      return tx.stockDocument.findUniqueOrThrow({ where: { id: document.id }, include: { movements: { include: { product: { select: { sku: true, name: true } } } } } });
    });
  }

  async receive(actor: Actor, orderId: string, body: unknown) {
    requireRole(actor, 'admin', 'warehouse');
    const input = parse(batchInput, body);
    const order = await this.db.purchaseOrder.findFirst({ where: { id: orderId, tenantId: actor.tenantId }, include: { lines: true } });
    if (!order) fail('NOT_FOUND', '采购单不存在', 404);
    if (!['ordered', 'partial_received'].includes(order.status)) fail('PURCHASE_STATE', '采购单尚未确认或已全部入库', 409);
    const lines = input.lines ?? order.lines.filter(line => line.receivedQty < line.quantity).map(line => ({ line_id: line.id, quantity: line.quantity - line.receivedQty }));
    if (!lines.length) fail('PURCHASE_STATE', '采购单已全部入库', 409);
    for (const selected of lines) {
      const line = order.lines.find(item => item.id === selected.line_id);
      if (!line || selected.quantity > line.quantity - line.receivedQty) fail('RECEIVE_QUANTITY', '入库数量超过该行剩余数量', 409);
    }
    const complete = order.lines.every(line => line.receivedQty + (lines.find(item => item.line_id === line.id)?.quantity ?? 0) === line.quantity);
    const amount = lines.reduce((sum, selected) => sum.plus(order.lines.find(line => line.id === selected.line_id)!.unitPrice.mul(selected.quantity)), new Prisma.Decimal(0));
    return this.db.$transaction(async tx => {
      const changed = await tx.purchaseOrder.updateMany({ where: { id: orderId, tenantId: actor.tenantId, status: { in: ['ordered', 'partial_received'] }, version: input.version }, data: { status: complete ? 'received' : 'partial_received', version: { increment: 1 } } });
      if (!changed.count) fail('VERSION_CONFLICT', '采购单已变化，请刷新后重试', 409);
      const document = await tx.stockDocument.create({ data: { tenantId: actor.tenantId, number: input.document_number ?? `GRN-${order.number}-${input.version}`, kind: 'receipt', sourceId: orderId, note: input.note, actorId: actor.id } });
      for (const selected of lines) {
        const line = order.lines.find(item => item.id === selected.line_id)!;
        const updated = await tx.purchaseLine.updateMany({ where: { id: line.id, receivedQty: line.receivedQty }, data: { receivedQty: { increment: selected.quantity } } });
        if (!updated.count) fail('VERSION_CONFLICT', '采购明细已变化，请刷新后重试', 409);
        await tx.inventoryBalance.update({ where: { productId: line.productId }, data: { quantity: { increment: selected.quantity } } });
        await tx.stockMovement.create({ data: { tenantId: actor.tenantId, productId: line.productId, direction: 'in', quantity: selected.quantity, sourceType: 'purchase', sourceId: orderId, documentId: document.id, actorId: actor.id } });
      }
      const account = await tx.payable.findUnique({ where: { orderId } });
      if (account) await tx.payable.update({ where: { id: account.id }, data: { amount: { increment: amount }, status: account.paidAmount.gt(0) ? 'partial' : 'open' } });
      else await tx.payable.create({ data: { tenantId: actor.tenantId, orderId, amount } });
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, actorId: actor.id, action: 'purchase.received', resourceType: 'purchase', resourceId: orderId, detail: { documentNumber: document.number, amount: amount.toFixed(2), lines, complete } as Prisma.InputJsonObject } });
      return tx.purchaseOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true, payable: true } });
    });
  }

  async ship(actor: Actor, contractId: string, body: unknown) {
    requireRole(actor, 'admin', 'warehouse');
    const input = parse(batchInput, body);
    const contract = await this.db.salesContract.findFirst({ where: { id: contractId, tenantId: actor.tenantId }, include: { lines: true } });
    if (!contract) fail('NOT_FOUND', '销售合同不存在', 404);
    if (!['confirmed', 'partial_shipped'].includes(contract.status)) fail('CONTRACT_STATE', '合同尚未确认或已全部出库', 409);
    const lines = input.lines ?? contract.lines.filter(line => line.shippedQty < line.quantity).map(line => ({ line_id: line.id, quantity: line.quantity - line.shippedQty }));
    if (!lines.length) fail('CONTRACT_STATE', '合同已全部出库', 409);
    for (const selected of lines) {
      const line = contract.lines.find(item => item.id === selected.line_id);
      if (!line || selected.quantity > line.quantity - line.shippedQty) fail('SHIP_QUANTITY', '出库数量超过该行剩余数量', 409);
    }
    const complete = contract.lines.every(line => line.shippedQty + (lines.find(item => item.line_id === line.id)?.quantity ?? 0) === line.quantity);
    const amount = lines.reduce((sum, selected) => sum.plus(contract.lines.find(line => line.id === selected.line_id)!.unitPrice.mul(selected.quantity)), new Prisma.Decimal(0));
    return this.db.$transaction(async tx => {
      const changed = await tx.salesContract.updateMany({ where: { id: contractId, tenantId: actor.tenantId, status: { in: ['confirmed', 'partial_shipped'] }, version: input.version }, data: { status: complete ? 'shipped' : 'partial_shipped', version: { increment: 1 } } });
      if (!changed.count) fail('VERSION_CONFLICT', '合同已变化，请刷新后重试', 409);
      const document = await tx.stockDocument.create({ data: { tenantId: actor.tenantId, number: input.document_number ?? `DN-${contract.number}-${input.version}`, kind: 'shipment', sourceId: contractId, note: input.note, actorId: actor.id } });
      for (const selected of lines) {
        const line = contract.lines.find(item => item.id === selected.line_id)!;
        const deducted = await tx.inventoryBalance.updateMany({ where: { tenantId: actor.tenantId, productId: line.productId, quantity: { gte: selected.quantity } }, data: { quantity: { decrement: selected.quantity } } });
        if (!deducted.count) fail('INSUFFICIENT_STOCK', `${line.name} 库存不足，本批未出库`, 409);
        const updated = await tx.salesLine.updateMany({ where: { id: line.id, shippedQty: line.shippedQty }, data: { shippedQty: { increment: selected.quantity } } });
        if (!updated.count) fail('VERSION_CONFLICT', '合同明细已变化，请刷新后重试', 409);
        await tx.stockMovement.create({ data: { tenantId: actor.tenantId, productId: line.productId, direction: 'out', quantity: selected.quantity, sourceType: 'contract', sourceId: contractId, documentId: document.id, actorId: actor.id } });
      }
      const account = await tx.receivable.findUnique({ where: { contractId } });
      if (account) await tx.receivable.update({ where: { id: account.id }, data: { amount: { increment: amount }, status: account.paidAmount.gt(0) ? 'partial' : 'open' } });
      else await tx.receivable.create({ data: { tenantId: actor.tenantId, contractId, amount } });
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, actorId: actor.id, action: 'contract.shipped', resourceType: 'contract', resourceId: contractId, detail: { documentNumber: document.number, amount: amount.toFixed(2), lines, complete } as Prisma.InputJsonObject } });
      return tx.salesContract.findUniqueOrThrow({ where: { id: contractId }, include: { lines: true, receivable: true } });
    });
  }
}
