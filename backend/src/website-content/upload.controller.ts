import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const uploadStorage = diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const imageFilter = (
  _req: unknown,
  file: { mimetype: string },
  cb: (err: Error | null, accept: boolean) => void,
) => {
  if (/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestException('Only image files are allowed.'), false);
  }
};

/** Shared image upload for B2C content (blog covers, city hero images). */
@Controller('website-content')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class WebsiteContentUploadController {
  @Post('upload-image')
  @Permissions('website-content.cityPages', 'website-content.blog')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: uploadStorage,
      limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
      fileFilter: imageFilter,
    }),
  )
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded.');
    return new ApiResponse({ url: '/uploads/' + file.filename });
  }
}
