"use client";

import { Eye, EyeSlash, HouseLine, LockKey, SignIn, User, UserPlus } from "@phosphor-icons/react";
import { FormEvent, useEffect, useState } from "react";
import { getLocalUsers, localLogin, setLocalSession } from "@/lib/local-auth";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const [localUsers, setLocalUsers] = useState<ReturnType<typeof getLocalUsers>>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { method: "GET", credentials: "same-origin" })
      .then((res) => { if (!cancelled) setApiAvailable(res.ok); })
      .catch(() => { if (!cancelled) setApiAvailable(false); });
    setLocalUsers(getLocalUsers());
    return () => { cancelled = true; };
  }, []);

  const useLocal = apiAvailable === false;
  const pwdMin = 6;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    if (apiAvailable) {
      setSubmitting(true);
      setMessage("");
      try {
        const response = await fetch("/api/auth/login", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
        const contentType = response.headers.get("Content-Type") ?? "";
        const result = contentType.includes("application/json") ? await response.json() as { error?: string; username?: string } : null;
        if (!response.ok) throw new Error(result?.error || "登录失败，请稍后重试");
        setLocalSession(result?.username ?? username.trim());
        window.location.replace("/");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "登录失败，请稍后重试");
        setSubmitting(false);
      }
      return;
    }

    if (!username.trim()) return;
    setSubmitting(true);
    setMessage("");
    const result = await localLogin(username.trim(), password);
    if (!result.ok) { setMessage(result.error ?? "用户名或密码错误"); setSubmitting(false); return; }
    window.location.replace("/");
  };

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand"><span><HouseLine size={23} weight="fill" /></span><div><strong>筑记</strong><small>装修现场助手</small></div></div>
        <div className="login-heading">
          <span><LockKey size={18} />{apiAvailable === null ? "连接中…" : "欢迎回来"}</span>
          <h1 id="login-title">登录装修档案</h1>
          <p>登录后即可查看和管理你的装修项目。</p>
        </div>

        {useLocal && localUsers.length > 0 ? (
          <div className="local-user-list">
            <span>已注册的账号（点击填入用户名）</span>
            {localUsers.map((user) => (
              <button key={user.username} type="button" className="local-user-item" onClick={() => setUsername(user.username)}>
                <User size={16} /> {user.username}
                <small>{new Date(user.createdAt).toLocaleDateString("zh-CN")}</small>
              </button>
            ))}
          </div>
        ) : null}

        {apiAvailable === null ? (
          <p className="login-security" style={{ textAlign: "center", padding: "30px" }}>正在连接服务…</p>
        ) : (
          <form onSubmit={submit}>
            <label><span>账号</span><input autoComplete="username" maxLength={64} value={username} onChange={(event) => setUsername(event.target.value)} required autoFocus /></label>
            <label><span>密码</span><div className="password-input"><input type={showPassword ? "text" : "password"} autoComplete="current-password" minLength={pwdMin} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}</button></div></label>
            {message ? <p className="login-error" role="alert">{message}</p> : null}
            <button className="primary-button login-submit" type="submit" disabled={submitting}>{submitting ? "正在验证…" : <><SignIn size={18} weight="bold" />安全登录</>}</button>
          </form>
        )}
        <div className="login-account-prompt">
          <span>还没有账号？</span>
          <a className="login-register-button" href="/register"><UserPlus size={17} weight="bold" />注册新账号</a>
          <small>登录会话将在 12 小时后自动失效</small>
        </div>
      </section>
    </main>
  );
}
