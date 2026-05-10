'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Layout, Menu, Button } from 'antd';
import {
  DashboardOutlined,
  AppstoreOutlined,
  AlertOutlined,
  SettingOutlined,
  LogoutOutlined,
  ArrowLeftOutlined,
  MenuOutlined,
  SafetyOutlined,
  BellOutlined,
  TeamOutlined
} from '@ant-design/icons';
import { getApiClient } from '@/lib/api';
import { logout } from '@/lib/auth';
import { UserRole } from '@smartseat/contracts';

const { Sider, Header, Content } = Layout;

const adminNavItems = [
  { key: '/dashboard/admin', label: '全局看板', icon: <DashboardOutlined /> },
  { key: '/dashboard/admin/users', label: '用户管理', icon: <TeamOutlined /> },
  { key: '/dashboard/admin/seats', label: '座位与终端管理', icon: <AppstoreOutlined /> },
  { key: '/dashboard/admin/anomalies', label: '异常事件处理', icon: <AlertOutlined /> },
  { key: '/dashboard/admin/messages', label: '消息推送', icon: <BellOutlined /> },
  { key: '/dashboard/admin/settings', label: '系统安全设置', icon: <SettingOutlined /> }
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const api = getApiClient();
    api.me.get()
      .then((me) => {
        const roles: UserRole[] = me.roles ?? [];
        if (roles.includes(UserRole.ADMIN)) {
          setAuthorized(true);
        } else {
          router.replace('/dashboard');
        }
      })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-cyan-50">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authorized) return null;

  const selectedKey = adminNavItems.find((i) => i.key === pathname)?.key ?? '/dashboard/admin';

  const siderMenu = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/20 dark:border-white/10">
        <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center shrink-0">
          <SafetyOutlined className="text-white text-base" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="font-semibold text-sm whitespace-nowrap">管理后台</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">系统管理控制台</div>
          </div>
        )}
      </div>

      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={adminNavItems}
        onClick={({ key }) => router.push(key)}
        className="flex-1 border-r-0 pt-2 bg-transparent"
      />

      <div className="border-t border-white/20 dark:border-white/10 pt-2 pb-3 px-2">
        <Menu
          mode="inline"
          selectedKeys={[]}
          items={[
            { key: '/dashboard', label: '返回学生首页', icon: <ArrowLeftOutlined /> },
            { key: 'logout', label: '退出登录', icon: <LogoutOutlined /> }
          ]}
          onClick={({ key }) => {
            if (key === 'logout') logout();
            else router.push(key);
          }}
          className="border-r-0 bg-transparent"
        />
      </div>
    </div>
  );

  return (
    <Layout className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
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
          <span className="text-sm font-medium text-slate-600">
            {adminNavItems.find((i) => i.key === pathname)?.label ?? '管理后台'}
          </span>
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
