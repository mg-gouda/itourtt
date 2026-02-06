import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { LocationsModule } from './locations/locations.module.js';
import { VehiclesModule } from './vehicles/vehicles.module.js';
import { DriversModule } from './drivers/drivers.module.js';
import { RepsModule } from './reps/reps.module.js';
import { AgentsModule } from './agents/agents.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { SuppliersModule } from './suppliers/suppliers.module.js';
import { TrafficJobsModule } from './traffic-jobs/traffic-jobs.module.js';
import { DispatchModule } from './dispatch/dispatch.module.js';
import { FinanceModule } from './finance/finance.module.js';
import { ExportModule } from './export/export.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { RepPortalModule } from './rep-portal/rep-portal.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    LocationsModule,
    VehiclesModule,
    DriversModule,
    RepsModule,
    AgentsModule,
    CustomersModule,
    SuppliersModule,
    TrafficJobsModule,
    DispatchModule,
    FinanceModule,
    ExportModule,
    ReportsModule,
    SettingsModule,
    RepPortalModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
