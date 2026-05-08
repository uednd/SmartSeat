'use client';

import { useState, type FormEvent } from 'react';
import { login, userRegister } from '@/lib/auth';

type Mode = 'login' | 'register';

const GENDER_OPTIONS = [
  { value: 'MALE', label: '男' },
  { value: 'FEMALE', label: '女' },
  { value: 'OTHER', label: '其他' }
] as const;

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');

  // Login fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Register fields
  const [regUsername, setRegUsername] = useState('');
  const [regNickname, setRegNickname] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regGender, setRegGender] = useState('MALE');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function reset() {
    setUsername('');
    setPassword('');
    setRegUsername('');
    setRegNickname('');
    setRegPassword('');
    setRegGender('MALE');
    setError('');
  }

  function switchMode(m: Mode) {
    setMode(m);
    setError('');
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('请输入账号');
      return;
    }
    if (!password.trim()) {
      setError('请输入密码');
      return;
    }

    setLoading(true);
    try {
      const result = await login(username, password);
      if (result.success) {
        window.location.href = '/dashboard';
      } else if (result.notRegistered) {
        setError('该账号尚未注册，请先注册。');
        setRegUsername(username);
        switchMode('register');
      } else {
        setError(result.error ?? '登录失败，请重试');
      }
    } catch {
      setError('网络错误，请检查连接');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!regUsername.trim()) {
      setError('请输入账号');
      return;
    }
    if (!regNickname.trim()) {
      setError('请输入昵称');
      return;
    }
    if (!regPassword.trim()) {
      setError('请输入密码');
      return;
    }
    if (regPassword.trim().length < 4) {
      setError('密码至少 4 位');
      return;
    }

    setLoading(true);
    try {
      const result = await userRegister({
        username: regUsername.trim(),
        password: regPassword,
        display_name: regNickname.trim(),
        gender: regGender
      });
      if (result.success) {
        window.location.href = '/dashboard';
      } else {
        setError(result.error ?? '注册失败，请重试');
      }
    } catch {
      setError('网络错误，请检查连接');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDE4YzEuNjU3IDAgMy0xLjM0MyAzLTNzLTEuMzQzLTMtMy0zLTMgMS4zNDMtMyAzIDEuMzQzIDMgMyAzem0tMTIgMGMxLjY1NyAwIDMtMS4zNDMgMy0zcy0xLjM0My0zLTMtMy0zIDEuMzQzLTMgMyAxLjM0MyAzIDMgM3oiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-50" />

      <div className="relative w-full max-w-md px-4">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/20 mb-4">
              <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">SmartSeat</h1>
            <p className="text-slate-400 mt-2 text-sm">智能图书馆座位管理系统</p>
          </div>

          {/* Mode tabs */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex bg-white/5 rounded-xl p-1">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`px-6 py-2 text-sm font-medium rounded-lg transition-all ${
                  mode === 'login'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                登 录
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={`px-6 py-2 text-sm font-medium rounded-lg transition-all ${
                  mode === 'register'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                注 册
              </button>
            </div>
          </div>

          {/* Login form */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-1.5">
                  账号
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="输入账号"
                  autoComplete="username"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
                  密码
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入密码"
                  autoComplete="current-password"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                {loading ? '登录中...' : '登 录'}
              </button>

              <p className="text-center text-slate-500 text-xs">
                还没有账号？
                <button type="button" onClick={() => switchMode('register')} className="text-blue-400 hover:text-blue-300 ml-1">
                  去注册
                </button>
              </p>
            </form>
          )}

          {/* Register form */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="reg-username" className="block text-sm font-medium text-slate-300 mb-1.5">
                  账号
                </label>
                <input
                  id="reg-username"
                  type="text"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="输入账号"
                  autoComplete="username"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                />
              </div>

              <div>
                <label htmlFor="reg-nickname" className="block text-sm font-medium text-slate-300 mb-1.5">
                  昵称
                </label>
                <input
                  id="reg-nickname"
                  type="text"
                  value={regNickname}
                  onChange={(e) => setRegNickname(e.target.value)}
                  placeholder="输入昵称"
                  autoComplete="name"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                />
              </div>

              <div>
                <label htmlFor="reg-password" className="block text-sm font-medium text-slate-300 mb-1.5">
                  密码
                </label>
                <input
                  id="reg-password"
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="输入密码（至少4位）"
                  autoComplete="new-password"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  性别
                </label>
                <div className="flex gap-2">
                  {GENDER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRegGender(opt.value)}
                      className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-all border ${
                        regGender === opt.value
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                {loading ? '注册中...' : '注 册'}
              </button>

              <p className="text-center text-slate-500 text-xs">
                已有账号？
                <button type="button" onClick={() => switchMode('login')} className="text-blue-400 hover:text-blue-300 ml-1">
                  去登录
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
