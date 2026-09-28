export type Role = 'admin'|'sales'|'purchasing'|'warehouse'|'finance';
export interface Session { user:{id:string;tenantId:string;name:string;email?:string;role:Role}; tenant:{slug:string;name:string} }
export interface User { id:string;name:string;email:string;role:Role;active:boolean }
export interface Customer { id:string;code:string;name:string;contactName?:string;phone?:string;industry?:string;active:boolean;opportunities?:Opportunity[];contracts?:Contract[] }
export interface Opportunity { id:string;name:string;stage:string;estimatedAmount:string;customerId:string;customer?:{name:string} }
export interface Product { id:string;sku:string;name:string;category?:string;salePrice:string;purchasePrice:string;reorderPoint:number;active:boolean;balance?:{quantity:number} }
export interface Supplier { id:string;code:string;name:string;contactName?:string;phone?:string;active:boolean }
export interface Line { id:string;productId:string;sku:string;name:string;quantity:number;receivedQty?:number;shippedQty?:number;unitPrice:string;lineTotal:string }
export interface StockDocument { id:string;number:string;kind:string;createdAt:string;note?:string;movements:Movement[] }
export interface Purchase { id:string;number:string;supplierId:string;supplier?:{id:string;name:string};status:string;total:string;note?:string;version:number;lines?:Line[];payable?:Account;stockDocuments?:StockDocument[] }
export interface Contract { id:string;number:string;customerId:string;customer?:{id:string;name:string};opportunityId?:string;status:string;total:string;note?:string;version:number;lines?:Line[];receivable?:Account;stockDocuments?:StockDocument[] }
export interface Payment { id:string;amount:string;reference:string;createdAt:string }
export interface Account { id:string;contractId?:string;orderId?:string;amount:string;paidAmount:string;status:string;contract?:{number:string;customer:{name:string}};order?:{number:string;supplier:{name:string}};payments?:Payment[] }
export interface Balance { id:string;productId:string;quantity:number;product:{sku:string;name:string;unit:string;reorderPoint:number} }
export interface Movement { id:string;direction:string;quantity:number;sourceType:string;sourceId:string;createdAt:string;product:{sku:string;name:string};document?:{number:string;kind:string} }
export interface Page<T> { items:T[];total:number }
export interface Dashboard { customers:number;active_opportunities:number;purchases_to_receive:number;contracts_to_ship:number;active_products:number;receivable_balance:string|null;payable_balance:string|null;amount_definition:string }
export class ApiError extends Error { constructor(public code:string,message:string,public status:number){super(message)} }
export async function api<T>(path:string,body?:unknown,method?:string):Promise<T>{const response=await fetch(`/api/v1${path}`,{method:method||(body===undefined?'GET':'POST'),credentials:'include',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json().catch(()=>({}));if(!response.ok)throw new ApiError(data.error?.code||'HTTP_ERROR',data.error?.message||`请求失败 (${response.status})`,response.status);return data as T;}
export const money=(value:string|number|undefined|null)=>`¥${Number(value||0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export const date=(value?:string)=>value?new Date(value).toLocaleDateString('zh-CN'):'—';
export const roleName:Record<string,string>={admin:'管理员',sales:'销售',purchasing:'采购',warehouse:'仓库',finance:'财务'};
export const purchaseStatus:Record<string,string>={draft:'草稿',ordered:'待入库',partial_received:'部分入库',received:'已入库'};
export const contractStatus:Record<string,string>={draft:'草稿',confirmed:'待出库',partial_shipped:'部分出库',shipped:'已出库'};
export const accountStatus:Record<string,string>={open:'未结清',partial:'部分结清',paid:'已结清'};
export const opportunityStatus:Record<string,string>={discovery:'发现需求',proposal:'方案报价',won:'已赢单',lost:'已输单'};
