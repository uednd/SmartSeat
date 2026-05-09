'use client';

import { useEffect, useState } from 'react';
import { getApiClient } from '@/lib/api';
import { useToast } from '@/lib/toast';
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
  const { showToast } = useToast();

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
      const updated = await api.admin.updateAuthConfig({
        auth_mode: selectedMode
      });
      setConfig(updated);
      showToast('success', '登录模式已更新');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl p-6 text-red-700 dark:text-red-400 text-sm">
        {error}
      </div>
    );
  }

  if (!config) return null;

  const hasChanges = selectedMode !== config.auth_mode;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">系统安全设置</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          管理系统登录认证模式与安全配置
        </p>
      </div>

      {/* Auth Mode */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">登录认证模式</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
          切换系统全局登录方式。更改后立即生效。
        </p>

        <div className="flex items-center gap-4">
          <select
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value as AuthMode)}
            className="px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
          >
            {Object.entries(authModeLabels).map(([mode, label]) => (
              <option key={mode} value={mode}>{label}</option>
            ))}
          </select>

          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : '保存更改'}
          </button>
        </div>

        {hasChanges && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            当前有未保存的更改：{authModeLabels[config.auth_mode]} → {authModeLabels[selectedMode]}
          </p>
        )}
      </div>

      {/* OIDC Configuration (read-only) */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">OIDC 配置信息</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
          以下为当前 OIDC 配置摘要，敏感信息不在此展示。
        </p>

        <div className="space-y-3">
          <ConfigRow label="Issuer URL" value={config.oidc_issuer} />
          <ConfigRow label="Client ID" value={config.oidc_client_id} />
          <ConfigRow label="Redirect URI" value={config.oidc_redirect_uri} />
          <ConfigRow
            label="Client Secret"
            value={config.oidc_secret_configured ? '已配置 (不可见)' : '未配置'}
            sensitive
          />
        </div>
      </div>

      {/* WeChat Configuration (read-only) */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">微信登录配置</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
          以下为当前微信配置摘要，密钥不在此展示。
        </p>

        <div className="space-y-3">
          <ConfigRow label="App ID" value={config.wechat_appid} />
          <ConfigRow
            label="App Secret"
            value={config.wechat_secret_configured ? '已配置 (不可见)' : '未配置'}
            sensitive
          />
        </div>
      </div>

      {/* Admin Mapping Rule */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">管理员映射规则</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
          用于 OIDC/微信登录时自动分配管理员角色的映射规则。
        </p>

        <ConfigRow label="映射规则" value={config.admin_mapping_rule} />
      </div>

      {/* Last Updated */}
      {config.updated_at && (
        <p className="text-xs text-slate-400 dark:text-slate-500 text-right">
          最后更新：{new Date(config.updated_at).toLocaleString('zh-CN')}
          {config.updated_by ? ` · 操作者 ${config.updated_by.slice(0, 8)}...` : ''}
        </p>
      )}
    </div>
  );
}

function ConfigRow({
  label,
  value,
  sensitive
}: {
  label: string;
  value?: string;
  sensitive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span
        className={`text-xs ${
          value
            ? sensitive
              ? 'text-emerald-600 dark:text-emerald-400 font-medium'
              : 'text-slate-700 dark:text-slate-300 font-mono'
            : 'text-slate-400 italic'
        }`}
      >
        {value || '未设置'}
      </span>
    </div>
  );
}
