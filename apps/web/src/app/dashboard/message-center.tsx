'use client';

import { useEffect, useState } from 'react';
import { Button, Drawer, Typography, Tag, Empty, Badge, App } from 'antd';
import { BellOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { SystemMessageDto } from '@smartseat/contracts';
import { getApiClient } from '@/lib/api';

const { Text, Paragraph } = Typography;

export default function MessageCenter() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SystemMessageDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const { message: msg } = App.useApp();

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const api = getApiClient();
      const result = await api.me.listSystemMessages();
      setMessages(result);
      setHasUnread(result.some((m) => !m.has_dismissed));
    } catch {
      msg.error('无法加载消息');
    } finally {
      setLoading(false);
    }
  };

  // Check for undismissed messages on mount
  useEffect(() => {
    const api = getApiClient();
    api.me.getLatestSystemMessage()
      .then((latest) => { if (latest) setHasUnread(true); })
      .catch(() => {});
  }, []);

  const handleOpen = () => {
    setOpen(true);
    fetchMessages();
  };

  const formatContent = (content: string): string => {
    try {
      const parsed = JSON.parse(content);
      if (parsed.type === 'WEEKLY_REPORT') {
        const hours = Math.floor(parsed.week_duration_minutes / 60);
        const mins = parsed.week_duration_minutes % 60;
        return `本周打卡 ${parsed.week_visit_count} 次，学习时长 ${hours}h ${mins}m，连续 ${parsed.streak_days} 天，累计 ${Math.floor(parsed.total_duration_minutes / 60)}h ${parsed.total_duration_minutes % 60}m`;
      }
      return content;
    } catch {
      return content;
    }
  };

  return (
    <>
      <Badge dot={hasUnread} offset={[-2, 2]}>
        <Button
          type="text"
          icon={<BellOutlined style={{ fontSize: 18 }} />}
          onClick={handleOpen}
          aria-label="消息中心"
        />
      </Badge>

      <Drawer
        title="消息中心"
        open={open}
        onClose={() => setOpen(false)}
        placement="right"
        size="large"
      >
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <Empty description="暂无消息" />
        ) : (
          <div className="divide-y">
            {messages.map((item) => (
              <div key={item.id} className={!item.has_dismissed ? 'bg-blue-50/50 px-4 py-3' : 'px-4 py-3'}>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <InfoCircleOutlined style={{ color: item.type === 'PERSONAL' ? '#8b5cf6' : '#3b82f6' }} />
                    <Text strong className="text-sm flex-1">{item.title}</Text>
                    <Tag color={item.type === 'PERSONAL' ? 'purple' : 'blue'}>
                      {item.type === 'PERSONAL' ? '个人' : '广播'}
                    </Tag>
                    {!item.has_dismissed && <Badge status="processing" />}
                  </div>
                  <Paragraph
                    className="text-xs text-slate-500 mb-0"
                    ellipsis={{ rows: 2 }}
                  >
                    {formatContent(item.content)}
                  </Paragraph>
                  <Text className="text-[10px] text-slate-400">
                    {new Date(item.created_at).toLocaleString('zh-CN')}
                  </Text>
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </>
  );
}
