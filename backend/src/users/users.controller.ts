import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { RolePermissionsService } from './role-permissions.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { UserRole } from '../../generated/prisma/enums.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly rolePermissionsService: RolePermissionsService,
  ) {}

  // ──────────────────────────────────────────────
  // POST /users — create user (ADMIN only)
  // ──────────────────────────────────────────────

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  // ──────────────────────────────────────────────
  // GET /users — list users (ADMIN only, paginated)
  // ──────────────────────────────────────────────

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async findAll(@Query() pagination: PaginationDto) {
    return this.usersService.findAll(pagination);
  }

  // ──────────────────────────────────────────────
  // GET /users/me — current user profile (any authenticated)
  // ──────────────────────────────────────────────

  @Get('me')
  async getMe(@CurrentUser('id') userId: string) {
    return this.usersService.findOne(userId);
  }

  // ──────────────────────────────────────────────
  // GET /users/permissions — full permission matrix (ADMIN only)
  // ──────────────────────────────────────────────

  @Get('permissions')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async getPermissions() {
    return this.rolePermissionsService.findAll();
  }

  // ──────────────────────────────────────────────
  // PUT /users/permissions — bulk update permissions (ADMIN only)
  // ──────────────────────────────────────────────

  @Put('permissions')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async updatePermissions(@Body() dto: UpdateRolePermissionsDto) {
    return this.rolePermissionsService.bulkUpdate(dto.permissions);
  }

  // ──────────────────────────────────────────────
  // GET /users/permissions/seed — seed default permissions (ADMIN only)
  // ──────────────────────────────────────────────

  @Get('permissions/seed')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async seedPermissions() {
    return this.rolePermissionsService.seedDefaults();
  }

  // ──────────────────────────────────────────────
  // GET /users/permissions/:role — permissions for one role (ADMIN only)
  // ──────────────────────────────────────────────

  @Get('permissions/:role')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async getPermissionsByRole(
    @Param('role', new ParseEnumPipe(UserRole)) role: UserRole,
  ) {
    return this.rolePermissionsService.findByRole(role);
  }

  // ──────────────────────────────────────────────
  // GET /users/:id — get user by id (ADMIN only)
  // ──────────────────────────────────────────────

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  // ──────────────────────────────────────────────
  // PATCH /users/:id — update user (ADMIN only)
  // ──────────────────────────────────────────────

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, dto);
  }

  // ──────────────────────────────────────────────
  // PATCH /users/:id/role — change role (ADMIN only)
  // ──────────────────────────────────────────────

  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.usersService.updateRole(id, dto.role);
  }

  // ──────────────────────────────────────────────
  // DELETE /users/:id — deactivate user (ADMIN only)
  // ──────────────────────────────────────────────

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.deactivate(id);
  }
}
