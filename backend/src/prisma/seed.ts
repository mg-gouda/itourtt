import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new (PrismaClient as any)({ adapter });

  try {
    // Create default admin user
    const passwordHash = await bcrypt.hash('Admin@123', 12);

    const admin = await prisma.user.upsert({
      where: { email: 'admin@itour.local' },
      update: {},
      create: {
        email: 'admin@itour.local',
        passwordHash,
        name: 'System Admin',
        role: 'ADMIN',
        isActive: true,
      },
    });

    console.log(`Admin user created: ${admin.email} (${admin.id})`);

    // Create a default country (Egypt)
    const egypt = await prisma.country.upsert({
      where: { code: 'EG' },
      update: {},
      create: {
        name: 'Egypt',
        code: 'EG',
      },
    });

    console.log(`Country created: ${egypt.name} (${egypt.id})`);

    // Create Cairo International Airport
    const cairoCodes = await prisma.airport.findFirst({
      where: { code: 'CAI' },
    });

    if (!cairoCodes) {
      const airport = await prisma.airport.create({
        data: {
          name: 'Cairo International Airport',
          code: 'CAI',
          countryId: egypt.id,
        },
      });
      console.log(`Airport created: ${airport.name} (${airport.id})`);

      const cairo = await prisma.city.create({
        data: {
          name: 'Cairo',
          airportId: airport.id,
        },
      });
      console.log(`City created: ${cairo.name} (${cairo.id})`);

      const zones = ['Giza', 'Maadi', 'Heliopolis', 'Downtown', 'Nasr City'];
      for (const zoneName of zones) {
        const zone = await prisma.zone.create({
          data: {
            name: zoneName,
            cityId: cairo.id,
          },
        });
        console.log(`Zone created: ${zone.name} (${zone.id})`);
      }
    } else {
      console.log('Airport CAI already exists, skipping location seed');
    }

    // Create Hurghada Airport
    const hrgCodes = await prisma.airport.findFirst({
      where: { code: 'HRG' },
    });

    if (!hrgCodes) {
      const hrgAirport = await prisma.airport.create({
        data: {
          name: 'Hurghada International Airport',
          code: 'HRG',
          countryId: egypt.id,
        },
      });

      const hurghada = await prisma.city.create({
        data: {
          name: 'Hurghada',
          airportId: hrgAirport.id,
        },
      });

      const hrgZones = ['Sahl Hasheesh', 'El Gouna', 'Makadi Bay', 'Hurghada Center'];
      for (const zoneName of hrgZones) {
        await prisma.zone.create({
          data: {
            name: zoneName,
            cityId: hurghada.id,
          },
        });
      }
      console.log('Hurghada locations seeded');
    }

    // Create Sharm El Sheikh Airport
    const sshCodes = await prisma.airport.findFirst({
      where: { code: 'SSH' },
    });

    if (!sshCodes) {
      const sshAirport = await prisma.airport.create({
        data: {
          name: 'Sharm El Sheikh International Airport',
          code: 'SSH',
          countryId: egypt.id,
        },
      });

      const sharm = await prisma.city.create({
        data: {
          name: 'Sharm El Sheikh',
          airportId: sshAirport.id,
        },
      });

      const sshZones = ['Naama Bay', 'Shark Bay', 'Nabq Bay', 'Old Market'];
      for (const zoneName of sshZones) {
        await prisma.zone.create({
          data: {
            name: zoneName,
            cityId: sharm.id,
          },
        });
      }
      console.log('Sharm El Sheikh locations seeded');
    }

    // Create sample vehicle types
    const sedanType = await prisma.vehicleType.upsert({
      where: { name: 'Sedan' },
      update: {},
      create: { name: 'Sedan', seatCapacity: 3 },
    });

    const minivanType = await prisma.vehicleType.upsert({
      where: { name: 'Minivan' },
      update: {},
      create: { name: 'Minivan', seatCapacity: 7 },
    });

    const coasterType = await prisma.vehicleType.upsert({
      where: { name: 'Coaster' },
      update: {},
      create: { name: 'Coaster', seatCapacity: 25 },
    });

    const busType = await prisma.vehicleType.upsert({
      where: { name: 'Bus' },
      update: {},
      create: { name: 'Bus', seatCapacity: 49 },
    });

    console.log(`Vehicle types seeded: ${sedanType.name}, ${minivanType.name}, ${coasterType.name}, ${busType.name}`);

    console.log('\nSeed completed successfully.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
