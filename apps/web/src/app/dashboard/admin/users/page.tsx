'use client';

import { useEffect, useState } from 'react';
import { Table, Button, Modal, Input, App, Tag, Space } from 'antd';
import { EditOutlined, UserOutlined, DeleteOutlined } from '@ant-design/icons';
import type { AdminUserDto } from '@smartseat/contracts';
import { UserRole } from '@smartseat/contracts';
import { getApiClient } from '@/lib/api';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserDto | null>(null);
  const [newAccount, setNewAccount] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<AdminUserDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { message: antMsg, modal: antModal } = App.useApp();

  const fetchUsers = async (p: number) => {
    setLoading(true);
    try {
      const api = getApiClient();
      const res = await api.admin.listUsers({ page: p, page_size: 20 });
      setUsers(res.items);
      setTotal(res.total);
    } catch {
      antMsg.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(page);
  }, [page]);

  const openEdit = (user: AdminUserDto) => {
    setEditingUser(user);
    setNewAccount(user.external_user_no ?? '');
    setNewPassword('');
    setEditOpen(true);
  };

  const handleSubmit = async () => {
    if (!editingUser) return;
    if (!newAccount.trim()) {
      antMsg.warning('请输入账号名');
      return;
    }

    setSubmitting(true);
    try {
      const api = getApiClient();
      await api.admin.updateUser(editingUser.user_id, {
        external_user_no: newAccount.trim(),
        ...(newPassword ? { password: newPassword } : {})
      });
      antMsg.success('用户信息已成功更新');
      setEditOpen(false);
      fetchUsers(page);
    } catch (err) {
      antMsg.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (user: AdminUserDto) => {
    antModal.confirm({
      title: '确认删除',
      content: `确定要删除用户 "${user.local_sub ?? user.external_user_no ?? user.user_id}" 吗？此操作不可恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setDeleting(true);
        try {
          const api = getApiClient();
          await api.admin.deleteUser(user.user_id);
          antMsg.success('用户已删除');
          fetchUsers(page);
        } catch (err) {
          antMsg.error(err instanceof Error ? err.message : '删除失败');
        } finally {
          setDeleting(false);
        }
      }
    });
  };

  const roleColor = (role: UserRole): string => {
    if (role === UserRole.ADMIN) return 'red';
    if (role === UserRole.STUDENT) return 'blue';
    return 'default';
  };

  const columns = [
    {
      title: '用户 ID',
      dataIndex: 'user_id',
      key: 'user_id',
      width: 120,
      ellipsis: true,
      render: (v: string) => <span className="text-xs font-mono">{v.slice(0, 12)}...</span>
    },
    {
      title: '账号',
      dataIndex: 'local_sub',
      key: 'local_sub',
      width: 100,
      render: (v: string | undefined) => v ?? '-'
    },
    {
      title: '外部编号',
      dataIndex: 'external_user_no',
      key: 'external_user_no',
      width: 120,
      render: (v: string | undefined) => v ?? '-'
    },
    {
      title: '昵称',
      dataIndex: 'display_name',
      key: 'display_name',
      width: 120,
      render: (v: string | undefined, record: AdminUserDto) => v ?? record.anonymous_name
    },
    {
      title: '角色',
      dataIndex: 'roles',
      key: 'roles',
      width: 140,
      render: (roles: UserRole[]) => (
        <Space size={4}>
          {roles.map((r) => (
            <Tag key={r} color={roleColor(r)}>{r === UserRole.ADMIN ? '管理员' : '学生'}</Tag>
          ))}
        </Space>
      )
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (v: string) => new Date(v).toLocaleString('zh-CN')
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_: unknown, record: AdminUserDto) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => confirmDelete(record)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <UserOutlined className="text-lg" />
        <h1 className="text-lg font-semibold m-0">用户管理</h1>
      </div>

      <div className="flex-1 bg-white/60 backdrop-blur-xl rounded-2xl border border-white/40 shadow-sm overflow-hidden">
        <Table
          dataSource={users}
          columns={columns}
          rowKey="user_id"
          loading={loading}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            onChange: setPage,
            showTotal: (t) => `共 ${t} 个用户`
          }}
          size="small"
          className="[&_.ant-table]:!bg-transparent"
        />
      </div>

      <Modal
        title="编辑用户"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
      >
        <div className="space-y-4 py-2">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">新账号名</label>
            <Input
              value={newAccount}
              onChange={(e) => setNewAccount(e.target.value)}
              placeholder="输入新的外部编号"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">新密码</label>
            <Input.Password
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="留空则不修改密码"
            />
            <p className="text-xs text-slate-400 mt-1">留空则不修改密码</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
