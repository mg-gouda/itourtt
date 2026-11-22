import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RmfHotelDto } from './dto/rmf-hotel.dto.js';

const SECTION_AREA: Record<string, string> = {
  NORTH: 'NORTH-MARSA ALAM',
  SOUTH: 'SOUTH MARSA ALAM',
  DEEP_SOUTH: 'SHAMS ALAM',
};

/** Marsa Alam hotels by section (north / south of RMF airport, deep south), read by Traffic Cover. */
@Injectable()
export class RmfHotelsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every hotel, ordered by section and sort order (inactive ones too: the page shows them). */
  findAll() {
    return this.prisma.rmfHotel.findMany({ orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] });
  }

  async create(dto: RmfHotelDto) {
    const last = await this.prisma.rmfHotel.findFirst({ where: { section: dto.section }, orderBy: { sortOrder: 'desc' } });
    return this.prisma.rmfHotel.create({
      data: {
        name: dto.name.trim(),
        section: dto.section,
        routeArea: dto.routeArea ?? SECTION_AREA[dto.section],
        matchWords: (dto.matchWords ?? '').trim() || dto.name.trim().toLowerCase(),
        excludeWords: dto.excludeWords?.trim() || null,
        sortOrder: dto.sortOrder ?? (last?.sortOrder ?? 0) + 10,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: Partial<RmfHotelDto>) {
    const cur = await this.prisma.rmfHotel.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Hotel not found');
    const section = dto.section ?? cur.section;
    return this.prisma.rmfHotel.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.section !== undefined && { section }),
        // Moving a hotel to another section moves its area too, unless an area is given.
        ...(dto.routeArea !== undefined
          ? { routeArea: dto.routeArea }
          : dto.section !== undefined && dto.section !== cur.section
            ? { routeArea: SECTION_AREA[section] }
            : {}),
        ...(dto.matchWords !== undefined && { matchWords: dto.matchWords.trim() || (dto.name ?? cur.name).trim().toLowerCase() }),
        ...(dto.excludeWords !== undefined && { excludeWords: dto.excludeWords?.trim() || null }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(id: string) {
    const cur = await this.prisma.rmfHotel.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Hotel not found');
    await this.prisma.rmfHotel.delete({ where: { id } });
  }
}
