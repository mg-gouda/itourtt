import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { LocationsService } from './locations.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { CreateCountryDto } from './dto/create-country.dto.js';
import { CreateAirportDto } from './dto/create-airport.dto.js';
import { CreateCityDto } from './dto/create-city.dto.js';
import { CreateZoneDto } from './dto/create-zone.dto.js';
import { CreateHotelDto } from './dto/create-hotel.dto.js';

@Controller('locations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  // ─── Search ──────────────────────────────────────────────

  @Get('search')
  searchLocations(
    @Query('q') q?: string,
    @Query('types') types?: string,
  ) {
    const typeArray = types ? types.split(',').map(t => t.trim().toUpperCase()) : undefined;
    return this.locationsService.searchLocations(q, typeArray);
  }

  // ─── Full Location Tree ───────────────────────────────────

  @Get('tree')
  getTree() {
    return this.locationsService.getTree();
  }

  // ─── Countries ────────────────────────────────────────────

  @Get('countries')
  findAllCountries(@Query() pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    return this.locationsService.findAllCountries(page, limit);
  }

  @Post('countries')
  @Roles('ADMIN', 'DISPATCHER')
  createCountry(@Body() dto: CreateCountryDto) {
    return this.locationsService.createCountry(dto);
  }

  // ─── Airports ─────────────────────────────────────────────

  @Get('airports')
  findAirportsByCountry(@Query('countryId', ParseUUIDPipe) countryId: string) {
    return this.locationsService.findAirportsByCountry(countryId);
  }

  @Post('airports')
  @Roles('ADMIN', 'DISPATCHER')
  createAirport(@Body() dto: CreateAirportDto) {
    return this.locationsService.createAirport(dto);
  }

  // ─── Cities ───────────────────────────────────────────────

  @Get('cities')
  findCitiesByAirport(@Query('airportId', ParseUUIDPipe) airportId: string) {
    return this.locationsService.findCitiesByAirport(airportId);
  }

  @Post('cities')
  @Roles('ADMIN', 'DISPATCHER')
  createCity(@Body() dto: CreateCityDto) {
    return this.locationsService.createCity(dto);
  }

  // ─── Zones ────────────────────────────────────────────────

  @Get('zones')
  findZones(@Query('cityId') cityId?: string) {
    return this.locationsService.findZones(cityId);
  }

  @Post('zones')
  @Roles('ADMIN', 'DISPATCHER')
  createZone(@Body() dto: CreateZoneDto) {
    return this.locationsService.createZone(dto);
  }

  // ─── Hotels ───────────────────────────────────────────────

  @Get('zones/:id/hotels')
  findHotelsByZone(@Param('id', ParseUUIDPipe) zoneId: string) {
    return this.locationsService.findHotelsByZone(zoneId);
  }

  @Post('hotels')
  @Roles('ADMIN', 'DISPATCHER')
  createHotel(@Body() dto: CreateHotelDto) {
    return this.locationsService.createHotel(dto);
  }

  // ─── Delete ─────────────────────────────────────────────────

  @Delete('countries/:id')
  @Roles('ADMIN')
  deleteCountry(@Param('id', ParseUUIDPipe) id: string) {
    return this.locationsService.deleteCountry(id);
  }

  @Delete('airports/:id')
  @Roles('ADMIN')
  deleteAirport(@Param('id', ParseUUIDPipe) id: string) {
    return this.locationsService.deleteAirport(id);
  }

  @Delete('cities/:id')
  @Roles('ADMIN')
  deleteCity(@Param('id', ParseUUIDPipe) id: string) {
    return this.locationsService.deleteCity(id);
  }

  @Delete('zones/:id')
  @Roles('ADMIN')
  deleteZone(@Param('id', ParseUUIDPipe) id: string) {
    return this.locationsService.deleteZone(id);
  }

  @Delete('hotels/:id')
  @Roles('ADMIN')
  deleteHotel(@Param('id', ParseUUIDPipe) id: string) {
    return this.locationsService.deleteHotel(id);
  }
}
