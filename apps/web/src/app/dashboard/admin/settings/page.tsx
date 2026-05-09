'use client';

import { useEffect, useState } from 'react';
import { getApiClient } from '@/lib/api';
import { Card, Select, Button, Descriptions, Spin, App, Tag } from 'antd';
import type { AuthConfigPublicDto } from '@smartseat/contracts';
import { AuthMode } from '@smartseat/contracts';

const authModeLabels: Record<AuthMode, string> = {
  [AuthMode.LOCAL]: '本地账号 (LOCAL)',
  [AuthMode.OIDC]: 'OIDC 单点登录',
  [AuthMode.WECHAT]: '微信扫码登录'
};

export default function AdminSettingsPage() {
  const [config, setConfig] = useState<AuthConfigPublicDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<AuthMode>(AuthMode.LOCAL);
  const { message } = App.useApp();

  useEffect(() => {
    const api = getApiClient();
    api.admin.getAuthConfig()
      .then((cfg) => {
        setConfig(cfg);
        setSelectedMode(cfg.auth_mode);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load config'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const api = getApiClient();
      const updated = await api.admin.updateAuthConfig({ auth_mode: selectedMode });
      setConfig(updated);
      message.success('登录模式已更新');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-24"><Spin size="large" /></div>;
  }

  if (error) {
    return <div className="text-center py-24 text-red-500">{error}</div>;
  }

  if (!config) return null;

  const hasChanges = selectedMode !== config.auth_mode;

  return (
    <div className="space-y-4 flex-1 flex flex-col">
      <h1 className="text-lg font-semibold">系统安全设置</h1>

      <Card style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }} title="登录认证模式" size="small">
        <div className="flex items-center gap-4 flex-wrap">
          <Select
            value={selectedMode}
            onChange={(v) => setSelectedMode(v)}
            className="w-52"
            options={Object.entries(authModeLabels).map(([mode, label]) => ({
              value: mode,
              label
            }))}
          />
          <Button
            type="primary"
            onClick={handleSave}
            loading={saving}
            disabled={!hasChanges}
          >
            保存更改
          </Button>
        </div>
        {hasChanges && (
          <p className="mt-3 text-xs text-amber-600">
            当前有未保存的更改：{authModeLabels[config.auth_mode]} → {authModeLabels[selectedMode]}
          </p>
        )}
      </Card>

      <Card style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }} title="OIDC 配置信息" size="small">
        <Descriptions column={1} size="small" colon={false}>
          <Descriptions.Item label="Issuer URL">{config.oidc_issuer || '未设置'}</Descriptions.Item>
          <Descriptions.Item label="Client ID">{config.oidc_client_id || '未设置'}</Descriptions.Item>
          <Descriptions.Item label="Redirect URI">{config.oidc_redirect_uri || '未设置'}</Descriptions.Item>
          <Descriptions.Item label="Client Secret">
            {config.oidc_secret_configured ? <Tag color="success">已配置</Tag> : <Tag>未配置</Tag>}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }} title="微信登录配置" size="small">
        <Descriptions column={1} size="small" colon={false}>
          <Descriptions.Item label="App ID">{config.wechat_appid || '未设置'}</Descriptions.Item>
          <Descriptions.Item label="App Secret">
            {config.wechat_secret_configured ? <Tag color="success">已配置</Tag> : <Tag>未配置</Tag>}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }} title="管理员映射规则" size="small">
        <Descriptions column={1} size="small" colon={false}>
          <Descriptions.Item label="映射规则">{config.admin_mapping_rule || '未设置'}</Descriptions.Item>
        </Descriptions>
      </Card>

      {config.updated_at && (
        <p className="text-xs text-slate-400 text-right">
          最后更新：{new Date(config.updated_at).toLocaleString('zh-CN')}
          {config.updated_by ? ` · 操作者 ${config.updated_by.slice(0, 8)}...` : ''}
        </p>
      )}
    </div>
  );
}
