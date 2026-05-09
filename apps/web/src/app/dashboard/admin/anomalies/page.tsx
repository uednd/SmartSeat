'use client';

import { useEffect, useState } from 'react';
import { getApiClient } from '@/lib/api';
import { Tag, Select, Modal, Input, Button, Spin, Empty, App, Space, Flex, Divider, Pagination } from 'antd';
import { AnomalyStatus, type AnomalyEventDto } from '@smartseat/contracts';

const anomalyTypeLabels: Record<string, string> = {
  NO_SHOW: '未签到',
  UNRESERVED_OCCUPANCY: '疑似未预约占用',
  EARLY_LEAVE_SUSPECTED: '疑似提前离座',
  OVERTIME_OCCUPANCY: '超时占用',
  DEVICE_OFFLINE: '设备离线',
  SENSOR_ERROR: '传感器异常',
  CHECKIN_FAILED: '签到失败'
};

const statusColorMap: Record<string, string> = {
  PENDING: 'error',
  ACKNOWLEDGED: 'processing',
  HANDLED: 'success',
  IGNORED: 'default',
  CLOSED: 'default'
};

export default function AdminAnomaliesPage() {
  const [anomalies, setAnomalies] = useState<AnomalyEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<AnomalyStatus | ''>(AnomalyStatus.PENDING);
  const [resolveTarget, setResolveTarget] = useState<AnomalyEventDto | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [resolveLoading, setResolveLoading] = useState(false);
  const { message } = App.useApp();
  const pageSize = 20;

  async function fetchAnomalies(p: number, status: AnomalyStatus | '') {
    const api = getApiClient();
    return api.admin.anomalies({ page: p, page_size: pageSize, status: status || undefined });
  }

  useEffect(() => {
    let ignore = false;
    Promise.resolve()
      .then(() => { if (!ignore) { setLoading(true); setError(null); } })
      .then(() => fetchAnomalies(page, statusFilter))
      .then((result) => { if (!ignore) { setAnomalies(result.items); setTotal(result.total); } })
      .catch((err) => { if (!ignore) setError(err instanceof Error ? err.message : 'Failed to load anomalies'); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [page, statusFilter]);

  const handleResolve = async () => {
    if (!resolveTarget) return;
    setResolveLoading(true);
    try {
      const api = getApiClient();
      await api.admin.handleAnomaly({
        event_id: resolveTarget.event_id,
        status: AnomalyStatus.HANDLED,
        handle_note: resolveNote
      });
      message.success('异常事件已标记为已处理');
      setResolveTarget(null);
      setResolveNote('');
      fetchAnomalies(page, statusFilter);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败');
    } finally {
      setResolveLoading(false);
    }
  };

  if (error) {
    return <div className="text-center py-24 text-red-500">{error}</div>;
  }

  return (
    <div className="space-y-4 flex-1 flex flex-col">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-semibold">异常事件处理</h1>
        <Select
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
          className="w-32"
          options={[
            { value: '', label: '全部状态' },
            { value: 'PENDING', label: '未处理' },
            { value: 'ACKNOWLEDGED', label: '已确认' },
            { value: 'HANDLED', label: '已处理' },
            { value: 'IGNORED', label: '已忽略' },
            { value: 'CLOSED', label: '已关闭' }
          ]}
        />
      </div>

      <Spin spinning={loading}>
        {anomalies.length === 0 ? (
          <Empty description="暂无异常事件" />
        ) : (
          <>
            <Flex vertical gap={0} className="rounded-lg border border-white/40 overflow-hidden" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }}>
              {anomalies.map((event, i) => (
                <div
                  key={event.event_id}
                  className={event.status === AnomalyStatus.PENDING ? 'bg-red-50/30' : ''}
                  style={event.status === AnomalyStatus.PENDING ? { borderLeft: '3px solid #ef4444' } : {}}
                >
                  {i > 0 && <Divider style={{ margin: 0 }} />}
                  <div className="px-4 py-3">
                    <Flex justify="space-between" align="start" gap={8}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{event.description}</div>
                        <Flex gap={12} className="mt-1 text-xs text-slate-400" wrap="wrap">
                          <span>{anomalyTypeLabels[event.event_type] ?? event.event_type}</span>
                          <span>座位 {event.seat_id.slice(0, 8)}...</span>
                          <span>{new Date(event.created_at).toLocaleString('zh-CN')}</span>
                          {event.resolved_at && (
                            <span className="text-emerald-600">已解决 {new Date(event.resolved_at).toLocaleString('zh-CN')}</span>
                          )}
                        </Flex>
                        {event.handle_note && (
                          <div className="mt-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-1.5">
                            备注：{event.handle_note}
                          </div>
                        )}
                      </div>
                      <Space orientation="vertical" align="end" size={4} className="shrink-0">
                        <Tag color={statusColorMap[event.status] ?? 'default'}>{event.status}</Tag>
                        {event.status === AnomalyStatus.PENDING && (
                          <Button size="small" type="link" onClick={() => setResolveTarget(event)}>
                            标记已处理
                          </Button>
                        )}
                      </Space>
                    </Flex>
                  </div>
                </div>
              ))}
            </Flex>
            <div className="flex justify-center mt-4">
              <Pagination
                current={page}
                pageSize={pageSize}
                total={total}
                showTotal={(t) => `共 ${t} 条`}
                onChange={(p) => setPage(p)}
              />
            </div>
          </>
        )}
      </Spin>

      <Modal
        title="标记为已处理"
        open={!!resolveTarget}
        onCancel={() => { setResolveTarget(null); setResolveNote(''); }}
        onOk={handleResolve}
        confirmLoading={resolveLoading}
        okText="确认已处理"
        cancelText="取消"
      >
        <div className="pt-2">
          <p className="text-sm text-slate-500 mb-3">
            处理异常事件：<strong>{resolveTarget?.description}</strong>
          </p>
          <Input.TextArea
            rows={3}
            placeholder="可选：填写处理备注"
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
