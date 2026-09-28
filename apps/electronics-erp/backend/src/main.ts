import 'reflect-metadata';
import 'dotenv/config';
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { ApiErrorFilter, SessionGuard } from './common';
import { PrismaService } from './prisma.service';
import { AuthController } from './auth';
import { ErpController, HealthController } from './erp.controller';
import { ErpService } from './erp.service';
import { StockService } from './stock.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({ controllers: [AuthController, ErpController, AiController, HealthController], providers: [PrismaService, SessionGuard, ErpService, StockService, AiService] })
class AppModule implements NestModule { configure(consumer: MiddlewareConsumer) { consumer.apply((req: any, res: any, next: () => void) => { req.requestId = req.headers['x-request-id'] || randomUUID(); res.setHeader('X-Request-Id', req.requestId); next(); }).forRoutes('*'); } }

async function main() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.use(cookieParser()); app.useGlobalFilters(new ApiErrorFilter()); app.enableCors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:4500', credentials: true });
  const host = process.env.HOST || '127.0.0.1';
  await app.listen(Number(process.env.PORT || 4501), host);
  console.log(`ERP API ready on ${host}:${process.env.PORT || 4501}`);
}
main().catch(error => { console.error(error); process.exit(1); });
