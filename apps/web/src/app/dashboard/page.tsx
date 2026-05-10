'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  SeatStatus,
  SeatAvailability,
  type SeatDto,
  type CreateReservationRequest,
  type SystemMessageDto
} from '@smartseat/contracts';
import { getApiClient } from '@/lib/api';
import { Row, Col, Card, Statistic, Tag, Modal, Spin, Empty, App, Button } from 'antd';
import { EnvironmentOutlined, BellOutlined } from '@ant-design/icons';

const statusTagMap: Record<SeatStatus, { label: string; color: string }> = {
  [SeatStatus.FREE]: { label: '空闲', color: 'success' },
  [SeatStatus.RESERVED]: { label: '已预约', color: 'warning' },
  [SeatStatus.OCCUPIED]: { label: '使用中', color: 'error' },
  [SeatStatus.ENDING_SOON]: { label: '即将结束', color: 'processing' },
  [SeatStatus.PENDING_RELEASE]: { label: '待释放', color: 'default' }
};

export default function DashboardPage() {
  const [seats, setSeats] = useState<SeatDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [systemMessage, setSystemMessage] = useState<SystemMessageDto | null>(null);

  const [reserveSeat, setReserveSeat] = useState<SeatDto | null>(null);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reserving, setReserving] = useState(false);
  const [reserveSuccess, setReserveSuccess] = useState(false);
  const { message } = App.useApp();

  const dismissMessage = useCallback(async () => {
    if (!systemMessage) return;
    try {
      const api = getApiClient();
      await api.me.dismissSystemMessage({ message_id: systemMessage.id });
    } catch {
      // silently fail
    }
    setSystemMessage(null);
  }, [systemMessage]);

  useEffect(() => {
    async function load() {
      try {
        setError('');
        const api = getApiClient();
        const [seatsResult, sysMsg] = await Promise.all([
          api.seats.list(),
          api.me.getLatestSystemMessage()
        ]);
        setSeats(seatsResult.items);
        setSystemMessage(sysMsg);
      } catch {
        setError('无法加载座位数据');
      } finally {
        setLoading(false);
      }
    }
    load();
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

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      message.error('结束时间必须晚于开始时间');
      return;
    }

    if (start < new Date()) {
      message.error('开始时间不能早于当前时间');
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
      message.error(err instanceof Error ? err.message : '预约失败，请重试');
    } finally {
      setReserving(false);
    }
  }

  const freeCount = seats.filter(
    (s) => s.business_status === SeatStatus.FREE && s.availability_status === SeatAvailability.AVAILABLE
  ).length;

  const occupiedCount = seats.filter(
    (s) => s.business_status === SeatStatus.OCCUPIED
  ).length;

  return (
    <div className="space-y-4 flex-1 min-h-[calc(100vh-8rem)] flex flex-col">
      {/* Stats bar */}
      <Row gutter={[12, 12]}>
        <Col span={8}>
          <Card hoverable size="small" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }}>
            <Statistic title="总座位" value={seats.length} />
          </Card>
        </Col>
        <Col span={8}>
          <Card hoverable size="small" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }}>
            <Statistic title="空闲" value={freeCount} styles={{ content: { color: '#10b981' } }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card hoverable size="small" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }}>
            <Statistic title="使用中" value={occupiedCount} styles={{ content: { color: '#f43f5e' } }} />
          </Card>
        </Col>
      </Row>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm">
          {error}
          <button onClick={refreshSeats} className="ml-3 underline">重试</button>
        </div>
      )}

      {/* Seat grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spin size="large" />
        </div>
      ) : seats.length === 0 ? (
        <Empty description="暂无座位数据" />
      ) : (
        <Row gutter={[12, 12]}>
          {seats.map((seat) => {
            const status = statusTagMap[seat.business_status];
            const isUnavailable = seat.availability_status === SeatAvailability.UNAVAILABLE;
            const canReserve =
              seat.business_status === SeatStatus.FREE &&
              seat.availability_status === SeatAvailability.AVAILABLE;

            return (
              <Col xs={12} key={seat.seat_id}>
                <Card
                  hoverable={canReserve}
                  size="small"
                  className={isUnavailable ? 'opacity-50' : ''}
                  onClick={() => canReserve && openReserve(seat)}
                  style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">{seat.seat_no}</span>
                    <Tag color={status.color}>{status.label}</Tag>
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-1">
                    <EnvironmentOutlined />
                    {seat.area}
                  </div>
                  {isUnavailable && (
                    <div className="text-xs text-red-500 mt-1">设备离线</div>
                  )}
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* Reservation modal */}
      <Modal
        title="预约座位"
        open={!!reserveSeat && !reserveSuccess}
        onCancel={() => setReserveSeat(null)}
        onOk={handleReserve}
        confirmLoading={reserving}
        okText="确认预约"
        cancelText="取消"
      >
        {reserveSeat && (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-slate-500">
              {reserveSeat.seat_no} · {reserveSeat.area}
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">开始时间</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">结束时间</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Success modal */}
      <Modal
        open={reserveSuccess}
        footer={null}
        onCancel={() => setReserveSeat(null)}
      >
        <div className="text-center py-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold">预约成功</h3>
          <p className="text-sm text-slate-500 mt-1">座位 {reserveSeat?.seat_no} 已预约</p>
        </div>
      </Modal>

      {/* System message modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <BellOutlined className="text-blue-500" />
            <span>系统消息</span>
          </div>
        }
        open={!!systemMessage}
        closable={false}
        mask={{ closable: false }}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={dismissMessage}>关闭</Button>
            <Button type="primary" onClick={dismissMessage}>
              不再提示
            </Button>
          </div>
        }
      >
        {systemMessage && (
          <div className="space-y-3 pt-2">
            <h3 className="text-base font-semibold">{systemMessage.title}</h3>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{systemMessage.content}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
