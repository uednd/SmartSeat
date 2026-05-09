'use client';

import { useEffect, useState, useCallback } from 'react';
import { getApiClient } from '@/lib/api';
import { useToast } from '@/lib/toast';
import type { AdminSeatOverviewDto } from '@smartseat/contracts';
import { SeatStatus, PresenceStatus, DeviceOnlineStatus } from '@smartseat/contracts';

interface ReleaseModalProps {
  seat: AdminSeatOverviewDto;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}

function ReleaseModal({ seat, onClose, onConfirm, loading }: ReleaseModalProps) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">强制释放座位</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          您正在强制释放座位 <strong>{seat.seat_no}</strong>（{seat.area}）
        </p>

        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            释放原因 <span className="text-red-500">*</span>
          </label>
          <textarea
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
            rows={3}
            placeholder="请输入强制释放的原因..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={!reason.trim() || loading}
            className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '处理中...' : '确认强制释放'}
          </button>
        </div>
      </div>
    </div>
  );
}

function statusBadge(status: SeatStatus) {
  const map: Record<string, { label: string; cls: string }> = {
    FREE: { label: '空闲', cls: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400' },
    RESERVED: { label: '已预约', cls: 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400' },
    OCCUPIED: { label: '使用中', cls: 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400' },
    ENDING_SOON: { label: '即将结束', cls: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400' },
    PENDING_RELEASE: { label: '待释放', cls: 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400' }
  };
  const info = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded ${info.cls}`}>{info.label}</span>;
}

export default function AdminSeatsPage() {
  const [seats, setSeats] = useState<AdminSeatOverviewDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [releaseTarget, setReleaseTarget] = useState<AdminSeatOverviewDto | null>(null);
  const [releaseLoading, setReleaseLoading] = useState(false);

  const [maintenanceLoading, setMaintenanceLoading] = useState<Record<string, boolean>>({});
  const { showToast } = useToast();

  const pageSize = 20;

  const fetchSeats = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const result = await api.admin.seats({ page: p, page_size: pageSize });
      setSeats(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load seats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSeats(page);
  }, [page, fetchSeats]);

  const handleMaintenanceToggle = async (seat: AdminSeatOverviewDto) => {
    const newMaintenance = !seat.maintenance;
    const reason = newMaintenance ? '管理员手动进入维护模式' : '管理员手动恢复正常';

    setMaintenanceLoading((prev) => ({ ...prev, [seat.seat_id]: true }));
    try {
      const api = getApiClient();
      await api.admin.setSeatMaintenance({
        seat_id: seat.seat_id,
        maintenance: newMaintenance,
        reason
      });
      showToast('success', newMaintenance ? `座位 ${seat.seat_no} 已进入维护模式` : `座位 ${seat.seat_no} 已恢复正常`);
      fetchSeats(page);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '操作失败');
    } finally {
      setMaintenanceLoading((prev) => ({ ...prev, [seat.seat_id]: false }));
    }
  };

  const handleRelease = async (reason: string) => {
    if (!releaseTarget) return;
    setReleaseLoading(true);
    try {
      const api = getApiClient();
      await api.admin.releaseSeat({
        seat_id: releaseTarget.seat_id,
        reason,
        restore_availability: true,
        exclude_study_record: false
      });
      showToast('success', `座位 ${releaseTarget.seat_no} 已强制释放`);
      setReleaseTarget(null);
      fetchSeats(page);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '释放失败');
    } finally {
      setReleaseLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl p-6 text-red-700 dark:text-red-400 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">座位与终端管理</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          管理所有座位及绑定设备，执行维护与强制释放操作
        </p>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">座位号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">区域</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">状态</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">在位检测</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">绑定设备</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">维护模式</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-24 text-center">
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : seats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-24 text-center text-sm text-slate-400">暂无座位数据</td>
                </tr>
              ) : (
                seats.map((seat) => {
                  const deviceOnline = seat.device?.online_status === DeviceOnlineStatus.ONLINE;
                  const isOccupied = seat.business_status === SeatStatus.OCCUPIED || seat.business_status === SeatStatus.RESERVED;

                  return (
                    <tr key={seat.seat_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{seat.seat_no}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{seat.area}</td>
                      <td className="px-4 py-3">{statusBadge(seat.business_status)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          seat.presence_status === PresenceStatus.PRESENT
                            ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                            : seat.presence_status === PresenceStatus.ABSENT
                            ? 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}>
                          {seat.presence_status === PresenceStatus.PRESENT ? '在位' : seat.presence_status === PresenceStatus.ABSENT ? '离位' : '未知'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {seat.device ? (
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${deviceOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            <span className="text-xs">{deviceOnline ? '在线' : '离线'}</span>
                            <span className="text-xs text-slate-400">{seat.device.device_id.slice(0, 8)}...</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">未绑定</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {seat.maintenance ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400">维护中</span>
                        ) : (
                          <span className="text-xs text-slate-400">正常</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleMaintenanceToggle(seat)}
                            disabled={maintenanceLoading[seat.seat_id]}
                            className={`text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                              seat.maintenance
                                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900'
                                : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900'
                            }`}
                          >
                            {seat.maintenance ? '恢复正常' : '维护模式'}
                          </button>
                          {isOccupied && (
                            <button
                              onClick={() => setReleaseTarget(seat)}
                              className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
                            >
                              强制释放
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500">共 {total} 条记录</p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                上一页
              </button>
              <span className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Release Modal */}
      {releaseTarget && (
        <ReleaseModal
          seat={releaseTarget}
          onClose={() => setReleaseTarget(null)}
          onConfirm={handleRelease}
          loading={releaseLoading}
        />
      )}
    </div>
  );
}
