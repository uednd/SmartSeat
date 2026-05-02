import { Injectable } from '@nestjs/common';
import { type UserRole } from '@prisma/client';

import { PrismaService } from '../../common/database/prisma.service.js';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(userId: string) {
    return this.prisma.user.findUnique({
      where: { userId }
    });
  }

  countByRole(role: UserRole) {
    return this.prisma.user.count({
      where: {
        roles: {
          has: role
        }
      }
    });
  }
}
