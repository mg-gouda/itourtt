import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AgentsService } from './agents.service.js';
import { CreateAgentDto } from './dto/create-agent.dto.js';
import { UpdateAgentDto } from './dto/update-agent.dto.js';
import { UpdateCreditDto } from './dto/update-credit.dto.js';
import { UpdateInvoiceCycleDto } from './dto/update-invoice-cycle.dto.js';
import { CreateDocumentDto } from './dto/create-document.dto.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class AgentListQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;
}

@Controller('agents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  async findAll(@Query() query: AgentListQueryDto) {
    const { isActive, ...pagination } = query;
    return this.agentsService.findAll(pagination, isActive);
  }

  @Post()
  @Roles('ADMIN', 'AGENT_MANAGER')
  async create(@Body() dto: CreateAgentDto) {
    const agent = await this.agentsService.create(dto);
    return new ApiResponse(agent, 'Agent created successfully');
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const agent = await this.agentsService.findOne(id);
    return new ApiResponse(agent);
  }

  @Put(':id')
  @Roles('ADMIN', 'AGENT_MANAGER')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgentDto,
  ) {
    const agent = await this.agentsService.update(id, dto);
    return new ApiResponse(agent, 'Agent updated successfully');
  }

  @Patch(':id/status')
  @Roles('ADMIN')
  async toggleStatus(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.agentsService.toggleStatus(id);
    return new ApiResponse(result, 'Agent status updated successfully');
  }

  @Put(':id/credit')
  @Roles('ADMIN', 'AGENT_MANAGER')
  async updateCredit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCreditDto,
  ) {
    const credit = await this.agentsService.updateCredit(id, dto);
    return new ApiResponse(credit, 'Agent credit terms updated successfully');
  }

  @Put(':id/invoice-cycle')
  @Roles('ADMIN', 'AGENT_MANAGER')
  async updateInvoiceCycle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceCycleDto,
  ) {
    const cycle = await this.agentsService.updateInvoiceCycle(id, dto);
    return new ApiResponse(cycle, 'Agent invoice cycle updated successfully');
  }

  @Post(':id/documents')
  @Roles('ADMIN', 'AGENT_MANAGER')
  async createDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDocumentDto,
  ) {
    const document = await this.agentsService.createDocument(id, dto);
    return new ApiResponse(document, 'Document uploaded successfully');
  }

  @Get(':id/documents')
  async findDocuments(@Param('id', ParseUUIDPipe) id: string) {
    const documents = await this.agentsService.findDocuments(id);
    return new ApiResponse(documents);
  }
}
