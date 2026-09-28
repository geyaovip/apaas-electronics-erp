import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, date } from './api';
import type { Balance, Contract, Line, Purchase, StockDocument } from './api';

type Kind = 'purchase' | 'contract';

export function StockBatch({ kind, document, onDone }: { kind: Kind; document: Purchase | Contract; onDone: () => void }) {
  const isReceipt = kind === 'purchase';
  const processed = (line: Line) => isReceipt ? line.receivedQty ?? 0 : line.shippedQty ?? 0;
  const [number, setNumber] = useState(`${isReceipt ? 'GRN' : 'DN'}-${document.number}-${document.version}`);
  const [note, setNote] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNumber(`${isReceipt ? 'GRN' : 'DN'}-${document.number}-${document.version}`); setQuantities({}); }, [document.id, document.version, isReceipt]);
  const remaining = (document.lines ?? []).filter(line => processed(line) < line.quantity);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const lines = remaining.map(line => ({ line_id: line.id, quantity: Number(quantities[line.id] || 0) })).filter(line => line.quantity > 0);
    if (!lines.length) { setError('请至少填写一项本次数量'); return; }
    setBusy(true);
    try {
      await api(`/${isReceipt ? 'purchases' : 'contracts'}/${document.id}/${isReceipt ? 'receive' : 'ship'}`, { version: document.version, document_number: number, note, lines });
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : '提交失败'); }
    finally { setBusy(false); }
  }
  return <form className="form batch-form" onSubmit={submit}><p className="muted">按产品填写本次{isReceipt ? '入库' : '出库'}数量；未填写的产品保留待处理。</p><label className="field"><span>{isReceipt ? '入库单号' : '出库单号'}</span><input value={number} onChange={e => setNumber(e.target.value)} required/></label>{remaining.map(line => <label className="field" key={line.id}><span>{line.sku} · {line.name}（已{isReceipt ? '入库' : '出库'} {processed(line)} / {line.quantity}，剩余 {line.quantity - processed(line)}）</span><input type="number" min="0" max={line.quantity - processed(line)} step="1" value={quantities[line.id] ?? ''} onChange={e => setQuantities(values => ({ ...values, [line.id]: e.target.value }))} placeholder="本次数量"/></label>)}<button type="button" className="text-button" onClick={() => setQuantities(Object.fromEntries(remaining.map(line => [line.id, String(line.quantity - processed(line))])))}>填入全部剩余</button><label className="field"><span>批次备注</span><textarea value={note} onChange={e => setNote(e.target.value)} rows={2}/></label>{error && <div className="notice error" role="alert">{error}</div>}<button className="button primary full" disabled={busy}>{busy ? '处理中…' : `确认本批${isReceipt ? '入库' : '出库'}`}</button></form>;
}

export function StockDocuments({ documents, title = '批次记录' }: { documents: StockDocument[]; title?: string }) {
  return <section className="panel"><h2>{title}</h2>{documents.length ? <div className="record-list">{documents.map(document => <div className="record" key={document.id}><div><strong>{document.number}</strong><span>{date(document.createdAt)}{document.note ? ` · ${document.note}` : ''}</span>{document.movements.length ? document.movements.map(movement => <small key={movement.id}>{movement.product.sku} · {movement.product.name} · {movement.direction === 'out' ? '−' : '+'}{movement.quantity} 件</small>) : <small>本次无账实差异</small>}</div><span className="badge">{document.kind === 'receipt' ? '入库' : document.kind === 'shipment' ? '出库' : '盘点'}</span></div>)}</div> : <p className="muted">暂无记录</p>}</section>;
}

export function StocktakeForm({ balances, onDone }: { balances: Balance[]; onDone: () => void }) {
  const [number, setNumber] = useState(`ST-${Date.now().toString(36).toUpperCase()}`);
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<{ product_id: string; counted_qty: string }[]>([{ product_id: '', counted_qty: '' }]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function change(index: number, patch: Partial<{ product_id: string; counted_qty: string }>) { setLines(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row)); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      await api('/inventory/stocktakes', { document_number: number, note, lines: lines.map(line => ({ product_id: line.product_id, counted_qty: Number(line.counted_qty) })) });
      setNumber(`ST-${Date.now().toString(36).toUpperCase()}`); setLines([{ product_id: '', counted_qty: '' }]); setNote(''); onDone();
    } catch (e) { setError(e instanceof Error ? e.message : '盘点失败'); }
    finally { setBusy(false); }
  }
  return <section className="panel"><h2>库存盘点</h2><p className="muted">填写实盘数量。系统会记录账面差异并生成调整流水；相同数量也会保留盘点单。</p><form className="form" onSubmit={submit}><label className="field"><span>盘点单号</span><input value={number} onChange={e => setNumber(e.target.value)} required/></label>{lines.map((line, index) => <div className="stocktake-line" key={index}><label className="field"><span>产品</span><select value={line.product_id} onChange={e => change(index, { product_id: e.target.value })} required><option value="">请选择</option>{balances.map(balance => <option key={balance.productId} value={balance.productId}>{balance.product.sku} · {balance.product.name}（账面 {balance.quantity}）</option>)}</select></label><label className="field"><span>实盘数量</span><input type="number" min="0" step="1" value={line.counted_qty} onChange={e => change(index, { counted_qty: e.target.value })} required/></label><button type="button" className="icon-button" aria-label="删除本行" disabled={lines.length===1} onClick={() => setLines(rows => rows.filter((_, i) => i!==index))}>×</button></div>)}<button type="button" className="text-button" onClick={() => setLines(rows => [...rows, { product_id: '', counted_qty: '' }])}>添加产品</button><label className="field"><span>差异说明</span><textarea rows={2} value={note} onChange={e => setNote(e.target.value)}/></label>{error && <div className="notice error" role="alert">{error}</div>}<button className="button primary" disabled={busy}>确认盘点并调整库存</button></form></section>;
}
