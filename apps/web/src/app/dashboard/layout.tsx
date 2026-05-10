'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Layout, Menu, Button, theme } from 'antd';
import {
  HomeOutlined,
  ScheduleOutlined,
  TrophyOutlined,
  RobotOutlined,
  SafetyOutlined,
  LogoutOutlined,
  MenuOutlined
} from '@ant-design/icons';
import { logout } from '@/lib/auth';
import { getApiClient } from '@/lib/api';
import { UserRole } from '@smartseat/contracts';
import MessageCenter from './message-center';

const { Sider, Header, Content } = Layout;

const navItems = [
  { key: '/dashboard', label: '首页 / 预约', icon: <HomeOutlined /> },
  { key: '/dashboard/my-reservations', label: '我的预约', icon: <ScheduleOutlined /> },
  { key: '/dashboard/leaderboard', label: '排行榜', icon: <TrophyOutlined /> },
  { key: '/dashboard/ai', label: 'AI 助手', icon: <RobotOutlined /> }
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const { token: themeToken } = theme.useToken();

  useEffect(() => {
    const api = getApiClient();
    api.me.get()
      .then((me) => {
        if (me.roles?.includes(UserRole.ADMIN)) {
          setIsAdmin(true);
        }
      })
      .catch(() => {});
  }, []);

  if (pathname.startsWith('/dashboard/admin')) {
    return <>{children}</>;
  }

  const selectedKey = navItems.find((i) => pathname === i.key)?.key ?? '/dashboard';

  const adminMenuItems = isAdmin
    ? [{ key: '/dashboard/admin', label: '管理后台', icon: <SafetyOutlined /> }]
    : [];

  const bottomItems = [
    ...adminMenuItems,
    { key: 'logout', label: '退出登录', icon: <LogoutOutlined /> }
  ];

  const siderMenu = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/20 dark:border-white/10">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: themeToken.colorPrimary }}
        >
          <SafetyOutlined className="text-white text-base" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="font-semibold text-sm whitespace-nowrap">SmartSeat</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">图书馆座位管理</div>
          </div>
        )}
      </div>

      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={navItems}
        onClick={({ key }) => router.push(key)}
        className="flex-1 border-r-0 pt-2 bg-transparent"
      />

      <div className="border-t border-white/20 dark:border-white/10 pt-2 pb-3 px-2">
        <Menu
          mode="inline"
          selectedKeys={[]}
          items={bottomItems}
          onClick={({ key }) => {
            if (key === 'logout') {
              logout();
            } else {
              router.push(key);
            }
          }}
          className="border-r-0 bg-transparent"
        />
      </div>
    </div>
  );

  return (
    <Layout className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Desktop sidebar */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        breakpoint="lg"
        collapsedWidth={0}
        className="hidden lg:block"
        width={240}
        style={{
          background: 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(16px)',
          borderRight: '1px solid rgba(255,255,255,0.4)'
        }}
      >
        {siderMenu}
      </Sider>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div
            className="absolute inset-y-0 left-0 w-60 shadow-2xl"
            style={{
              background: 'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(20px)',
              borderRight: '1px solid rgba(255,255,255,0.5)'
            }}
          >
            {siderMenu}
          </div>
        </div>
      )}

      <Layout className="flex-1 min-h-0 bg-transparent">
        <Header
          className="flex items-center gap-4 px-4 sticky top-0 z-30"
          style={{
            background: 'rgba(255,255,255,0.6)',
            backdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(255,255,255,0.4)',
            height: 48,
            lineHeight: '48px'
          }}
        >
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setMobileOpen(true)}
            className="lg:hidden"
          />
          <span className="text-sm font-medium text-slate-600 flex-1">
            {navItems.find((i) => i.key === pathname)?.label ?? 'SmartSeat'}
          </span>
          <MessageCenter />
        </Header>

        <Content
          className="p-4 sm:p-6 w-full flex flex-col overflow-x-hidden"
          style={{ minHeight: 'calc(100vh - 48px)' }}
        >
          <div className="flex-1 flex flex-col">
            {children}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
