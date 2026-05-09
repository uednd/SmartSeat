'use client';

import { useEffect, useState } from 'react';
import {
  ApiErrorCode,
  ReservationStatus,
  type ReservationDto,
  type CurrentUsageResponse,
  type CheckinRequest
} from '@smartseat/contracts';
import { getApiClient } from '@/lib/api';
import { ApiClientError } from '@smartseat/api-client';
import { Card, Tag, Button, Modal, Input, Spin, Empty, Descriptions, App } from 'antd';
import { ClockCircleOutlined, EnvironmentOutlined } from '@ant-design/icons';

const statusColorMap: Record<string, string> = {
  WAITING_CHECKIN: 'warning',
  CHECKED_IN: 'success',
  FINISHED: 'default',
  CANCELLED: 'default',
  NO_SHOW: 'error',
  USER_RELEASED: 'default',
  ADMIN_RELEASED: 'default',
  TIMEOUT_FINISHED: 'default'
};

const statusLabelMap: Record<string, string> = {
  WAITING_CHECKIN: '待签到',
  CHECKED_IN: '使用中',
  FINISHED: '已完成',
  CANCELLED: '已取消',
  NO_SHOW: '未签到',
  USER_RELEASED: '已释放',
  ADMIN_RELEASED: '管理员释放',
  TIMEOUT_FINISHED: '超时结束'
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
  const [cancelling, setCancelling] = useState<string | null>(null);

  const [checkinReservation, setCheckinReservation] = useState<ReservationDto | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinSuccess, setCheckinSuccess] = useState(false);
  const { message } = App.useApp();

  async function loadData() {
    setError('');
    try {
      const api = getApiClient();
      const [usage, hist] = await Promise.all([
        api.reservations.currentUsage().catch(() => undefined),
        api.reservations.history({ page_size: 50 })
      ]);
      setCurrentUsage(usage ?? null);
      setHistory(hist.items);
    } catch {
      setError('无法加载预约数据');
    }
  }

  useEffect(() => {
    let ignore = false;
    Promise.resolve()
      .then(() => { if (!ignore) setLoading(true); })
      .then(() => loadData())
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  async function handleCancel(reservationId: string) {
    setCancelling(reservationId);
    try {
      const api = getApiClient();
      await api.reservations.cancel(reservationId);
      message.success('预约已取消');
      await loadData();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '取消失败');
    } finally {
      setCancelling(null);
    }
  }

  async function handleRelease(reservationId: string) {
    setCancelling(reservationId);
    try {
      const api = getApiClient();
      await api.reservations.releaseByUser({ reservation_id: reservationId });
      message.success('座位已释放');
      await loadData();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '释放失败');
    } finally {
      setCancelling(null);
    }
  }

  function openCheckin(reservation: ReservationDto) {
    setCheckinReservation(reservation);
    setTokenInput('');
    setCheckinSuccess(false);
  }

  async function handleCheckin() {
    if (!checkinReservation) return;
    const trimmedToken = tokenInput.trim();
    if (!trimmedToken) return;

    setCheckinLoading(true);
    try {
      const api = getApiClient();
      const seat = await api.seats.get(checkinReservation.seat_id);
      if (!seat.device_id) {
        message.error('该座位未绑定设备');
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
      message.success('签到成功');
      await loadData();
    } catch (err) {
      if (err instanceof ApiClientError) {
        message.error(translateErrorCode(err.code));
      } else {
        message.error(err instanceof Error ? err.message : '签到失败');
      }
    } finally {
      setCheckinLoading(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Spin size="large" /></div>;
  }

  return (
    <div className="space-y-4 flex-1 flex flex-col">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm">
          {error}
          <button onClick={loadData} className="ml-3 underline">重试</button>
        </div>
      )}

      {currentUsage && (
        <Card
          style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }}
          title={
            <span>
              <EnvironmentOutlined className="mr-1" />
              当前使用 · 座位 {currentUsage.seat.seat_no}
            </span>
          }
          extra={<Tag color={statusColorMap[currentUsage.reservation.status]}>{statusLabelMap[currentUsage.reservation.status]}</Tag>}
        >
          <Descriptions column={2} size="small">
            <Descriptions.Item label="剩余时间">
              <span className="text-xl font-bold">{formatDuration(currentUsage.remaining_seconds)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="区域">{currentUsage.seat.area}</Descriptions.Item>
            <Descriptions.Item label="开始">{formatTime(currentUsage.reservation.start_time)}</Descriptions.Item>
            <Descriptions.Item label="结束">{formatTime(currentUsage.reservation.end_time)}</Descriptions.Item>
          </Descriptions>
          <Button
            danger
            block
            loading={cancelling === currentUsage.reservation.reservation_id}
            onClick={() => handleRelease(currentUsage.reservation.reservation_id)}
            className="mt-4"
          >
            释放座位
          </Button>
        </Card>
      )}

      <h2 className="text-lg font-semibold">预约记录</h2>

      {history.length === 0 ? (
        <Empty description="暂无预约记录" />
      ) : (
        <div className="space-y-3">
          {history.map((reservation) => {
            const isWaitingCheckin = reservation.status === ReservationStatus.WAITING_CHECKIN;
            return (
              <Card
                key={reservation.reservation_id}
                size="small"
                style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }}
                extra={<Tag color={statusColorMap[reservation.status]}>{statusLabelMap[reservation.status]}</Tag>}
                title={<span className="text-sm">座位 {reservation.seat_id}</span>}
              >
                <p className="text-xs text-slate-500 mb-2">
                  <ClockCircleOutlined className="mr-1" />
                  {formatTime(reservation.start_time)} — {formatTime(reservation.end_time)}
                </p>

                {isWaitingCheckin && (
                  <div className="flex gap-2 pt-2 border-t">
                    <Button size="small" type="primary" onClick={() => openCheckin(reservation)}>落座签到</Button>
                    <Button size="small" danger loading={cancelling === reservation.reservation_id}
                      onClick={() => handleCancel(reservation.reservation_id)}>取消预约</Button>
                  </div>
                )}

                {reservation.checked_in_at && (
                  <p className="text-xs text-slate-400 mt-1">签到: {formatTime(reservation.checked_in_at)}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        title="落座签到"
        open={!!checkinReservation && !checkinSuccess}
        onCancel={() => setCheckinReservation(null)}
        onOk={handleCheckin}
        confirmLoading={checkinLoading}
        okText="确认签到"
        cancelText="取消"
        okButtonProps={{ disabled: !tokenInput.trim() }}
      >
        <div className="pt-2 space-y-4">
          <p className="text-sm text-slate-500">座位 {checkinReservation?.seat_id}</p>
          <div>
            <p className="text-xs font-medium mb-1">动态口令</p>
            <Input
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
              placeholder="输入 4-6 位口令"
              maxLength={6}
              className="text-center tracking-widest font-mono text-lg"
              autoFocus
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={checkinSuccess}
        footer={null}
        onCancel={() => { setCheckinReservation(null); setCheckinSuccess(false); }}
      >
        <div className="text-center py-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold">签到成功</h3>
          <p className="text-sm text-slate-500 mt-1">请开始学习，座位已锁定</p>
        </div>
      </Modal>
    </div>
  );
}
