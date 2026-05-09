'use client';

import { useEffect, useState } from 'react';
import { getApiClient } from '@/lib/api';
import type { AdminDashboardDto, NoShowRecordDto, AnomalyEventDto } from '@smartseat/contracts';

function StatCard({
  label,
  value,
  sub,
  color
}: {
  label: string;
  value: number | string;
  sub?: string;
  color: 'blue' | 'emerald' | 'amber' | 'red';
}) {
  const borderMap = {
    blue: 'border-l-blue-600',
    emerald: 'border-l-emerald-600',
    amber: 'border-l-amber-500',
    red: 'border-l-red-600'
  };

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 border-l-4 ${borderMap[color]} p-5`}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState<AdminDashboardDto | null>(null);
  const [noShows, setNoShows] = useState<NoShowRecordDto[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl p-6 text-red-700 dark:text-red-400 text-sm">
        {error}
      </div>
    );
  }

  if (!dashboard) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">全局看板</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">系统运行状态概览</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="系统总座位"
          value={dashboard.seat_count}
          color="blue"
        />
        <StatCard
          label="今日预约"
          value={dashboard.reservation_count_today}
          sub={`No-Show ${dashboard.no_show_count_today} 次`}
          color="emerald"
        />
        <StatCard
          label="设备状态"
          value={`${dashboard.online_device_count} / ${dashboard.offline_device_count}`}
          sub={`${dashboard.offline_device_count} 台离线/故障`}
          color="amber"
        />
        <StatCard
          label="待处理异常"
          value={dashboard.pending_anomaly_count}
          color={dashboard.pending_anomaly_count > 0 ? 'red' : 'emerald'}
        />
      </div>

      {/* Recent No-Shows + Anomalies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent No-Shows */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">最近 No-Show 记录</h2>
          </div>
          {noShows.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">暂无 No-Show 记录</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {noShows.map((ns) => (
                <div key={ns.reservation_id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      座位 {ns.seat_no}
                    </p>
                    <p className="text-xs text-slate-500">
                      预约 {new Date(ns.start_time).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 px-2 py-1 rounded">
                    违约
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Anomalies */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">最近系统动态</h2>
          </div>
          {anomalies.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">暂无异常事件</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {anomalies.map((a) => (
                <div key={a.event_id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{a.description}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(a.created_at).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded ${
                    a.status === 'PENDING'
                      ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950'
                      : 'text-slate-500 bg-slate-100 dark:bg-slate-800'
                  }`}>
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
