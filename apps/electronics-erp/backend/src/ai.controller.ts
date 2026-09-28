import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthRequest, SessionGuard } from './common';
import { AiService } from './ai.service';

@Controller('api/v1/ai')
@UseGuards(SessionGuard)
export class AiController {
  constructor(private ai: AiService) {}
  @Get('status') status() { return this.ai.status(); }
  @Get('conversations') list(@Req() r: AuthRequest) { return this.ai.list(r.actor); }
  @Get('conversations/:id') get(@Req() r: AuthRequest, @Param('id') id: string) { return this.ai.get(r.actor, id); }
  @Delete('conversations/:id') remove(@Req() r: AuthRequest, @Param('id') id: string) { return this.ai.remove(r.actor, id); }
  @Get('risk-reviews/:type/:id') latestRiskReview(@Req() r: AuthRequest, @Param('type') type: string, @Param('id') id: string) { return this.ai.latestRiskReview(r.actor, type, id); }
  @Post('risk-reviews') reviewRisk(@Req() r: AuthRequest, @Body() body: unknown) { return this.ai.reviewRisk(r.actor, body); }
  @Post('chat') chat(@Req() r: AuthRequest, @Body() body: unknown) { return this.ai.chat(r.actor, body); }
}
