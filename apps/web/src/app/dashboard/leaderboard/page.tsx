'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  LeaderboardMetric,
  type LeaderboardEntryDto,
  type LeaderboardResponse
} from '@smartseat/contracts';
import { getApiClient } from '@/lib/api';

const metricLabels: Record<LeaderboardMetric, string> = {
  [LeaderboardMetric.WEEKLY_VISITS]: '本周访问',
  [LeaderboardMetric.WEEKLY_DURATION]: '本周时长',
  [LeaderboardMetric.STREAK_DAYS]: '连续天数'
};

const metricIcons: Record<LeaderboardMetric, string> = {
  [LeaderboardMetric.WEEKLY_VISITS]: '🏃',
  [LeaderboardMetric.WEEKLY_DURATION]: '⏱️',
  [LeaderboardMetric.STREAK_DAYS]: '🔥'
};

function formatValue(value: number, metric: LeaderboardMetric): string {
  switch (metric) {
    case LeaderboardMetric.WEEKLY_DURATION: {
      const hours = Math.floor(value / 60);
      const mins = value % 60;
      if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
      if (hours > 0) return `${hours} 小时`;
      return `${mins} 分钟`;
    }
    case LeaderboardMetric.WEEKLY_VISITS:
      return `${value} 次`;
    case LeaderboardMetric.STREAK_DAYS:
      return `${value} 天`;
  }
}

function rankBadge(rank: number) {
  if (rank === 1) return <span className="text-xl">🥇</span>;
  if (rank === 2) return <span className="text-xl">🥈</span>;
  if (rank === 3) return <span className="text-xl">🥉</span>;
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-medium text-slate-400">
      {rank}
    </span>
  );
}

export default function LeaderboardPage() {
  const [metric, setMetric] = useState<LeaderboardMetric>(LeaderboardMetric.WEEKLY_VISITS);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (m: LeaderboardMetric) => {
    setLoading(true);
    setError('');
    try {
      const api = getApiClient();
      const result = await api.leaderboard.get({ metric: m });
      setData(result);
    } catch {
      setError('无法加载排行榜数据');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(metric);
  }, [metric, load]);

  const top3 = data?.entries.slice(0, 3) ?? [];
  const rest = data?.entries.slice(3) ?? [];
  const currentUser = data?.current_user_entry;
  const isCurrentInList = currentUser && data?.entries.some((e) => e.rank === currentUser.rank);

  return (
    <div className="space-y-6">
      {/* Week info */}
      {data?.week_start && (
        <p className="text-sm text-slate-500 text-center">
          📅 {new Date(data.week_start).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} 起 · 本周统计
        </p>
      )}

      {/* Metric tabs */}
      <div className="flex justify-center">
        <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          {(Object.entries(metricLabels) as [LeaderboardMetric, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMetric(key)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                metric === key
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <span className="mr-1.5">{metricIcons[key]}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-red-600 dark:text-red-400 text-sm text-center">
          {error}
          <button onClick={() => load(metric)} className="ml-3 underline">重试</button>
        </div>
      )}

      {/* Podium - Top 3 */}
      {!loading && top3.length > 0 && (
        <div className="flex items-end justify-center gap-2 sm:gap-4 pt-4">
          {/* 2nd place */}
          {top3[1] && (
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center mb-2 ring-2 ring-slate-300">
                <span className="text-lg font-bold text-slate-500 dark:text-slate-300">
                  {top3[1].anonymous_name.slice(0, 2)}
                </span>
              </div>
              <span className="text-2xl">🥈</span>
              <p className="text-xs text-slate-500 mt-1 truncate max-w-[60px] text-center">
                {top3[1].anonymous_name}
              </p>
              <div className="bg-slate-100 dark:bg-slate-800 rounded-t-lg w-20 h-20 flex flex-col items-center justify-center mt-2">
                <span className="text-lg font-bold text-slate-700 dark:text-slate-300">
                  {top3[1].value}
                </span>
                <span className="text-xs text-slate-500">{formatValue(top3[1].value, metric).replace(/^\d+\s*/, '')}</span>
              </div>
            </div>
          )}

          {/* 1st place */}
          {top3[0] && (
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900 ring-4 ring-amber-300 flex items-center justify-center mb-2">
                <span className="text-xl font-bold text-amber-700 dark:text-amber-400">
                  {top3[0].anonymous_name.slice(0, 2)}
                </span>
              </div>
              <span className="text-3xl">👑</span>
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mt-1 truncate max-w-[70px] text-center">
                {top3[0].is_current_user ? '你' : top3[0].anonymous_name}
              </p>
              <div className="bg-amber-100 dark:bg-amber-900/50 rounded-t-lg w-20 h-24 flex flex-col items-center justify-center mt-2">
                <span className="text-xl font-bold text-amber-700 dark:text-amber-400">
                  {top3[0].value}
                </span>
                <span className="text-xs text-amber-600 dark:text-amber-500">{formatValue(top3[0].value, metric).replace(/^\d+\s*/, '')}</span>
              </div>
            </div>
          )}

          {/* 3rd place */}
          {top3[2] && (
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center mb-2 ring-2 ring-orange-300">
                <span className="text-lg font-bold text-orange-700 dark:text-orange-400">
                  {top3[2].anonymous_name.slice(0, 2)}
                </span>
              </div>
              <span className="text-2xl">🥉</span>
              <p className="text-xs text-slate-500 mt-1 truncate max-w-[60px] text-center">
                {top3[2].anonymous_name}
              </p>
              <div className="bg-orange-100 dark:bg-orange-900/50 rounded-t-lg w-20 h-16 flex flex-col items-center justify-center mt-2">
                <span className="text-lg font-bold text-orange-700 dark:text-orange-400">
                  {top3[2].value}
                </span>
                <span className="text-xs text-slate-500">{formatValue(top3[2].value, metric).replace(/^\d+\s*/, '')}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ranking list (4th and beyond) */}
      {!loading && rest.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">完整排名</p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {rest.map((entry) => (
              <LeaderboardRow key={entry.rank} entry={entry} metric={metric} />
            ))}
          </div>
        </div>
      )}

      {/* Current user outside list */}
      {!loading && currentUser && isCurrentInList === false && (
        <div>
          <p className="text-xs text-slate-400 mb-2 text-center">你的排名</p>
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-xl overflow-hidden">
            <LeaderboardRow entry={currentUser} metric={metric} />
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && data?.entries.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="font-medium">暂无排名数据</p>
          <p className="text-sm mt-1">本周还没有学习记录，快去图书馆打卡吧！</p>
        </div>
      )}
    </div>
  );
}

function LeaderboardRow({
  entry,
  metric
}: {
  entry: LeaderboardEntryDto;
  metric: LeaderboardMetric;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${
        entry.is_current_user
          ? 'bg-blue-50/50 dark:bg-blue-950/30'
          : ''
      }`}
    >
      <div className="w-7 flex justify-center">{rankBadge(entry.rank)}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
          {entry.anonymous_name}
          {entry.is_current_user && (
            <span className="ml-2 text-xs text-blue-500 font-medium bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded">你</span>
          )}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-slate-800 dark:text-white">
          {formatValue(entry.value, metric)}
        </p>
      </div>
    </div>
  );
}
