'use client';

import { useEffect, useState } from 'react';
import { getApiClient } from '@/lib/api';
import { Table, Tag, Button, Modal, Input, Space, Empty, App } from 'antd';
import { SeatStatus, DeviceOnlineStatus } from '@smartseat/contracts';
import type { AdminSeatOverviewDto } from '@smartseat/contracts';

const statusTagMap: Record<string, { label: string; color: string }> = {
  FREE: { label: '空闲', color: 'success' },
  RESERVED: { label: '已预约', color: 'warning' },
  OCCUPIED: { label: '使用中', color: 'error' },
  ENDING_SOON: { label: '即将结束', color: 'processing' },
  PENDING_RELEASE: { label: '待释放', color: 'default' }
};

const presenceTagMap: Record<string, { label: string; color: string }> = {
  PRESENT: { label: '在位', color: 'success' },
  ABSENT: { label: '离位', color: 'error' },
  UNKNOWN: { label: '未知', color: 'default' },
  ERROR: { label: '异常', color: 'error' }
};

export default function AdminSeatsPage() {
  const [seats, setSeats] = useState<AdminSeatOverviewDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [maintenanceLoading, setMaintenanceLoading] = useState<Record<string, boolean>>({});

  const [releaseTarget, setReleaseTarget] = useState<AdminSeatOverviewDto | null>(null);
  const [releaseReason, setReleaseReason] = useState('');
  const [releaseLoading, setReleaseLoading] = useState(false);

  const { message } = App.useApp();
  const pageSize = 20;

  async function fetchSeats(p: number) {
    const api = getApiClient();
    return api.admin.seats({ page: p, page_size: pageSize });
  }

  useEffect(() => {
    let ignore = false;
    Promise.resolve()
      .then(() => { if (!ignore) { setLoading(true); setError(null); } })
      .then(() => fetchSeats(page))
      .then((result) => { if (!ignore) { setSeats(result.items); setTotal(result.total); } })
      .catch((err) => { if (!ignore) setError(err instanceof Error ? err.message : 'Failed to load seats'); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [page]);

  const handleMaintenanceToggle = async (seat: AdminSeatOverviewDto) => {
    const newMaintenance = !seat.maintenance;
    setMaintenanceLoading((prev) => ({ ...prev, [seat.seat_id]: true }));
    try {
      const api = getApiClient();
      await api.admin.setSeatMaintenance({
        seat_id: seat.seat_id,
        maintenance: newMaintenance,
        reason: newMaintenance ? '管理员手动进入维护模式' : '管理员手动恢复正常'
      });
      message.success(newMaintenance ? `座位 ${seat.seat_no} 已进入维护模式` : `座位 ${seat.seat_no} 已恢复正常`);
      fetchSeats(page);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败');
    } finally {
      setMaintenanceLoading((prev) => ({ ...prev, [seat.seat_id]: false }));
    }
  };

  const handleRelease = async () => {
    if (!releaseTarget || !releaseReason.trim()) return;
    setReleaseLoading(true);
    try {
      const api = getApiClient();
      await api.admin.releaseSeat({
        seat_id: releaseTarget.seat_id,
        reason: releaseReason,
        restore_availability: true,
        exclude_study_record: false
      });
      message.success(`座位 ${releaseTarget.seat_no} 已强制释放`);
      setReleaseTarget(null);
      setReleaseReason('');
      fetchSeats(page);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '释放失败');
    } finally {
      setReleaseLoading(false);
    }
  };

  if (error) {
    return <div className="text-center py-24 text-red-500">{error}</div>;
  }

  const columns = [
    { title: '座位号', dataIndex: 'seat_no', key: 'seat_no', width: 100 },
    { title: '区域', dataIndex: 'area', key: 'area', width: 100 },
    {
      title: '状态', dataIndex: 'business_status', key: 'status', width: 100,
      render: (s: string) => {
        const info = statusTagMap[s] ?? { label: s, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      }
    },
    {
      title: '在位检测', dataIndex: 'presence_status', key: 'presence', width: 100,
      render: (s: string) => {
        const info = presenceTagMap[s] ?? { label: s, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      }
    },
    {
      title: '绑定设备', dataIndex: 'device', key: 'device', width: 160,
      render: (d: AdminSeatOverviewDto['device']) => {
        if (!d) return <span className="text-slate-400 text-xs">未绑定</span>;
        const online = d.online_status === DeviceOnlineStatus.ONLINE;
        return (
          <Space size={4}>
            <span className={`inline-block w-2 h-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-xs">{online ? '在线' : '离线'}</span>
            <span className="text-xs text-slate-400">{d.device_id.slice(0, 8)}...</span>
          </Space>
        );
      }
    },
    {
      title: '维护模式', dataIndex: 'maintenance', key: 'maintenance', width: 90,
      render: (v: boolean) => v ? <Tag color="warning">维护中</Tag> : <span className="text-xs text-slate-400">正常</span>
    },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: unknown, record: AdminSeatOverviewDto) => {
        const isOccupied = record.business_status === SeatStatus.OCCUPIED || record.business_status === SeatStatus.RESERVED;
        return (
          <Space size={4}>
            <Button
              size="small"
              loading={maintenanceLoading[record.seat_id]}
              onClick={() => handleMaintenanceToggle(record)}
            >
              {record.maintenance ? '恢复正常' : '维护模式'}
            </Button>
            {isOccupied && (
              <Button size="small" danger onClick={() => setReleaseTarget(record)}>
                强制释放
              </Button>
            )}
          </Space>
        );
      }
    }
  ];

  return (
    <div className="space-y-4 flex-1 flex flex-col">
      <h1 className="text-lg font-semibold">座位与终端管理</h1>

      <Table
        columns={columns}
        dataSource={seats}
        rowKey="seat_id"
        loading={loading}
        scroll={{ x: 900 }}
        locale={{ emptyText: <Empty description="暂无座位数据" /> }}
        pagination={{
          current: page,
          pageSize,
          total,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p) => setPage(p)
        }}
      />

      <Modal
        title="强制释放座位"
        open={!!releaseTarget}
        onCancel={() => { setReleaseTarget(null); setReleaseReason(''); }}
        onOk={handleRelease}
        confirmLoading={releaseLoading}
        okText="确认强制释放"
        okButtonProps={{ danger: true, disabled: !releaseReason.trim() }}
        cancelText="取消"
      >
        {releaseTarget && (
          <div className="pt-2">
            <p className="text-sm text-slate-500 mb-3">
              您正在强制释放座位 <strong>{releaseTarget.seat_no}</strong>（{releaseTarget.area}）
            </p>
            <Input.TextArea
              rows={3}
              placeholder="请输入强制释放的原因（必填）"
              value={releaseReason}
              onChange={(e) => setReleaseReason(e.target.value)}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
