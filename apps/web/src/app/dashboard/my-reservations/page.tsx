'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  ApiErrorCode,
  ReservationStatus,
  type ReservationDto,
  type CurrentUsageResponse,
  type CheckinRequest
} from '@smartseat/contracts';
import { getApiClient } from '@/lib/api';
import { ApiClientError } from '@smartseat/api-client';

const statusConfig: Record<ReservationStatus, { label: string; color: string }> = {
  [ReservationStatus.WAITING_CHECKIN]: { label: '待签到', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
  [ReservationStatus.CHECKED_IN]: { label: '使用中', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' },
  [ReservationStatus.FINISHED]: { label: '已完成', color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  [ReservationStatus.CANCELLED]: { label: '已取消', color: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500' },
  [ReservationStatus.NO_SHOW]: { label: '未签到', color: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' },
  [ReservationStatus.USER_RELEASED]: { label: '已释放', color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  [ReservationStatus.ADMIN_RELEASED]: { label: '管理员释放', color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  [ReservationStatus.TIMEOUT_FINISHED]: { label: '超时结束', color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' }
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}小时${m}分钟`;
  return `${m}分钟`;
}

function translateErrorCode(code: ApiErrorCode | string): string {
  switch (code) {
    case ApiErrorCode.QR_TOKEN_EXPIRED: return '动态令牌已过期，请刷新后重试';
    case ApiErrorCode.QR_TOKEN_USED: return '动态令牌已被使用';
    case ApiErrorCode.QR_TOKEN_INVALIDATED: return '动态令牌已失效，请获取新的令牌';
    case ApiErrorCode.CHECKIN_CONTEXT_MISMATCH: return '令牌与座位不匹配';
    case ApiErrorCode.CHECKIN_WINDOW_CLOSED: return '不在签到时间窗口内';
    case ApiErrorCode.CHECKIN_DUPLICATED: return '该预约已签到，请勿重复操作';
    case ApiErrorCode.CHECKIN_DISABLED: return '签到功能暂未开放';
    case ApiErrorCode.DEVICE_OFFLINE: return '座位设备离线，无法签到';
    case ApiErrorCode.RESERVATION_NOT_ACTIVE: return '该预约已失效';
    case ApiErrorCode.RESERVATION_CANCELLED: return '该预约已被取消';
    case ApiErrorCode.FORBIDDEN: return '无权操作该预约';
    default: return '签到失败，请重试';
  }
}

export default function MyReservationsPage() {
  const [currentUsage, setCurrentUsage] = useState<CurrentUsageResponse | null>(null);
  const [history, setHistory] = useState<ReservationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);

  // Check-in modal state
  const [checkinReservation, setCheckinReservation] = useState<ReservationDto | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [checkinError, setCheckinError] = useState('');
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinSuccess, setCheckinSuccess] = useState(false);

  async function loadData() {
    try {
      setError('');
      setActionError('');
      const api = getApiClient();
      const [usage, hist] = await Promise.all([
        api.reservations.currentUsage().catch(() => undefined),
        api.reservations.history({ page_size: 50 })
      ]);
      setCurrentUsage(usage ?? null);
      setHistory(hist.items);
    } catch {
      setError('无法加载预约数据');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCancel(reservationId: string) {
    if (!confirm('确定要取消该预约吗？')) return;
    setCancelling(reservationId);
    setActionError('');
    try {
      const api = getApiClient();
      await api.reservations.cancel(reservationId);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '取消失败');
    } finally {
      setCancelling(null);
    }
  }

  async function handleRelease(reservationId: string) {
    if (!confirm('确定要释放当前座位吗？')) return;
    setCancelling(reservationId);
    setActionError('');
    try {
      const api = getApiClient();
      await api.reservations.releaseByUser({ reservation_id: reservationId });
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '释放失败');
    } finally {
      setCancelling(null);
    }
  }

  function openCheckin(reservation: ReservationDto) {
    setCheckinReservation(reservation);
    setTokenInput('');
    setCheckinError('');
    setCheckinSuccess(false);
  }

  function closeCheckin() {
    setCheckinReservation(null);
    setTokenInput('');
    setCheckinError('');
    setCheckinSuccess(false);
  }

  async function handleCheckin(e: FormEvent) {
    e.preventDefault();
    if (!checkinReservation) return;

    const trimmedToken = tokenInput.trim();
    if (!trimmedToken) {
      setCheckinError('请输入座位终端显示的动态令牌');
      return;
    }

    setCheckinLoading(true);
    setCheckinError('');

    try {
      const api = getApiClient();

      // Fetch seat detail to get device_id
      const seat = await api.seats.get(checkinReservation.seat_id);
      if (!seat.device_id) {
        setCheckinError('该座位未绑定设备，请选择其他座位或联系管理员');
        setCheckinLoading(false);
        return;
      }

      const checkinRequest: CheckinRequest = {
        seat_id: checkinReservation.seat_id,
        device_id: seat.device_id,
        token: trimmedToken,
        timestamp: new Date().toISOString()
      };

      await api.checkin.submit(checkinRequest);
      setCheckinSuccess(true);
      await loadData();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCheckinError(translateErrorCode(err.code));
      } else {
        setCheckinError(err instanceof Error ? err.message : '签到失败，请重试');
      }
    } finally {
      setCheckinLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-red-600 dark:text-red-400 text-sm">
          {actionError}
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-red-600 dark:text-red-400 text-sm">
          {error}
          <button onClick={loadData} className="ml-3 underline">重试</button>
        </div>
      )}

      {/* Current Usage */}
      {currentUsage && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-4">
            <h2 className="text-white font-semibold">当前使用</h2>
            <p className="text-blue-100 text-sm mt-0.5">
              座位 {currentUsage.seat.seat_no} · {currentUsage.seat.area}
            </p>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">剩余时间</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">
                  {formatDuration(currentUsage.remaining_seconds)}
                </p>
              </div>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusConfig[currentUsage.reservation.status].color}`}>
                {statusConfig[currentUsage.reservation.status].label}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-500">开始时间</p>
                <p className="text-slate-700 dark:text-slate-300">{formatTime(currentUsage.reservation.start_time)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">结束时间</p>
                <p className="text-slate-700 dark:text-slate-300">{formatTime(currentUsage.reservation.end_time)}</p>
              </div>
            </div>

            <button
              onClick={() => handleRelease(currentUsage.reservation.reservation_id)}
              disabled={cancelling === currentUsage.reservation.reservation_id}
              className="w-full py-2.5 border border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 disabled:opacity-50 text-sm font-medium rounded-lg transition-colors"
            >
              {cancelling === currentUsage.reservation.reservation_id ? '处理中...' : '释放座位'}
            </button>
          </div>
        </div>
      )}

      {/* Reservation History */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">预约记录</h2>

        {history.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">暂无预约记录</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((reservation) => {
              const cfg = statusConfig[reservation.status];
              const isWaitingCheckin = reservation.status === ReservationStatus.WAITING_CHECKIN;

              return (
                <div
                  key={reservation.reservation_id}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-slate-800 dark:text-white text-sm">
                        座位 {reservation.seat_id}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatTime(reservation.start_time)} — {formatTime(reservation.end_time)}
                      </p>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>

                  {isWaitingCheckin && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <button
                        onClick={() => openCheckin(reservation)}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        落座签到
                      </button>
                      <button
                        onClick={() => handleCancel(reservation.reservation_id)}
                        disabled={cancelling === reservation.reservation_id}
                        className="flex-1 py-2 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-medium rounded-lg transition-colors"
                      >
                        {cancelling === reservation.reservation_id ? '取消中...' : '取消预约'}
                      </button>
                    </div>
                  )}

                  {reservation.checked_in_at && (
                    <p className="text-xs text-slate-400 mt-2">
                      签到时间: {formatTime(reservation.checked_in_at)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Check-in Modal */}
      {checkinReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !checkinLoading && closeCheckin()}
          />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-sm overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-4">
              <h3 className="text-white font-semibold">落座签到</h3>
              <p className="text-emerald-100 text-sm mt-0.5">
                座位 {checkinReservation.seat_id}
              </p>
            </div>

            {checkinSuccess ? (
              <div className="p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">签到成功</h3>
                <p className="text-sm text-slate-500 mt-1">请开始学习，座位已锁定</p>
                <button
                  onClick={closeCheckin}
                  className="mt-5 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  确定
                </button>
              </div>
            ) : (
              <form onSubmit={handleCheckin} className="p-5 space-y-4">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      <p>请查看座位终端屏幕，输入屏幕上显示的 <strong className="text-slate-800 dark:text-slate-200">6 位动态令牌</strong>。</p>
                      <p className="text-xs mt-1 text-slate-400">令牌每 15 秒自动刷新，请及时输入。</p>
                    </div>
                  </div>
                </div>

                {checkinError && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2.5 text-red-600 dark:text-red-400 text-sm">
                    {checkinError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    动态令牌
                  </label>
                  <input
                    type="text"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="输入 6 位数字令牌"
                    maxLength={12}
                    autoFocus
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-lg text-center tracking-widest text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all font-mono"
                  />
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={closeCheckin}
                    disabled={checkinLoading}
                    className="flex-1 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-sm font-medium rounded-xl transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={checkinLoading || !tokenInput.trim()}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    {checkinLoading ? '验证中...' : '确认签到'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
