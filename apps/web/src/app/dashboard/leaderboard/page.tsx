'use client';

import { useEffect, useState } from 'react';
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

const metricUnits: Record<LeaderboardMetric, string> = {
  [LeaderboardMetric.WEEKLY_VISITS]: '次',
  [LeaderboardMetric.WEEKLY_DURATION]: '分钟',
  [LeaderboardMetric.STREAK_DAYS]: '天'
};

function rankBadge(rank: number) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 font-bold text-sm">
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 font-bold text-sm">
        3
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 text-sm text-slate-400 dark:text-slate-500">
      {rank}
    </span>
  );
}

function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl">🥇</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return null;
}

export default function LeaderboardPage() {
  const [metric, setMetric] = useState<LeaderboardMetric>(LeaderboardMetric.WEEKLY_VISITS);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const api = getApiClient();
        const result = await api.leaderboard.get({ metric });
        setData(result);
      } catch {
        setError('无法加载排行榜数据');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [metric]);

  const top3 = data?.entries.slice(0, 3) ?? [];
  const rest = data?.entries.slice(3) ?? [];
  const currentUser = data?.current_user_entry;

  const isCurrentInTop =
    currentUser && data?.entries.some((e) => e.rank === currentUser.rank);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Week info */}
      {data?.week_start && (
        <p className="text-sm text-slate-500 text-center">
          {new Date(data.week_start).toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}{' '}
          起一周
        </p>
      )}

      {/* Metric tabs */}
      <div className="flex justify-center">
        <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          {(Object.entries(metricLabels) as [LeaderboardMetric, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMetric(key)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
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
        </div>
      )}

      {/* Podium - Top 3 */}
      {!loading && top3.length > 0 && (
        <div className="flex items-end justify-center gap-3 sm:gap-4 pt-4">
          {/* 2nd place */}
          {top3[1] && (
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center mb-2">
                <span className="text-lg font-bold text-slate-500 dark:text-slate-300">
                  {top3[1].anonymous_name.slice(0, 2)}
                </span>
              </div>
              <Medal rank={2} />
              <p className="text-xs text-slate-500 mt-1 truncate max-w-[60px] text-center">
                {top3[1].anonymous_name}
              </p>
              <div className="bg-slate-100 dark:bg-slate-800 rounded-t-lg w-20 h-20 flex flex-col items-center justify-center mt-2">
                <span className="text-lg font-bold text-slate-700 dark:text-slate-300">
                  {top3[1].value}
                </span>
                <span className="text-xs text-slate-500">{metricUnits[metric]}</span>
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
              <Medal rank={1} />
              <p className="text-xs text-slate-500 mt-1 truncate max-w-[60px] text-center">
                {top3[0].anonymous_name}
              </p>
              <div className="bg-amber-100 dark:bg-amber-900/50 rounded-t-lg w-20 h-24 flex flex-col items-center justify-center mt-2">
                <span className="text-xl font-bold text-amber-700 dark:text-amber-400">
                  {top3[0].value}
                </span>
                <span className="text-xs text-amber-600 dark:text-amber-500">{metricUnits[metric]}</span>
              </div>
            </div>
          )}

          {/* 3rd place */}
          {top3[2] && (
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center mb-2">
                <span className="text-lg font-bold text-orange-700 dark:text-orange-400">
                  {top3[2].anonymous_name.slice(0, 2)}
                </span>
              </div>
              <Medal rank={3} />
              <p className="text-xs text-slate-500 mt-1 truncate max-w-[60px] text-center">
                {top3[2].anonymous_name}
              </p>
              <div className="bg-orange-100 dark:bg-orange-900/50 rounded-t-lg w-20 h-16 flex flex-col items-center justify-center mt-2">
                <span className="text-lg font-bold text-orange-700 dark:text-orange-400">
                  {top3[2].value}
                </span>
                <span className="text-xs text-slate-500">{metricUnits[metric]}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rest of the list */}
      {!loading && rest.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {rest.map((entry) => (
              <LeaderboardRow key={entry.rank} entry={entry} unit={metricUnits[metric]} />
            ))}
          </div>
        </div>
      )}

      {/* Current user card (if not in displayed list) */}
      {!loading && currentUser && isCurrentInTop === false && (
        <div className="mt-4">
          <p className="text-xs text-slate-400 mb-2 text-center">你的排名</p>
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-xl">
            <LeaderboardRow entry={currentUser} unit={metricUnits[metric]} highlight />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && data?.entries.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <p className="text-lg">暂无排名数据</p>
          <p className="text-sm mt-1">本周还没有学习记录</p>
        </div>
      )}
    </div>
  );
}

function LeaderboardRow({
  entry,
  unit,
  highlight
}: {
  entry: LeaderboardEntryDto;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${
        highlight || entry.is_current_user
          ? 'bg-blue-50/50 dark:bg-blue-950/30'
          : ''
      }`}
    >
      {rankBadge(entry.rank)}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
          {entry.anonymous_name}
          {entry.is_current_user && (
            <span className="ml-2 text-xs text-blue-500 font-normal">你</span>
          )}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-slate-800 dark:text-white">
          {entry.value}
        </p>
        <p className="text-xs text-slate-500">{unit}</p>
      </div>
    </div>
  );
}
