import 'dotenv/config';
import assert from 'node:assert/strict';

const base = process.env.TEST_API_URL || 'http://127.0.0.1:4501/api/v1'; const tag = Date.now().toString(36); const password = `Erp-Test-${tag}-Strong!`; let cookie = '';
async function request(path, body, method = body === undefined ? 'GET' : 'POST') { const res = await fetch(base+path,{method,headers:{...(body === undefined ? {} : {'content-type':'application/json'}),...(cookie ? {cookie} : {})},body:body === undefined ? undefined : JSON.stringify(body)}); const value=await res.json(); return {status:res.status,value,cookie:res.headers.get('set-cookie')?.split(';')[0]||''}; }
async function ok(path,body) { const result=await request(path,body); assert.ok(result.status>=200&&result.status<300,`${path}: ${JSON.stringify(result.value)}`); return result.value; }
async function login(email,secret) { const result=await request('/auth/login',{workspace:'default',email,password:secret}); assert.equal(result.status,201,JSON.stringify(result.value)); cookie=result.cookie; }

await login(process.env.ERP_BOOTSTRAP_EMAIL,process.env.ERP_BOOTSTRAP_PASSWORD);
for (const [role,name] of [['sales','sales-a'],['sales','sales-b'],['purchasing','buyer'],['warehouse','keeper'],['finance','finance']]) await ok('/admin/users',{name:`${name}-${tag}`,email:`${name}-${tag}@test.local`,password,role});
await login(`buyer-${tag}@test.local`,password);
const product=await ok('/products',{sku:`PCB-${tag}`,name:'电子控制板',category:'主板',sale_price:'180.00',purchase_price:'120.50'});
const supplier=await ok('/suppliers',{code:`SUP-${tag}`,name:'华东电子元件供应商'});
const purchase=await ok('/purchases',{number:`PO-${tag}`,supplier_id:supplier.id,lines:[{product_id:product.id,quantity:5}]});
assert.equal(purchase.total,'602.5');
await ok(`/purchases/${purchase.id}/confirm`,{version:purchase.version});
await login(`sales-a-${tag}@test.local`,password);
const customer=await ok('/customers',{code:`CUS-${tag}`,name:'终端设备客户',contact_name:'张先生'});
const opp=await ok('/opportunities',{customer_id:customer.id,name:'控制板批量交付',estimated_amount:'720.00'});
await ok(`/opportunities/${opp.id}/stage`,{stage:'proposal'});
const contract=await ok('/contracts',{number:`SC-${tag}`,customer_id:customer.id,opportunity_id:opp.id,lines:[{product_id:product.id,quantity:4}]});
assert.equal(contract.total,'720');
await ok(`/contracts/${contract.id}/confirm`,{version:contract.version});
await login(`sales-b-${tag}@test.local`,password);
assert.equal((await request(`/customers/${customer.id}`)).status,404,'another sales user cannot view customer');
assert.equal((await request(`/contracts/${contract.id}`)).status,404,'another sales user cannot view contract');
await login(`keeper-${tag}@test.local`,password);
assert.equal((await request(`/contracts/${contract.id}/ship`,{version:2})).status,409,'cannot ship without stock');
assert.equal((await ok('/inventory')).find(x=>x.productId===product.id).quantity,0,'failed shipment must not deduct stock');
await ok(`/purchases/${purchase.id}/receive`,{version:2});
assert.equal((await request(`/purchases/${purchase.id}/receive`,{version:2})).status,409,'duplicate receiving blocked');
assert.equal((await ok('/inventory')).find(x=>x.productId===product.id).quantity,5);
await ok(`/contracts/${contract.id}/ship`,{version:2});
assert.equal((await request(`/contracts/${contract.id}/ship`,{version:2})).status,409,'duplicate shipping blocked');
assert.equal((await ok('/inventory')).find(x=>x.productId===product.id).quantity,1);
const movements=await ok('/inventory/movements'); assert.equal(movements.filter(x=>x.productId===product.id).length,2);
await login(`finance-${tag}@test.local`,password);
const receivable=(await ok('/finance/receivables')).find(x=>x.contractId===contract.id);
const payable=(await ok('/finance/payables')).find(x=>x.orderId===purchase.id);
assert.equal(receivable.amount,'720'); assert.equal(payable.amount,'602.5');
await ok(`/finance/receivables/${receivable.id}/payments`,{amount:'200.00',reference:`BANK-IN-${tag}-1`});
assert.equal((await request(`/finance/receivables/${receivable.id}/payments`,{amount:'600.00',reference:'OVER'})).status,409,'overpayment blocked');
await ok(`/finance/receivables/${receivable.id}/payments`,{amount:'520.00',reference:`BANK-IN-${tag}-2`});
await ok(`/finance/payables/${payable.id}/payments`,{amount:'602.50',reference:`BANK-OUT-${tag}`});
assert.equal((await ok('/finance/receivables')).find(x=>x.id===receivable.id).status,'paid');
assert.equal((await ok('/finance/payables')).find(x=>x.id===payable.id).status,'paid');
console.log('ERP core flow passed: purchase → inbound → stock → contract → outbound → receivable/payable → payments; role isolation, stock and duplicate protection.');
