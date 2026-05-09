'use client';

import { useEffect, useState } from 'react';
import { getApiClient } from '@/lib/api';
import { Row, Col, Card, Statistic, Tag, Flex, Divider, Spin, Empty, App } from 'antd';
import { RiseOutlined, DesktopOutlined, WarningOutlined } from '@ant-design/icons';
import type { AdminDashboardDto, NoShowRecordDto, AnomalyEventDto } from '@smartseat/contracts';

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState<AdminDashboardDto | null>(null);
  const [noShows, setNoShows] = useState<NoShowRecordDto[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { message } = App.useApp();

  useEffect(() => {
    const api = getApiClient();
    Promise.all([
      api.admin.dashboard(),
      api.admin.noShows({ page: 1, page_size: 5 }),
      api.admin.anomalies({ page: 1, page_size: 5 })
    ])
      .then(([dashData, nsData, anomData]) => {
        setDashboard(dashData);
        setNoShows(nsData.items);
        setAnomalies(anomData.items);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
        message.error('加载看板数据失败');
      })
      .finally(() => setLoading(false));
  }, [message]);

  if (loading) {
    return <div className="flex justify-center py-24"><Spin size="large" /></div>;
  }

  if (error) {
    return <div className="text-center py-24 text-red-500">{error}</div>;
  }

  if (!dashboard) return null;

  return (
    <div className="space-y-4 flex-1 flex flex-col">
      <h1 className="text-lg font-semibold">全局看板</h1>

      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <Card hoverable style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }}>
            <Statistic
              title="系统总座位"
              value={dashboard.seat_count}
              prefix={<DesktopOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card hoverable style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }}>
            <Statistic
              title="今日预约"
              value={dashboard.reservation_count_today}
              suffix={<span className="text-xs text-slate-400">/ No-Show {dashboard.no_show_count_today}</span>}
              prefix={<RiseOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card hoverable style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }}>
            <Statistic
              title="设备状态"
              value={`${dashboard.online_device_count} / ${dashboard.offline_device_count}`}
              styles={{ content: { color: dashboard.offline_device_count > 0 ? '#f59e0b' : '#10b981' } }}
            />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card hoverable style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }}>
            <Statistic
              title="待处理异常"
              value={dashboard.pending_anomaly_count}
              prefix={<WarningOutlined />}
              styles={{ content: { color: dashboard.pending_anomaly_count > 0 ? '#ef4444' : '#10b981' } }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="最近 No-Show 记录" size="small" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }}>
            {noShows.length === 0 ? (
              <Empty description="暂无 No-Show 记录" />
            ) : (
              <Flex vertical gap={0}>
                {noShows.map((ns, i) => (
                  <div key={ns.reservation_id}>
                    {i > 0 && <Divider style={{ margin: 0 }} />}
                    <Flex justify="space-between" align="center" className="py-2 px-1">
                      <div>
                        <div className="text-sm font-medium">座位 {ns.seat_no}</div>
                        <div className="text-xs text-slate-400">{new Date(ns.start_time).toLocaleString('zh-CN')}</div>
                      </div>
                      <Tag color="error">违约</Tag>
                    </Flex>
                  </div>
                ))}
              </Flex>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="最近系统动态" size="small" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }}>
            {anomalies.length === 0 ? (
              <Empty description="暂无异常事件" />
            ) : (
              <Flex vertical gap={0}>
                {anomalies.map((a, i) => (
                  <div key={a.event_id}>
                    {i > 0 && <Divider style={{ margin: 0 }} />}
                    <Flex justify="space-between" align="center" className="py-2 px-1">
                      <div>
                        <div className="text-sm font-medium">{a.description}</div>
                        <div className="text-xs text-slate-400">{new Date(a.created_at).toLocaleString('zh-CN')}</div>
                      </div>
                      <Tag color={a.status === 'PENDING' ? 'warning' : 'default'}>{a.status}</Tag>
                    </Flex>
                  </div>
                ))}
              </Flex>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
