import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

const deepseek = createOpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const SYSTEM_PROMPT = `你是 SmartSeat 智能图书馆助手。你可以帮助用户解决以下问题：
- 座位预约流程和规则
- 图书馆开放时间和使用指南
- 学习效率提升建议
- 排行榜和打卡规则说明
- 设备使用和技术支持

请用中文回答，保持友好、专业的语气。回答简洁明了。`;

export async function POST(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    ?? req.headers.get('cookie')?.match(/(?:^|;\s*)auth_token=([^;]*)/)?.[1];

  if (!token) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const { messages } = await req.json();

    const result = streamText({
      model: deepseek('deepseek-chat'),
      system: SYSTEM_PROMPT,
      messages,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI request failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
