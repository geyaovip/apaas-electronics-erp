import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from './api';

type Fact = { sku: string; ordered?: number; received?: number; remaining?: number; pending?: number; available?: number; currentShortfall?: number };
type Review = { summary: string; actions: string[]; missing_data: string[]; facts: Fact[] };

export function AiRiskReview({ kind, id }: { kind: 'purchase' | 'contract'; id: string }) {
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; api<{ review: Review | null }>(`/ai/risk-reviews/${kind}/${id}`).then(value => { if (active) setReview(value.review); }).catch(() => {}); return () => { active = false; }; }, [kind, id]);
  async function run() {
    setBusy(true); setError('');
    try { const value = await api<{ review: Review }>('/ai/risk-reviews', { context_type: kind, context_id: id }); setReview(value.review); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'AI 分析失败'); }
    finally { setBusy(false); }
  }
  return <section className="panel ai-insight"><div className="ai-insight-head"><h2><Sparkles size={17}/> AI 履约分析</h2><button type="button" className="button secondary" disabled={busy} onClick={() => void run()}>{busy ? '分析中…' : review ? '重新分析' : '分析当前单据'}</button></div><p className="muted">依据当前单据和可见库存数据。建议需人工核实，不会自动执行出入库。</p>{error && <div className="notice error" role="alert">{error}</div>}{review && <div className="ai-insight-body"><p>{review.summary}</p><strong>系统核算依据</strong><div className="record-list">{review.facts.map(fact => <div className="record" key={fact.sku}><div><strong>{fact.sku}</strong><span>{kind === 'purchase' ? `订购 ${fact.ordered} · 已收 ${fact.received} · 未收 ${fact.remaining}` : `待发 ${fact.pending} · 当前库存 ${fact.available} · 当前差额 ${fact.currentShortfall}`}</span></div></div>)}</div>{review.actions.length > 0 && <><strong>建议核实</strong><ul>{review.actions.map((action, index) => <li key={index}>{action}</li>)}</ul></>}{review.missing_data.length > 0 && <><strong>缺少的数据</strong><ul>{review.missing_data.map((item, index) => <li key={index}>{item}</li>)}</ul></>}</div>}</section>;
}
