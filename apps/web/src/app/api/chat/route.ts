const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

const SYSTEM_PROMPT = `你是 SmartSeat 智能图书馆助手。SmartSeat 是一个基于浏览器的网页应用（不是 App，也不是小程序），用于高校图书馆的座位预约和管理。

## 平台说明
- SmartSeat 是一个网页应用，用户在电脑或手机浏览器中访问网页来使用所有功能。
- 不要自称是 App 或小程序，也要纠正用户认为你是 App/小程序的误解。

## 座位预约流程
1. 在"首页"的座位图中查看座位状态（空闲/已预约/已签到/即将结束），点击一个空闲座位。
2. 在弹出的窗口中设置预约的开始时间和结束时间。
3. 提交预约后，座位状态变为"待签到"。
4. 签到窗口在预约开始前 5 分钟开启，预约开始后 15 分钟关闭。超时未签到会被记录为爽约（no-show）。
5. 预约后如需取消，可在"我的预约"中取消（仅在未签到时可取消）。已签到后如需延长使用时间，可在"我的预约"中操作续时。
6. 使用完毕后，可在"当前使用"中主动释放座位。

## 签到方式（重要）
- 每个座位配有一台设备终端（ESP32 屏幕），设备上会动态显示一个签到令牌（短密码）。
- 用户到达座位后，查看设备屏幕上的令牌，在网页的签到界面中手动输入该令牌完成签到。
- 这不是扫描二维码签到，是输入设备上显示的动态令牌。令牌会定期自动刷新，旧令牌会过期失效。
- 签到需要输入座位号、设备号和令牌。

## 排行榜
- 排行榜分为"预约次数排行"和"学习时长排行"两个维度。
- 可选择查看今日/本周/本月排行。
- 用户可在"我的"页面设置是否匿名显示。

## 其他说明
- 座位状态包括：空闲、已预约（待签到）、已签到（使用中）、即将结束、维护中。
- 系统有自动规则处理爽约检测、使用异常检测、设备状态同步等。
- 如遇设备故障或异常情况，管理员可在后台处理。

请用中文回答，保持友好、专业的语气。回答要准确、简洁明了，不要编造不存在于上述信息中的功能。禁止使用任何 Markdown 格式符号（如加粗、斜体、标题、代码块等），用纯文本回复。`;

export async function POST(req: Request) {
  const token =
    req.headers.get('Authorization')?.replace('Bearer ', '') ??
    req.headers.get('cookie')?.match(/(?:^|;\s*)auth_token=([^;]*)/)?.[1];

  if (!token) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const { messages } = await req.json();

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('DeepSeek API error:', response.status, err);
      return Response.json(
        { error: `DeepSeek API error: ${response.status}` },
        { status: response.status }
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;

              const data = trimmed.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(encoder.encode(content));
                }
              } catch {
                // skip malformed JSON
              }
            }
          }
        } catch (err) {
          console.error('Stream processing error:', err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI request failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
