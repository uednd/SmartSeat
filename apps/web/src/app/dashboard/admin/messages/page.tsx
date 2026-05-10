'use client';

import { useState } from 'react';
import { Card, Form, Input, Button, App } from 'antd';
import { NotificationOutlined } from '@ant-design/icons';
import { getApiClient } from '@/lib/api';

const { TextArea } = Input;

export default function AdminMessagesPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  const handleSubmit = async (values: { title: string; content: string }) => {
    setLoading(true);
    try {
      const api = getApiClient();
      await api.admin.createSystemMessage({
        title: values.title.trim(),
        content: values.content.trim(),
      });
      message.success('消息推送成功');
      form.resetFields();
    } catch {
      message.error('消息推送失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold mb-4">消息推送</h1>

      <Card
        style={{
          background: 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.5)',
          boxShadow: '0 4px 24px rgba(99,102,241,0.08)',
        }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <Form.Item
            label="消息标题"
            name="title"
            rules={[{ required: true, message: '请输入消息标题' }]}
          >
            <Input
              prefix={<NotificationOutlined />}
              placeholder="请输入消息标题"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="消息内容"
            name="content"
            rules={[{ required: true, message: '请输入消息内容' }]}
          >
            <TextArea
              rows={6}
              placeholder="请输入消息内容"
              size="large"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              size="large"
            >
              推送消息
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
