import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../../common/database/prisma.service.js';
import { StudyRecordsService } from '../study-records/study-records.service.js';
import { SystemMessagesService } from './system-messages.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ASIA_SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function getPreviousWeekStart(): Date {
  const now = new Date();
  const local = new Date(now.getTime() + ASIA_SHANGHAI_OFFSET_MS);
  const localDay = local.getUTCDay();
  const daysSinceMonday = (localDay + 6) % 7;
  const localMidnightUtcMs = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const thisMonday = new Date(localMidnightUtcMs - daysSinceMonday * DAY_MS - ASIA_SHANGHAI_OFFSET_MS);
  return new Date(thisMonday.getTime() - 7 * DAY_MS);
}

function getWeekLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
  const startStr = weekStart.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  const endStr = weekEnd.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  return `${startStr} ~ ${endStr}`;
}

@Injectable()
export class WeeklyReportService {
  private readonly logger = new Logger(WeeklyReportService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StudyRecordsService) private readonly studyRecordsService: StudyRecordsService,
    @Inject(SystemMessagesService) private readonly messagesService: SystemMessagesService,
  ) {}

  @Cron('0 17 * * 0') // Sunday 5 PM UTC = Monday 1 AM Asia/Shanghai
  async generateWeeklyReportsForActiveUsers(): Promise<void> {
    this.logger.log('Starting weekly report generation for active users');

    try {
      const weekStart = getPreviousWeekStart();
      const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
      const weekLabel = getWeekLabel(weekStart);

      // Find users who had study records in the previous week
      const activeUsers = await this.prisma.studyRecord.findMany({
        where: {
          validFlag: true,
          startTime: { gte: weekStart, lt: weekEnd },
        },
        select: { userId: true },
        distinct: ['userId'],
      });

      let generated = 0;

      for (const { userId } of activeUsers) {
        try {
          // Skip if already generated for this week
          const existing = await this.prisma.systemMessage.findFirst({
            where: {
              type: 'PERSONAL',
              userId,
              title: { contains: `学习周报 (${weekLabel})` },
            },
          });

          if (existing) continue;

          const stats = await this.studyRecordsService.getMyStats({ user_id: userId, roles: ['STUDENT'] }, weekEnd);

          const content = JSON.stringify({
            type: 'WEEKLY_REPORT',
            week_start: weekStart.toISOString(),
            week_end: weekEnd.toISOString(),
            week_visit_count: stats.week_visit_count,
            week_duration_minutes: stats.week_duration_minutes,
            total_duration_minutes: stats.total_duration_minutes,
            streak_days: stats.streak_days,
            no_show_count_week: stats.no_show_count_week,
          });

          await this.messagesService.create({
            type: 'PERSONAL',
            user_id: userId,
            title: `📊 你的学习周报 (${weekLabel})`,
            content,
          });

          generated++;
        } catch (err) {
          this.logger.warn(`Failed to generate report for user ${userId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      this.logger.log(`Weekly report generation complete: ${genered} reports created`);
    } catch (err) {
      this.logger.error(`Weekly report generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
