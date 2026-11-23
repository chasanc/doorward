import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { DataSource, IsNull } from 'typeorm';
import { AccessService, type CheckInput } from '../application/access.service.js';
import { invalid } from '../application/errors.js';
import { NIL_UUID } from '../application/ids.js';
import type { ServiceCall } from '../application/service-call.js';
import { CheckRouteGuard, headerValue, type CheckAuth } from '../auth/check-route.guard.js';
import { CompanyEntity } from '../infrastructure/database/entities/company.entity.js';

type CheckRequest = Request & { checkAuth?: CheckAuth };

@ApiTags('v1')
@Controller('v1')
@UseGuards(CheckRouteGuard)
export class CheckController {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly access: AccessService,
  ) {}

  @Post('check')
  @HttpCode(200)
  async check(@Body() body: CheckInput, @Req() req: CheckRequest) {
    return this.access.check(body, await this.call(req));
  }

  @Post('check/batch')
  @HttpCode(200)
  async batchCheck(@Body() body: { checks?: CheckInput[] }, @Req() req: CheckRequest) {
    if (!Array.isArray(body.checks)) throw invalid('checks must be a list');
    return { results: await this.access.batchCheck(body.checks, await this.call(req)) };
  }

  private async call(req: CheckRequest): Promise<ServiceCall> {
    const auth = req.checkAuth;
    if (auth?.kind === 'self') {
      return { source: 'rest', actorUserId: auth.session.sub, companyId: auth.session.companyId };
    }
    return { source: 'rest', companyId: await this.companyId(req) };
  }

  /** App keys send `company-key`, the same header gRPC uses. A session carries its own company. */
  private async companyId(req: Request): Promise<string | undefined> {
    if (!this.config.getOrThrow<boolean>('multiCompanyMode')) return undefined;
    const key = headerValue(req, 'company-key');
    if (!key) return NIL_UUID;
    const row = await this.db.getRepository(CompanyEntity).findOne({
      where: { companyKey: key, deletedAt: IsNull(), active: true },
    });
    return row?.id ?? NIL_UUID;
  }
}
