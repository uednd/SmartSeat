'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  LeaderboardMetric,
  LeaderboardTimePeriod,
  type LeaderboardEntryDto,
  type LeaderboardResponse
} from '@smartseat/contracts';
import { getApiClient } from '@/lib/api';

const metricLabels: Record<LeaderboardMetric, string> = {
  [LeaderboardMetric.BOOKING_COUNT]: '预约次数',
  [LeaderboardMetric.STUDY_DURATION]: '学习时长'
};

const timePeriodLabels: Record<LeaderboardTimePeriod, string> = {
  [LeaderboardTimePeriod.TODAY]: '今日',
  [LeaderboardTimePeriod.THIS_WEEK]: '本周',
  [LeaderboardTimePeriod.THIS_MONTH]: '本月'
};

function formatValue(value: number, metric: LeaderboardMetric): string {
  switch (metric) {
    case LeaderboardMetric.STUDY_DURATION: {
      const hours = Math.floor(value / 60);
      const mins = value % 60;
      if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
      if (hours > 0) return `${hours} 小时`;
      return `${mins} 分钟`;
    }
    case LeaderboardMetric.BOOKING_COUNT:
      return `${value} 次`;
  }
}

function Avatar({
  user,
  size,
  highlighted
}: {
  user: LeaderboardEntryDto;
  size: 'sm' | 'md' | 'lg';
  highlighted?: boolean;
}) {
  const sizeClass =
    size === 'lg'
      ? 'w-16 h-16 text-xl'
      : size === 'md'
        ? 'w-12 h-12 text-lg'
        : 'w-9 h-9 text-sm';

  if (user.avatar_url) {
    return (
      <Image
        src={user.avatar_url}
        alt={user.anonymous_name}
        width={64}
        height={64}
        unoptimized
        className={`${sizeClass} rounded-full object-cover ${
          highlighted ? 'ring-2 ring-offset-2 ring-amber-400 dark:ring-amber-500' : ''
        }`}
      />
    );
  }

  const initials = user.anonymous_name.slice(0, 2);

  if (highlighted) {
    return (
      <span
        className={`${sizeClass} rounded-full bg-amber-100 dark:bg-amber-900 ring-2 ring-offset-2 ring-amber-400 dark:ring-amber-500 flex items-center justify-center font-bold text-amber-700 dark:text-amber-400`}
      >
        {initials}
      </span>
    );
  }

  return (
    <span
      className={`${sizeClass} rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-500 dark:text-slate-300`}
    >
      {initials}
    </span>
  );
}

function MedalBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-3xl">👑</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return null;
}

function RankNumber({ rank }: { rank: number }) {
  if (rank <= 3) return null;
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 text-xs font-medium text-slate-400">
      {rank}
    </span>
  );
}

export default function LeaderboardPage() {
  const [metric, setMetric] = useState<LeaderboardMetric>(LeaderboardMetric.BOOKING_COUNT);
  const [timePeriod, setTimePeriod] = useState<LeaderboardTimePeriod>(LeaderboardTimePeriod.THIS_WEEK);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    const api = getApiClient();
    Promise.resolve()
      .then(() => { if (!ignore) { setLoading(true); setError(''); } })
      .then(() => api.leaderboard.get({ metric, time_period: timePeriod }))
      .then((result) => { if (!ignore) setData(result); })
      .catch(() => { if (!ignore) setError('无法加载排行榜数据'); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [metric, timePeriod, retryKey]);

  const top3 = data?.entries.slice(0, 3) ?? [];
  const rest = data?.entries.slice(3) ?? [];
  const currentUser = data?.current_user_entry;
  const isCurrentInList = currentUser && data?.entries.some((e) => e.rank === currentUser.rank);

  const podiumOrder = (() => {
    const result: (LeaderboardEntryDto | undefined)[] = [undefined, undefined, undefined];
    for (const entry of top3) {
      if (entry.rank === 1) result[0] = entry;
      else if (entry.rank === 2) result[1] = entry;
      else if (entry.rank === 3) result[2] = entry;
    }
    return result;
  })();

  const [p1, p2, p3] = podiumOrder;

  return (
    <div className="space-y-6 flex-1 flex flex-col">
      {/* Page title */}
      <h1 className="text-xl font-bold text-center text-slate-800 dark:text-slate-100">
        学习排行榜
      </h1>

      {/* Time filter */}
      <div className="flex justify-center">
        <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          {(
            Object.entries(timePeriodLabels) as [LeaderboardTimePeriod, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTimePeriod(key)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                timePeriod === key
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric tabs */}
      <div className="flex justify-center">
        <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          {(Object.entries(metricLabels) as [LeaderboardMetric, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMetric(key)}
              className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${
                metric === key
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
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
          <button onClick={() => setRetryKey((k) => k + 1)} className="ml-3 underline">
            重试
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && data?.entries.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <p className="font-medium">暂无排名数据</p>
          <p className="text-sm mt-1">还没有学习记录，快去图书馆打卡吧！</p>
        </div>
      )}

      {/* Podium - Top 3 */}
      {!loading && top3.length > 0 && (
        <div className="flex items-end justify-center gap-3 sm:gap-6 pt-4">
          {/* 2nd place - left */}
          <div className="flex flex-col items-center">
            <Avatar user={p2!} size="md" highlighted />
            <MedalBadge rank={2} />
            <p className="text-xs font-medium text-slate-500 mt-1 truncate max-w-[80px] text-center">
              {p2!.is_current_user ? '你' : p2!.anonymous_name}
            </p>
            <p className="text-[10px] text-slate-400 truncate max-w-[80px] text-center">
              {p2!.user_id}
            </p>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-t-lg w-20 h-20 flex flex-col items-center justify-center mt-1 ring-2 ring-slate-300">
              <span className="text-lg font-bold text-slate-700 dark:text-slate-300">
                {p2!.value}
              </span>
              <span className="text-[10px] text-slate-500">
                {formatValue(p2!.value, metric).replace(/^\d+\s*/, '')}
              </span>
            </div>
          </div>

          {/* 1st place - center */}
          <div className="flex flex-col items-center">
            <Avatar user={p1!} size="lg" highlighted />
            <MedalBadge rank={1} />
            <p className="text-sm font-bold text-amber-600 dark:text-amber-400 mt-1 truncate max-w-[90px] text-center">
              {p1!.is_current_user ? '你' : p1!.anonymous_name}
            </p>
            <p className="text-[10px] text-amber-500 dark:text-amber-400 truncate max-w-[90px] text-center">
              {p1!.user_id}
            </p>
            <div className="bg-amber-100 dark:bg-amber-900/50 rounded-t-lg w-24 h-28 flex flex-col items-center justify-center mt-1 ring-2 ring-amber-300">
              <span className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                {p1!.value}
              </span>
              <span className="text-xs text-amber-600 dark:text-amber-500">
                {formatValue(p1!.value, metric).replace(/^\d+\s*/, '')}
              </span>
            </div>
          </div>

          {/* 3rd place - right */}
          <div className="flex flex-col items-center">
            <Avatar user={p3!} size="md" highlighted />
            <MedalBadge rank={3} />
            <p className="text-xs font-medium text-slate-500 mt-1 truncate max-w-[80px] text-center">
              {p3!.is_current_user ? '你' : p3!.anonymous_name}
            </p>
            <p className="text-[10px] text-slate-400 truncate max-w-[80px] text-center">
              {p3!.user_id}
            </p>
            <div className="bg-orange-100 dark:bg-orange-900/50 rounded-t-lg w-20 h-16 flex flex-col items-center justify-center mt-1 ring-2 ring-orange-300">
              <span className="text-lg font-bold text-orange-700 dark:text-orange-400">
                {p3!.value}
              </span>
              <span className="text-[10px] text-slate-500">
                {formatValue(p3!.value, metric).replace(/^\d+\s*/, '')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Ranking list (4th and beyond) */}
      {!loading && rest.length > 0 && (
        <div className="rounded-xl border border-white/40 overflow-hidden" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }}>
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

      {/* Current user outside top list */}
      {!loading && currentUser && isCurrentInList === false && (
        <div>
          <p className="text-xs text-slate-400 mb-2 text-center">你的排名</p>
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-xl overflow-hidden">
            <LeaderboardRow entry={currentUser} metric={metric} />
          </div>
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
        entry.is_current_user ? 'bg-blue-50/50 dark:bg-blue-950/30' : ''
      }`}
    >
      <div className="w-7 flex justify-center">
        <RankNumber rank={entry.rank} />
      </div>
      <Avatar user={entry} size="sm" highlighted={entry.rank <= 3} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
          {entry.user_id}
          {entry.is_current_user && (
            <span className="ml-2 text-xs text-blue-500 font-medium bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded">
              你
            </span>
          )}
        </p>
        <p className="text-[11px] text-slate-400 truncate">{entry.anonymous_name}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-slate-800 dark:text-white">
          {formatValue(entry.value, metric)}
        </p>
      </div>
    </div>
  );
}
