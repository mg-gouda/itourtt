import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { CreateTripPriceDto } from './dto/create-trip-price.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';

@Controller('suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('isActive') isActive?: string,
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const active =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;

    return this.suppliersService.findAll(page, limit, active);
  }

  @Post()
  @Roles('ADMIN')
  async create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.findOne(id);
  }

  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliersService.update(id, dto);
  }

  @Post(':id/trip-prices')
  async createTripPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTripPriceDto,
  ) {
    return this.suppliersService.createTripPrice(id, dto);
  }

  @Get(':id/trip-prices')
  async findTripPrices(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.findTripPrices(id);
  }

  @Put('trip-prices/:priceId')
  async updateTripPrice(
    @Param('priceId', ParseUUIDPipe) priceId: string,
    @Body() dto: CreateTripPriceDto,
  ) {
    return this.suppliersService.updateTripPrice(priceId, dto);
  }
}
