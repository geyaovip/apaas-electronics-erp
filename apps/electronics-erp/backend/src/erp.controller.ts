import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthRequest, SessionGuard } from './common';
import { PrismaService } from './prisma.service';
import { ErpService } from './erp.service';

@Controller('api/v1') @UseGuards(SessionGuard)
export class ErpController {
  constructor(private erp: ErpService) {}
  @Get('customers') customers(@Req() r: AuthRequest, @Query() q: Record<string,unknown>) { return this.erp.listCustomers(r.actor,q); }
  @Post('customers') createCustomer(@Req() r: AuthRequest, @Body() b: unknown) { return this.erp.createCustomer(r.actor,b); }
  @Get('customers/:id') customer(@Req() r: AuthRequest, @Param('id') id: string) { return this.erp.getCustomer(r.actor,id); }
  @Get('opportunities') opportunities(@Req() r: AuthRequest) { return this.erp.listOpportunities(r.actor); }
  @Post('opportunities') createOpportunity(@Req() r: AuthRequest, @Body() b: unknown) { return this.erp.createOpportunity(r.actor,b); }
  @Post('opportunities/:id/stage') changeOpportunity(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.erp.changeOpportunity(r.actor,id,b); }
  @Get('products') products(@Req() r: AuthRequest) { return this.erp.listProducts(r.actor); }
  @Post('products') createProduct(@Req() r: AuthRequest, @Body() b: unknown) { return this.erp.createProduct(r.actor,b); }
  @Get('suppliers') suppliers(@Req() r: AuthRequest) { return this.erp.listSuppliers(r.actor); }
  @Post('suppliers') createSupplier(@Req() r: AuthRequest, @Body() b: unknown) { return this.erp.createSupplier(r.actor,b); }
  @Get('purchases') purchases(@Req() r: AuthRequest, @Query() q: Record<string,unknown>) { return this.erp.listPurchases(r.actor,q); }
  @Post('purchases') createPurchase(@Req() r: AuthRequest, @Body() b: unknown) { return this.erp.createPurchase(r.actor,b); }
  @Get('purchases/:id') purchase(@Req() r: AuthRequest, @Param('id') id: string) { return this.erp.getPurchase(r.actor,id); }
  @Post('purchases/:id/confirm') confirmPurchase(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.erp.confirmPurchase(r.actor,id,b); }
  @Post('purchases/:id/receive') receivePurchase(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.erp.receivePurchase(r.actor,id,b); }
  @Get('contracts') contracts(@Req() r: AuthRequest, @Query() q: Record<string,unknown>) { return this.erp.listContracts(r.actor,q); }
  @Post('contracts') createContract(@Req() r: AuthRequest, @Body() b: unknown) { return this.erp.createContract(r.actor,b); }
  @Get('contracts/:id') contract(@Req() r: AuthRequest, @Param('id') id: string) { return this.erp.getContract(r.actor,id); }
  @Post('contracts/:id/confirm') confirmContract(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.erp.confirmContract(r.actor,id,b); }
  @Post('contracts/:id/ship') shipContract(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.erp.shipContract(r.actor,id,b); }
  @Get('inventory') inventory(@Req() r: AuthRequest) { return this.erp.inventory(r.actor); }
  @Get('inventory/movements-page') movementsPage(@Req() r: AuthRequest, @Query() q: Record<string,unknown>) { return this.erp.movementsPage(r.actor,q); }
  @Get('inventory/documents-page') documentsPage(@Req() r: AuthRequest, @Query() q: Record<string,unknown>) { return this.erp.stockDocumentsPage(r.actor,q); }
  @Get('inventory/movements') movements(@Req() r: AuthRequest, @Query() q: Record<string,unknown>) { return this.erp.movements(r.actor,q); }
  @Get('inventory/documents') documents(@Req() r: AuthRequest) { return this.erp.listStockDocuments(r.actor); }
  @Post('inventory/stocktakes') stocktake(@Req() r: AuthRequest, @Body() b: unknown) { return this.erp.stocktake(r.actor,b); }
  @Get('finance/receivables') receivables(@Req() r: AuthRequest) { return this.erp.receivables(r.actor); }
  @Get('finance/payables') payables(@Req() r: AuthRequest) { return this.erp.payables(r.actor); }
  @Post('finance/receivables/:id/payments') receivePayment(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.erp.recordPayment(r.actor,'receivable',id,b); }
  @Post('finance/payables/:id/payments') makePayment(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.erp.recordPayment(r.actor,'payable',id,b); }
  @Get('dashboard') dashboard(@Req() r: AuthRequest) { return this.erp.dashboard(r.actor); }
  @Get('admin/users') users(@Req() r: AuthRequest) { return this.erp.listUsers(r.actor); }
  @Post('admin/users') createUser(@Req() r: AuthRequest, @Body() b: unknown) { return this.erp.createUser(r.actor,b); }
}
@Controller('api/v1') export class HealthController { constructor(private db: PrismaService) {} @Get('health') async health() { await this.db.$queryRaw`SELECT 1`; return { ok:true, database:'ready' }; } }
