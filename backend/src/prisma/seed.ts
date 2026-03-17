import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { getAllPermissionKeys } from '../permissions/permission-registry.js';
import { seedEgyptLocations } from './seed-egypt-locations.js';

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

    // Create super admin
    const superAdminHash = await bcrypt.hash('Win16@64_PineBlue', 12);

    const superAdmin = await prisma.user.upsert({
      where: { email: 'mggouda@gmail.com' },
      update: {},
      create: {
        email: 'mggouda@gmail.com',
        passwordHash: superAdminHash,
        name: 'Mohamed Gouda',
        role: 'ADMIN',
        isActive: true,
      },
    });

    console.log(`Super admin created: ${superAdmin.email} (${superAdmin.id})`);

    // ─── SEED SYSTEM ROLES ───
    const allPermissionKeys = getAllPermissionKeys();
    const pageKeys = allPermissionKeys.filter((k) => !k.includes('.'));

    const systemRoles = [
      { name: 'Admin', slug: 'admin', description: 'Full system access' },
      { name: 'Dispatcher', slug: 'dispatcher', description: 'Controls traffic jobs and dispatch operations' },
      { name: 'Accountant', slug: 'accountant', description: 'Handles finance and financial reports' },
      { name: 'Agent Manager', slug: 'agent-manager', description: 'Manages agents, customers, and bookings' },
      { name: 'Viewer', slug: 'viewer', description: 'Read-only access to all modules' },
      { name: 'Rep', slug: 'rep', description: 'Field representative portal user' },
      { name: 'Driver', slug: 'driver', description: 'Driver portal user' },
      { name: 'Online Operator', slug: 'online-operator', description: 'Handles online booking operations' },
      { name: 'Dispatch Operator', slug: 'dispatch-operator', description: 'Handles dispatch operations' },
      { name: 'Online Manager', slug: 'online-manager', description: 'Manages online booking team and operations' },
      { name: 'Dispatch Manager', slug: 'dispatch-manager', description: 'Manages dispatch team and operations' },
      { name: 'FC', slug: 'fc', description: 'Financial controller with oversight of all finance operations' },
      { name: 'Transportation Accountant', slug: 'transportation-accountant', description: 'Handles transportation-specific accounting and costs' },
    ];

    for (const roleData of systemRoles) {
      const role = await prisma.role.upsert({
        where: { slug: roleData.slug },
        update: { name: roleData.name, description: roleData.description },
        create: { ...roleData, isSystem: true },
      });
      console.log(`System role seeded: ${role.name} (${role.slug})`);

      // Skip admin (always has full access in code)
      if (role.slug === 'admin') {
        // Assign admin users to admin role
        await prisma.user.updateMany({
          where: { id: { in: [admin.id, superAdmin.id] } },
          data: { roleId: role.id },
        });
        continue;
      }

      let defaultKeys: string[] = [];
      switch (role.slug) {
        case 'dispatcher':
          defaultKeys = allPermissionKeys.filter((k) =>
            k.startsWith('dashboard') || k.startsWith('dispatch') ||
            k.startsWith('traffic-jobs') || k.startsWith('vehicles') ||
            k.startsWith('drivers') || k.startsWith('reps') ||
            k.startsWith('locations') || k.startsWith('activity-logs'),
          );
          break;
        case 'accountant':
          defaultKeys = allPermissionKeys.filter((k) =>
            k.startsWith('dashboard') || k.startsWith('finance') ||
            k.startsWith('reports') || k.startsWith('agents') ||
            k.startsWith('customers') || k.startsWith('suppliers') ||
            k.startsWith('activity-logs'),
          );
          break;
        case 'agent-manager':
          defaultKeys = allPermissionKeys.filter((k) =>
            k.startsWith('dashboard') || k.startsWith('agents') ||
            k.startsWith('customers') || k.startsWith('traffic-jobs') ||
            k.startsWith('activity-logs'),
          );
          break;
        case 'viewer':
          defaultKeys = pageKeys.filter((k) =>
            k !== 'users' && k !== 'company' && k !== 'whatsapp',
          );
          break;
        case 'online-operator':
          defaultKeys = allPermissionKeys.filter((k) =>
            k.startsWith('dashboard') || k.startsWith('traffic-jobs') ||
            k.startsWith('agents') || k.startsWith('customers') ||
            k.startsWith('locations') || k.startsWith('guest-bookings') ||
            k === 'dispatch' || k === 'dispatch.assignment.assignRep',
          );
          break;
        case 'dispatch-operator':
          defaultKeys = allPermissionKeys.filter((k) =>
            (k.startsWith('dashboard') || k.startsWith('dispatch') ||
            k.startsWith('traffic-jobs') || k.startsWith('vehicles') ||
            k.startsWith('drivers') || k.startsWith('reps') ||
            k.startsWith('locations')) &&
            k !== 'dispatch.assignment.assignRep',
          );
          break;
        case 'online-manager':
          defaultKeys = allPermissionKeys.filter((k) =>
            k.startsWith('dashboard') || k.startsWith('traffic-jobs') ||
            k.startsWith('agents') || k.startsWith('customers') ||
            k.startsWith('locations') || k.startsWith('guest-bookings') ||
            k.startsWith('reports') || k.startsWith('activity-logs'),
          );
          break;
        case 'dispatch-manager':
          defaultKeys = allPermissionKeys.filter((k) =>
            k.startsWith('dashboard') || k.startsWith('dispatch') ||
            k.startsWith('traffic-jobs') || k.startsWith('vehicles') ||
            k.startsWith('drivers') || k.startsWith('reps') ||
            k.startsWith('locations') || k.startsWith('suppliers') ||
            k.startsWith('reports') || k.startsWith('activity-logs'),
          );
          break;
        case 'fc':
          defaultKeys = allPermissionKeys.filter((k) =>
            k.startsWith('dashboard') || k.startsWith('finance') ||
            k.startsWith('reports') || k.startsWith('agents') ||
            k.startsWith('customers') || k.startsWith('suppliers') ||
            k.startsWith('drivers') || k.startsWith('reps') ||
            k.startsWith('activity-logs'),
          );
          break;
        case 'transportation-accountant':
          defaultKeys = allPermissionKeys.filter((k) =>
            k.startsWith('dashboard') || k.startsWith('finance') ||
            k.startsWith('reports') || k.startsWith('suppliers') ||
            k.startsWith('drivers') || k.startsWith('vehicles') ||
            k.startsWith('activity-logs'),
          );
          break;
      }

      if (defaultKeys.length > 0) {
        // Clear existing and insert
        await prisma.rolePermissionV2.deleteMany({ where: { roleId: role.id } });
        for (const permissionKey of defaultKeys) {
          await prisma.rolePermissionV2.create({
            data: { roleId: role.id, permissionKey },
          });
        }
        console.log(`  → Assigned ${defaultKeys.length} permissions to ${role.name}`);
      }
    }

    console.log('System roles and permissions seeded.');

    // ─── SEED EGYPT LOCATIONS WITH COORDINATES ───
    await seedEgyptLocations(prisma);

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

    // ─── SEED AGENT PRICE LIST ───
    const allAgents = await prisma.agent.findMany({ where: { deletedAt: null } });
    const allZones = await prisma.zone.findMany();
    const allVehicleTypes = [sedanType, minivanType, coasterType, busType];
    const serviceTypes = ['ARR', 'DEP'];

    let agentPriceCount = 0;
    for (const agent of allAgents) {
      for (const fromZone of allZones) {
        for (const toZone of allZones) {
          if (fromZone.id === toZone.id) continue;
          for (const vt of allVehicleTypes) {
            for (const st of serviceTypes) {
              await prisma.agentPriceItem.upsert({
                where: {
                  agentId_serviceType_fromZoneId_toZoneId_vehicleTypeId: {
                    agentId: agent.id,
                    serviceType: st as any,
                    fromZoneId: fromZone.id,
                    toZoneId: toZone.id,
                    vehicleTypeId: vt.id,
                  },
                },
                update: {},
                create: {
                  agentId: agent.id,
                  serviceType: st as any,
                  fromZoneId: fromZone.id,
                  toZoneId: toZone.id,
                  vehicleTypeId: vt.id,
                  price: 10,
                  driverTip: 0,
                  boosterSeatPrice: 5,
                  babySeatPrice: 5,
                  wheelChairPrice: 5,
                },
              });
              agentPriceCount++;
            }
          }
        }
      }
    }
    console.log(`Agent price items seeded: ${agentPriceCount} items for ${allAgents.length} agents`);

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
