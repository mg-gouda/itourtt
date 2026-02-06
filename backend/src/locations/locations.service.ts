import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCountryDto } from './dto/create-country.dto.js';
import { CreateAirportDto } from './dto/create-airport.dto.js';
import { CreateCityDto } from './dto/create-city.dto.js';
import { CreateZoneDto } from './dto/create-zone.dto.js';
import { CreateHotelDto } from './dto/create-hotel.dto.js';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Search ──────────────────────────────────────────────

  async searchLocations(query?: string, types?: string[]) {
    // Default to all types if not specified
    const searchTypes = types?.length ? types : ['AIRPORT', 'ZONE', 'HOTEL'];
    const results: Array<{ id: string; type: string; name: string; code?: string; path: string }> = [];
    const q = query?.toLowerCase()?.trim();

    if (searchTypes.includes('AIRPORT')) {
      const airports = await this.prisma.airport.findMany({
        where: {
          deletedAt: null,
          ...(q ? { OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { code: { contains: q, mode: 'insensitive' } },
          ] } : {}),
        },
        include: { country: true },
        orderBy: { name: 'asc' },
        take: 50,
      });
      for (const a of airports) {
        results.push({
          id: a.id,
          type: 'AIRPORT',
          name: a.name,
          code: a.code,
          path: `${a.country.name} > ${a.name}`,
        });
      }
    }

    if (searchTypes.includes('ZONE')) {
      const zones = await this.prisma.zone.findMany({
        where: {
          deletedAt: null,
          ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
        },
        include: { city: { include: { airport: { include: { country: true } } } } },
        orderBy: { name: 'asc' },
        take: 50,
      });
      for (const z of zones) {
        results.push({
          id: z.id,
          type: 'ZONE',
          name: z.name,
          path: `${z.city.airport.country.name} > ${z.city.airport.name} > ${z.city.name} > ${z.name}`,
        });
      }
    }

    if (searchTypes.includes('HOTEL')) {
      const hotels = await this.prisma.hotel.findMany({
        where: {
          deletedAt: null,
          ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
        },
        include: { zone: { include: { city: { include: { airport: { include: { country: true } } } } } } },
        orderBy: { name: 'asc' },
        take: 50,
      });
      for (const h of hotels) {
        results.push({
          id: h.id,
          type: 'HOTEL',
          name: h.name,
          path: `${h.zone.city.airport.country.name} > ${h.zone.city.airport.name} > ${h.zone.city.name} > ${h.zone.name} > ${h.name}`,
        });
      }
    }

    return results;
  }

  // ─── Full Location Tree ───────────────────────────────────

  async getTree() {
    const countries = await this.prisma.country.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        airports: {
          where: { deletedAt: null },
          orderBy: { name: 'asc' },
          include: {
            cities: {
              where: { deletedAt: null },
              orderBy: { name: 'asc' },
              include: {
                zones: {
                  where: { deletedAt: null },
                  orderBy: { name: 'asc' },
                  include: {
                    hotels: {
                      where: { deletedAt: null },
                      orderBy: { name: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return countries;
  }

  // ─── Countries ────────────────────────────────────────────

  async findAllCountries(page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.country.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.country.count({
        where: { deletedAt: null },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createCountry(dto: CreateCountryDto) {
    return this.prisma.country.create({
      data: {
        name: dto.name,
        code: dto.code.toUpperCase(),
      },
    });
  }

  // ─── Airports ─────────────────────────────────────────────

  async findAirportsByCountry(countryId: string) {
    const country = await this.prisma.country.findUnique({
      where: { id: countryId, deletedAt: null },
    });
    if (!country) {
      throw new NotFoundException(`Country with id ${countryId} not found`);
    }

    return this.prisma.airport.findMany({
      where: { countryId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: { country: true },
    });
  }

  async createAirport(dto: CreateAirportDto) {
    const country = await this.prisma.country.findUnique({
      where: { id: dto.countryId, deletedAt: null },
    });
    if (!country) {
      throw new NotFoundException(`Country with id ${dto.countryId} not found`);
    }

    return this.prisma.airport.create({
      data: {
        name: dto.name,
        code: dto.code.toUpperCase(),
        countryId: dto.countryId,
      },
      include: { country: true },
    });
  }

  // ─── Cities ───────────────────────────────────────────────

  async findCitiesByAirport(airportId: string) {
    const airport = await this.prisma.airport.findUnique({
      where: { id: airportId, deletedAt: null },
    });
    if (!airport) {
      throw new NotFoundException(`Airport with id ${airportId} not found`);
    }

    return this.prisma.city.findMany({
      where: { airportId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: { airport: true },
    });
  }

  async createCity(dto: CreateCityDto) {
    const airport = await this.prisma.airport.findUnique({
      where: { id: dto.airportId, deletedAt: null },
    });
    if (!airport) {
      throw new NotFoundException(`Airport with id ${dto.airportId} not found`);
    }

    return this.prisma.city.create({
      data: {
        name: dto.name,
        airportId: dto.airportId,
      },
      include: { airport: true },
    });
  }

  // ─── Zones ────────────────────────────────────────────────

  async findZones(cityId?: string) {
    if (cityId) {
      const city = await this.prisma.city.findUnique({
        where: { id: cityId, deletedAt: null },
      });
      if (!city) {
        throw new NotFoundException(`City with id ${cityId} not found`);
      }
    }

    return this.prisma.zone.findMany({
      where: { deletedAt: null, ...(cityId ? { cityId } : {}) },
      orderBy: { name: 'asc' },
      include: { city: true },
    });
  }

  async createZone(dto: CreateZoneDto) {
    const city = await this.prisma.city.findUnique({
      where: { id: dto.cityId, deletedAt: null },
    });
    if (!city) {
      throw new NotFoundException(`City with id ${dto.cityId} not found`);
    }

    return this.prisma.zone.create({
      data: {
        name: dto.name,
        cityId: dto.cityId,
      },
      include: { city: true },
    });
  }

  // ─── Hotels ───────────────────────────────────────────────

  async findHotelsByZone(zoneId: string) {
    const zone = await this.prisma.zone.findUnique({
      where: { id: zoneId, deletedAt: null },
    });
    if (!zone) {
      throw new NotFoundException(`Zone with id ${zoneId} not found`);
    }

    return this.prisma.hotel.findMany({
      where: { zoneId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: { zone: true },
    });
  }

  async createHotel(dto: CreateHotelDto) {
    const zone = await this.prisma.zone.findUnique({
      where: { id: dto.zoneId, deletedAt: null },
    });
    if (!zone) {
      throw new NotFoundException(`Zone with id ${dto.zoneId} not found`);
    }

    return this.prisma.hotel.create({
      data: {
        name: dto.name,
        zoneId: dto.zoneId,
        address: dto.address,
        stars: dto.stars,
      },
      include: { zone: true },
    });
  }

  // ─── Soft-Delete Methods ──────────────────────────────────

  async deleteCountry(id: string) {
    const country = await this.prisma.country.findUnique({
      where: { id, deletedAt: null },
      include: { airports: { where: { deletedAt: null }, select: { id: true }, take: 1 } },
    });
    if (!country) throw new NotFoundException(`Country with id ${id} not found`);
    if (country.airports.length > 0) {
      throw new BadRequestException('Cannot delete country that still has airports. Delete children first.');
    }
    return this.prisma.country.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async deleteAirport(id: string) {
    const airport = await this.prisma.airport.findUnique({
      where: { id, deletedAt: null },
      include: { cities: { where: { deletedAt: null }, select: { id: true }, take: 1 } },
    });
    if (!airport) throw new NotFoundException(`Airport with id ${id} not found`);
    if (airport.cities.length > 0) {
      throw new BadRequestException('Cannot delete airport that still has cities. Delete children first.');
    }
    return this.prisma.airport.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async deleteCity(id: string) {
    const city = await this.prisma.city.findUnique({
      where: { id, deletedAt: null },
      include: { zones: { where: { deletedAt: null }, select: { id: true }, take: 1 } },
    });
    if (!city) throw new NotFoundException(`City with id ${id} not found`);
    if (city.zones.length > 0) {
      throw new BadRequestException('Cannot delete city that still has zones. Delete children first.');
    }
    return this.prisma.city.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async deleteZone(id: string) {
    const zone = await this.prisma.zone.findUnique({
      where: { id, deletedAt: null },
      include: { hotels: { where: { deletedAt: null }, select: { id: true }, take: 1 } },
    });
    if (!zone) throw new NotFoundException(`Zone with id ${id} not found`);
    if (zone.hotels.length > 0) {
      throw new BadRequestException('Cannot delete zone that still has hotels. Delete children first.');
    }
    return this.prisma.zone.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async deleteHotel(id: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id, deletedAt: null },
    });
    if (!hotel) throw new NotFoundException(`Hotel with id ${id} not found`);
    return this.prisma.hotel.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
