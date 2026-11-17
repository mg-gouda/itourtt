import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { ChatService, type ChatActor } from './chat.service.js';
import { CHAT_BROADCAST_PERMISSION, CHAT_MAX_FILE_BYTES } from './chat.constants.js';
import {
  BroadcastListQueryDto,
  ContactsQueryDto,
  SendBroadcastDto,
  MessagesQueryDto,
  OpenConversationDto,
  SendMessageDto,
  UpdateChatSettingsDto,
} from './dto/chat.dto.js';

/**
 * In-app chat between rep/driver portal users and staff. Every route is open
 * to any signed-in user; who may talk to whom is decided in ChatService from
 * CompanySettings.chat{Driver,Rep}ContactRoles, and every thread route checks
 * the caller is one of its two participants.
 */
@Controller('chat')
@UseGuards(RolesGuard, PermissionsGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** Availability + unread total + newest unread thread (polled). */
  @Get('me')
  async me(@CurrentUser() user: ChatActor) {
    return new ApiResponse(await this.chat.me(user));
  }

  @Get('conversations')
  async conversations(@CurrentUser() user: ChatActor) {
    return new ApiResponse(await this.chat.listConversations(user));
  }

  @Get('contacts')
  async contacts(@CurrentUser() user: ChatActor, @Query() q: ContactsQueryDto) {
    return new ApiResponse(await this.chat.contacts(user, q.search, q.role));
  }

  @Post('conversations')
  async open(@CurrentUser() user: ChatActor, @Body() dto: OpenConversationDto) {
    return new ApiResponse(await this.chat.openConversation(user, dto.userId));
  }

  @Get('conversations/:id')
  async conversation(@CurrentUser() user: ChatActor, @Param('id', ParseUUIDPipe) id: string) {
    return new ApiResponse(await this.chat.getConversation(user, id));
  }

  @Get('conversations/:id/messages')
  async messages(
    @CurrentUser() user: ChatActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: MessagesQueryDto,
  ) {
    return new ApiResponse(await this.chat.listMessages(user, id, q));
  }

  /** Send TEXT (body), IMAGE (file + optional caption) or VOICE (file + durationSec). */
  @Post('conversations/:id/messages')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: CHAT_MAX_FILE_BYTES, files: 1 },
    }),
  )
  async send(
    @CurrentUser() user: ChatActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return new ApiResponse(await this.chat.sendMessage(user, id, dto, file));
  }

  @Post('conversations/:id/read')
  @HttpCode(204)
  async read(@CurrentUser() user: ChatActor, @Param('id', ParseUUIDPipe) id: string) {
    await this.chat.markRead(user, id);
  }

  /** Streams an image / voice note to a participant of its thread. */
  @Get('messages/:id/attachment')
  async attachment(
    @CurrentUser() user: ChatActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    this.stream(res, await this.chat.attachment(user, id));
  }

  private stream(res: Response, file: { path: string; mime: string }) {
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // The file sits under the `.chat` dot-folder, which sendFile refuses by
    // default — that refusal is what keeps the public /uploads route away from it.
    res.sendFile(file.path, { dotfiles: 'allow' }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ statusCode: 404, message: 'Attachment not found' });
    });
  }

  // ─── Announcements (received broadcasts) ───

  @Get('announcements/summary')
  async announcementsSummary(@CurrentUser() user: ChatActor) {
    return new ApiResponse(await this.chat.announcementsSummary(user));
  }

  @Get('announcements')
  async announcements(@CurrentUser() user: ChatActor, @Query() q: BroadcastListQueryDto) {
    return new ApiResponse(await this.chat.listAnnouncements(user, q));
  }

  @Post('announcements/read')
  @HttpCode(204)
  async announcementsRead(@CurrentUser() user: ChatActor) {
    await this.chat.markAnnouncementsRead(user);
  }

  // ─── Broadcasts (sending; perm chat-broadcast) ───

  @Get('broadcasts/audiences')
  @Permissions(CHAT_BROADCAST_PERMISSION)
  async broadcastAudiences(@CurrentUser() user: ChatActor) {
    return new ApiResponse(await this.chat.broadcastAudiences(user));
  }

  @Get('broadcasts')
  @Permissions(CHAT_BROADCAST_PERMISSION)
  async broadcasts(@Query() q: BroadcastListQueryDto) {
    return new ApiResponse(await this.chat.listSentBroadcasts(q));
  }

  /** Send to an audience: TEXT, IMAGE, VOICE or LOCATION, same fields as a 1:1 message. */
  @Post('broadcasts')
  @Permissions(CHAT_BROADCAST_PERMISSION)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: CHAT_MAX_FILE_BYTES, files: 1 },
    }),
  )
  async sendBroadcast(
    @CurrentUser() user: ChatActor,
    @Body() dto: SendBroadcastDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return new ApiResponse(await this.chat.sendBroadcast(user, dto, file));
  }

  @Get('broadcasts/:id/recipients')
  @Permissions(CHAT_BROADCAST_PERMISSION)
  async broadcastRecipients(@Param('id', ParseUUIDPipe) id: string) {
    return new ApiResponse(await this.chat.broadcastRecipients(id));
  }

  /** A broadcast's photo / voice note — recipients and broadcast managers only. */
  @Get('broadcasts/:id/attachment')
  async broadcastAttachment(
    @CurrentUser() user: ChatActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    this.stream(res, await this.chat.broadcastAttachment(user, id));
  }

  // ─── Settings (Company page) ───

  @Get('settings')
  @Permissions('company')
  async settings() {
    return new ApiResponse(await this.chat.getSettings());
  }

  @Patch('settings')
  @Permissions('company.editSettings')
  async updateSettings(@Body() dto: UpdateChatSettingsDto) {
    return new ApiResponse(await this.chat.updateSettings(dto));
  }
}
