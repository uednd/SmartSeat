'use client';

import { useEffect, useState, useCallback } from 'react';
import { getApiClient } from '@/lib/api';
import { useToast } from '@/lib/toast';
import type { AnomalyEventDto } from '@smartseat/contracts';
import { AnomalyStatus } from '@smartseat/contracts';

interface ResolveModalProps {
  event: AnomalyEventDto;
  onClose: () => void;
  onConfirm: (note: string) => void;
  loading: boolean;
}

function ResolveModal({ event, onClose, onConfirm, loading }: ResolveModalProps) {
  const [note, setNote] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">标记为已处理</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          处理异常事件：<strong>{event.description}</strong>
        </p>

        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            处理备注 <span className="text-slate-400">(可选)</span>
          </label>
          <textarea
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            rows={3}
            placeholder="可选：填写处理备注..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
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
            onClick={() => onConfirm(note)}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? '提交中...' : '确认已处理'}
          </button>
        </div>
      </div>
    </div>
  );
}

const anomalyTypeLabels: Record<string, string> = {
  NO_SHOW: '未签到 (No-Show)',
  UNRESERVED_OCCUPANCY: '疑似未预约占用',
  EARLY_LEAVE_SUSPECTED: '疑似提前离座',
  OVERTIME_OCCUPANCY: '超时占用',
  DEVICE_OFFLINE: '设备离线',
  SENSOR_ERROR: '传感器异常',
  CHECKIN_FAILED: '签到失败'
};

const statusStyleMap: Record<string, string> = {
  PENDING: 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
  ACKNOWLEDGED: 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400',
  HANDLED: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400',
  IGNORED: 'bg-slate-100 dark:bg-slate-800 text-slate-500',
  CLOSED: 'bg-slate-100 dark:bg-slate-800 text-slate-500'
};

export default function AdminAnomaliesPage() {
  const [anomalies, setAnomalies] = useState<AnomalyEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<AnomalyStatus | ''>(AnomalyStatus.PENDING);

  const [resolveTarget, setResolveTarget] = useState<AnomalyEventDto | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const { showToast } = useToast();

  const pageSize = 20;

  const fetchAnomalies = useCallback(async (p: number, status: AnomalyStatus | '') => {
    setLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const result = await api.admin.anomalies({
        page: p,
        page_size: pageSize,
        status: status || undefined
      });
      setAnomalies(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load anomalies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnomalies(page, statusFilter);
  }, [page, statusFilter, fetchAnomalies]);

  const handleResolve = async (note: string) => {
    if (!resolveTarget) return;
    setResolveLoading(true);
    try {
      const api = getApiClient();
      await api.admin.handleAnomaly({
        event_id: resolveTarget.event_id,
        status: AnomalyStatus.HANDLED,
        handle_note: note
      });
      showToast('success', `异常事件已标记为已处理`);
      setResolveTarget(null);
      fetchAnomalies(page, statusFilter);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '操作失败');
    } finally {
      setResolveLoading(false);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">异常事件处理</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            毫米波雷达判定的异常事件仲裁中心
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as AnomalyStatus | ''); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">全部状态</option>
          <option value="PENDING">未处理</option>
          <option value="ACKNOWLEDGED">已确认</option>
          <option value="HANDLED">已处理</option>
          <option value="IGNORED">已忽略</option>
          <option value="CLOSED">已关闭</option>
        </select>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : anomalies.length === 0 ? (
          <div className="py-24 text-center text-sm text-slate-400">暂无异常事件</div>
        ) : (
          anomalies.map((event) => (
            <div
              key={event.event_id}
              className={`px-5 py-4 transition-colors ${
                event.status === AnomalyStatus.PENDING
                  ? 'bg-red-50/30 dark:bg-red-950/20 border-l-4 border-l-red-500'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                      {event.description}
                    </span>
                    {event.status === AnomalyStatus.PENDING && (
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span>{anomalyTypeLabels[event.event_type] ?? event.event_type}</span>
                    <span>座位 {event.seat_id.slice(0, 8)}...</span>
                    <span>{new Date(event.created_at).toLocaleString('zh-CN')}</span>
                    {event.resolved_at && (
                      <span className="text-emerald-600">已解决 {new Date(event.resolved_at).toLocaleString('zh-CN')}</span>
                    )}
                  </div>
                  {event.handle_note && (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-1.5">
                      备注：{event.handle_note}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-medium px-2 py-1 rounded border ${statusStyleMap[event.status] ?? statusStyleMap.PENDING}`}>
                    {event.status}
                  </span>
                  {event.status === AnomalyStatus.PENDING && (
                    <button
                      onClick={() => setResolveTarget(event)}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
                    >
                      标记已处理
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
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

      {/* Resolve Modal */}
      {resolveTarget && (
        <ResolveModal
          event={resolveTarget}
          onClose={() => setResolveTarget(null)}
          onConfirm={handleResolve}
          loading={resolveLoading}
        />
      )}
    </div>
  );
}
