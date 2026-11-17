import { Module } from '@nestjs/common';
import { MobileAppsController } from './mobile-apps.controller.js';

@Module({ controllers: [MobileAppsController] })
export class MobileAppsModule {}
