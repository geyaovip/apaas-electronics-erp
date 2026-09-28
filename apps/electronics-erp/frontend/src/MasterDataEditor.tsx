import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from './api';
import type { Customer, Product, Supplier } from './api';

type RecordToEdit =
  | { kind: 'customer'; item: Customer }
  | { kind: 'product'; item: Product }
  | { kind: 'supplier'; item: Supplier };

export function MasterDataEditor({ record, close, done }: { record: RecordToEdit; close: () => void; done: () => void }) {
  const { kind, item } = record;
  const [name, setName] = useState(item.name);
  const [contact, setContact] = useState(kind === 'product' ? '' : item.contactName || '');
  const [phone, setPhone] = useState(kind === 'product' ? '' : item.phone || '');
  const [industry, setIndustry] = useState(kind === 'customer' ? item.industry || '' : '');
  const [category, setCategory] = useState(kind === 'product' ? item.category || '' : '');
  const [purchase, setPurchase] = useState(kind === 'product' ? item.purchasePrice : '');
  const [sale, setSale] = useState(kind === 'product' ? item.salePrice : '');
  const [reorder, setReorder] = useState(kind === 'product' ? String(item.reorderPoint) : '0');
  const [active, setActive] = useState(item.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, close]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = kind === 'customer'
        ? { name, contact_name: contact, phone, industry, active }
        : kind === 'product'
          ? { name, category, purchase_price: purchase, sale_price: sale, reorder_point: Number(reorder), active }
          : { name, contact_name: contact, phone, active };
      await api(`/${kind === 'customer' ? 'customers' : kind === 'product' ? 'products' : 'suppliers'}/${item.id}`, body, 'PATCH');
      done();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }
  const title = kind === 'customer' ? '编辑客户' : kind === 'product' ? '编辑产品' : '编辑供应商';
  const code = kind === 'product' ? item.sku : item.code;
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) close(); }}>
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><h2>{title}</h2><button className="icon-button" type="button" onClick={close} aria-label="关闭" disabled={busy}>×</button></div>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>{kind === 'product' ? 'SKU' : '编号'}</span><input value={code} disabled/></label>
        <label className="field"><span>名称</span><input value={name} onChange={event => setName(event.target.value)} required maxLength={120}/></label>
        {kind !== 'product' && <div className="form-grid"><label className="field"><span>联系人</span><input value={contact} onChange={event => setContact(event.target.value)} maxLength={100}/></label><label className="field"><span>电话</span><input value={phone} onChange={event => setPhone(event.target.value)} maxLength={50}/></label></div>}
        {kind === 'customer' && <label className="field"><span>行业</span><input value={industry} onChange={event => setIndustry(event.target.value)} maxLength={100}/></label>}
        {kind === 'product' && <><label className="field"><span>类别</span><input value={category} onChange={event => setCategory(event.target.value)} maxLength={100}/></label><div className="form-grid"><label className="field"><span>采购单价（CNY）</span><input type="number" min="0" step="0.01" value={purchase} onChange={event => setPurchase(event.target.value)} required/></label><label className="field"><span>销售单价（CNY）</span><input type="number" min="0" step="0.01" value={sale} onChange={event => setSale(event.target.value)} required/></label></div><label className="field"><span>补货提醒点（件）</span><input type="number" min="0" step="1" value={reorder} onChange={event => setReorder(event.target.value)} required/></label></>}
        <label className="field"><span>状态</span><select value={active ? 'active' : 'inactive'} onChange={event => setActive(event.target.value === 'active')}><option value="active">启用</option><option value="inactive">停用</option></select></label>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div className="modal-actions"><button type="button" className="button secondary" onClick={close} disabled={busy}>取消</button><button className="button primary" disabled={busy}>{busy ? '保存中…' : '保存修改'}</button></div>
      </form>
    </div>
  </div>;
}
