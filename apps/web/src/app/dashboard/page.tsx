'use client';

import { useEffect, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  SeatStatus,
  SeatAvailability,
  type SeatDto,
  type CreateReservationRequest,
  type CheckinRequest
} from '@smartseat/contracts';
import { getApiClient } from '@/lib/api';

const statusConfig: Record<SeatStatus, { label: string; bg: string; text: string; ring: string }> = {
  [SeatStatus.FREE]: {
    label: '空闲',
    bg: 'bg-emerald-50 dark:bg-emerald-950',
    text: 'text-emerald-700 dark:text-emerald-400',
    ring: 'ring-emerald-400'
  },
  [SeatStatus.RESERVED]: {
    label: '已预约',
    bg: 'bg-orange-50 dark:bg-orange-950',
    text: 'text-orange-700 dark:text-orange-400',
    ring: 'ring-orange-400'
  },
  [SeatStatus.OCCUPIED]: {
    label: '使用中',
    bg: 'bg-rose-50 dark:bg-rose-950',
    text: 'text-rose-700 dark:text-rose-400',
    ring: 'ring-rose-400'
  },
  [SeatStatus.ENDING_SOON]: {
    label: '即将结束',
    bg: 'bg-amber-50 dark:bg-amber-950',
    text: 'text-amber-700 dark:text-amber-400',
    ring: 'ring-amber-400'
  },
  [SeatStatus.PENDING_RELEASE]: {
    label: '待释放',
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-400',
    ring: 'ring-slate-400'
  }
};

export default function DashboardPage() {
  const [seats, setSeats] = useState<SeatDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [reserveSeat, setReserveSeat] = useState<SeatDto | null>(null);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reserving, setReserving] = useState(false);
  const [reserveError, setReserveError] = useState('');
  const [reserveSuccess, setReserveSuccess] = useState(false);

  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState('');
  const [scanError, setScanError] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);


  useEffect(() => {
    async function loadSeats() {
      try {
        setError('');
        const api = getApiClient();
        const result = await api.seats.list();
        setSeats(result.items);
      } catch {
        setError('无法加载座位数据');
      } finally {
        setLoading(false);
      }
    }
    loadSeats();
  }, []);

  async function refreshSeats() {
    try {
      const api = getApiClient();
      const result = await api.seats.list();
      setSeats(result.items);
    } catch {
      // silently fail on refresh
    }
  }

  function openReserve(seat: SeatDto) {
    if (seat.availability_status !== SeatAvailability.AVAILABLE) return;
    if (seat.business_status !== SeatStatus.FREE) return;

    setReserveSeat(seat);
    setReserveError('');
    setReserveSuccess(false);

    const now = new Date();
    now.setMinutes(0, 0, 0);
    const start = new Date(now);
    const end = new Date(now);
    end.setHours(end.getHours() + 2);

    setStartTime(start.toISOString().slice(0, 16));
    setEndTime(end.toISOString().slice(0, 16));
  }

  async function handleReserve() {
    if (!reserveSeat) return;
    setReserveError('');

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      setReserveError('结束时间必须晚于开始时间');
      return;
    }

    if (start < new Date()) {
      setReserveError('开始时间不能早于当前时间');
      return;
    }

    setReserving(true);
    try {
      const api = getApiClient();
      const request: CreateReservationRequest = {
        seat_id: reserveSeat.seat_id,
        start_time: start.toISOString(),
        end_time: end.toISOString()
      };
      await api.reservations.create(request);
      setReserveSuccess(true);
      refreshSeats();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : '预约失败，请重试';
      setReserveError(msg);
    } finally {
      setReserving(false);
    }
  }

  useEffect(() => {
    if (!showScanner) return;

    const scanner = new Html5Qrcode('qr-reader');
    let mounted = true;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          if (!mounted) return;
          setScanResult(decodedText);
          scanner.stop().catch(() => {});
        },
        () => {}
      )
      .catch(() => {
        if (mounted) setScanError('无法启动摄像头，请检查权限');
      });

    return () => {
      mounted = false;
      scanner.stop().catch(() => {});
    };
  }, [showScanner]);

  async function handleCheckin() {
    if (!scanResult) return;
    setCheckingIn(true);
    setScanError('');

    try {
      const parsed: CheckinRequest = JSON.parse(scanResult);
      const api = getApiClient();
      await api.checkin.submit(parsed);
      setScanResult('');
      setShowScanner(false);
      refreshSeats();
    } catch {
      setScanError('签到失败，二维码内容无效或已过期');
    } finally {
      setCheckingIn(false);
    }
  }

  function closeScanner() {
    setShowScanner(false);
    setScanResult('');
    setScanError('');
  }

  const freeCount = seats.filter(
    (s) => s.business_status === SeatStatus.FREE && s.availability_status === SeatAvailability.AVAILABLE
  ).length;

  const occupiedCount = seats.filter(
    (s) => s.business_status === SeatStatus.OCCUPIED
  ).length;

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 grid grid-cols-3 gap-3 min-w-0">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4">
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{seats.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">总座位</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4">
            <p className="text-2xl font-bold text-emerald-600">{freeCount}</p>
            <p className="text-xs text-slate-500 mt-0.5">空闲</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4">
            <p className="text-2xl font-bold text-rose-600">{occupiedCount}</p>
            <p className="text-xs text-slate-500 mt-0.5">使用中</p>
          </div>
        </div>

        <button
          onClick={() => setShowScanner(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5zM13.5 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
          </svg>
          扫一扫
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-red-600 dark:text-red-400 text-sm">
          {error}
          <button onClick={refreshSeats} className="ml-3 underline">重试</button>
        </div>
      )}

      {/* Seat grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {seats.map((seat) => {
            const config = statusConfig[seat.business_status];
            const isUnavailable = seat.availability_status === SeatAvailability.UNAVAILABLE;
            const canReserve =
              seat.business_status === SeatStatus.FREE &&
              seat.availability_status === SeatAvailability.AVAILABLE;

            return (
              <button
                key={seat.seat_id}
                onClick={() => canReserve && openReserve(seat)}
                disabled={!canReserve}
                className={`relative text-left rounded-xl border border-slate-200 dark:border-slate-800 p-4 transition-all ${
                  canReserve
                    ? 'bg-white dark:bg-slate-900 hover:ring-2 hover:ring-blue-400 hover:shadow-md cursor-pointer'
                    : 'bg-white/60 dark:bg-slate-900/60 cursor-default'
                } ${isUnavailable ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="font-semibold text-slate-800 dark:text-white text-sm">
                    {seat.seat_no}
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}
                  >
                    {config.label}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{seat.area}</p>
                {isUnavailable && (
                  <p className="text-xs text-rose-500 mt-1">设备离线</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!loading && seats.length === 0 && (
        <div className="text-center py-20 text-slate-500">暂无座位数据</div>
      )}

      {/* Reservation modal */}
      {reserveSeat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !reserving && setReserveSeat(null)}
          />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-sm p-6">
            {reserveSuccess ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">预约成功</h3>
                <p className="text-sm text-slate-500 mt-1">座位 {reserveSeat.seat_no} 已预约</p>
                <button
                  onClick={() => setReserveSeat(null)}
                  className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  确定
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-1">
                  预约座位
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                  {reserveSeat.seat_no} · {reserveSeat.area}
                </p>

                {reserveError && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-red-600 dark:text-red-400 text-sm mb-4">
                    {reserveError}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      开始时间
                    </label>
                    <input
                      type="datetime-local"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      结束时间
                    </label>
                    <input
                      type="datetime-local"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setReserveSeat(null)}
                    disabled={reserving}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleReserve}
                    disabled={reserving}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {reserving ? '提交中...' : '确认预约'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* QR Scanner modal */}
      {showScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={closeScanner} />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-semibold text-slate-800 dark:text-white">扫一扫签到</h3>
              <button onClick={closeScanner} className="p-1 text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4">
              {scanError && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-red-600 dark:text-red-400 text-sm mb-3">
                  {scanError}
                </div>
              )}

              <div id="qr-reader" className="w-full rounded-lg overflow-hidden" />

              {scanResult && (
                <div className="mt-4 space-y-3">
                  <div className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2 text-emerald-700 dark:text-emerald-400 text-sm break-all">
                    已识别: {scanResult}
                  </div>
                  <button
                    onClick={handleCheckin}
                    disabled={checkingIn}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {checkingIn ? '签到中...' : '确认签到'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
