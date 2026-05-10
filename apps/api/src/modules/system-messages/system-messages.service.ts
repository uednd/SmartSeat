import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ApiErrorCode } from '@smartseat/contracts';
import type { SystemMessageDto, CreateSystemMessageRequest } from '@smartseat/contracts';
import { MessageType } from '@prisma/client';

import { PrismaService } from '../../common/database/prisma.service.js';
import { AppHttpException } from '../../common/errors/app-http.exception.js';

@Injectable()
export class SystemMessagesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(dto: CreateSystemMessageRequest): Promise<SystemMessageDto> {
    const message = await this.prisma.systemMessage.create({
      data: {
        type: (dto.type ?? 'BROADCAST') as MessageType,
        userId: dto.user_id ?? null,
        title: dto.title.trim(),
        content: dto.content.trim(),
      },
    });

    return {
      id: message.id,
      type: message.type as unknown as SystemMessageDto['type'],
      user_id: message.userId ?? undefined,
      title: message.title,
      content: message.content,
      has_dismissed: false,
      created_at: message.createdAt.toISOString(),
    };
  }

  async listForUser(userId: string): Promise<SystemMessageDto[]> {
    const messages = await this.prisma.systemMessage.findMany({
      where: {
        OR: [
          { type: 'BROADCAST' },
          { type: 'PERSONAL', userId },
        ],
      },
      include: {
        dismisses: {
          where: { userId },
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return messages.map((m) => ({
      id: m.id,
      type: m.type as unknown as SystemMessageDto['type'],
      user_id: m.userId ?? undefined,
      title: m.title,
      content: m.content,
      has_dismissed: m.dismisses.length > 0,
      created_at: m.createdAt.toISOString(),
    }));
  }

  async getLatestUndismissed(userId: string): Promise<SystemMessageDto | null> {
    const latest = await this.prisma.systemMessage.findFirst({
      where: {
        OR: [
          { type: 'BROADCAST' },
          { type: 'PERSONAL', userId },
        ],
        dismisses: { none: { userId } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latest) return null;

    return {
      id: latest.id,
      type: latest.type as unknown as SystemMessageDto['type'],
      user_id: latest.userId ?? undefined,
      title: latest.title,
      content: latest.content,
      has_dismissed: false,
      created_at: latest.createdAt.toISOString(),
    };
  }

  async dismiss(userId: string, messageId: string): Promise<void> {
    const message = await this.prisma.systemMessage.findUnique({ where: { id: messageId } });
    if (!message) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ApiErrorCode.RESOURCE_NOT_FOUND,
        'System message not found.',
        { message_id: messageId },
      );
    }

    await this.prisma.userMessageDismiss.upsert({
      where: { userId_messageId: { userId, messageId } },
      create: { userId, messageId },
      update: {},
    });
  }
}
