"use client";

import { Eye, EyeSlash, HouseLine, UserPlus } from "@phosphor-icons/react";
import { FormEvent, useEffect, useState } from "react";
import { localRegister, setLocalSession } from "@/lib/local-auth";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { method: "GET", credentials: "same-origin" })
      .then((res) => { if (!cancelled) setApiAvailable(res.ok); })
      .catch(() => { if (!cancelled) setApiAvailable(false); });
    return () => { cancelled = true; };
  }, []);

  const pwdMin = 6;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || registered) return;
    if (password !== confirmPassword) { setMessage("两次输入的密码不一致"); return; }

    setSubmitting(true);
    setMessage("");

    if (apiAvailable) {
      try {
        const response = await fetch("/api/auth/register", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username.trim(), password }) });
        const result = (await response.json()) as { error?: string; username?: string };
        if (!response.ok) throw new Error(result.error || "注册失败，请稍后重试");
        setLocalSession(result.username ?? username.trim());
        window.location.replace("/");
        return;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "注册失败，请稍后重试");
        setSubmitting(false);
        return;
      }
    }

    if (!username.trim() || username.trim().length < 2) { setMessage("用户名至少需要 2 个字符"); setSubmitting(false); return; }
    if (password.length < pwdMin) { setMessage(`密码至少需要 ${pwdMin} 位`); setSubmitting(false); return; }
    const result = await localRegister(username.trim(), password);
    if (!result.ok) { setMessage(result.error ?? "注册失败"); setSubmitting(false); return; }
    window.location.replace("/");
  };

  const passwordStrength = (() => {
    if (!password) return { label: "", level: 0 };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    if (score <= 2) return { label: "弱", level: 1 };
    if (score <= 3) return { label: "中等", level: 2 };
    return { label: "强", level: 3 };
  })();

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="register-title">
        <div className="login-brand"><span><HouseLine size={23} weight="fill" /></span><div><strong>筑记</strong><small>装修现场助手</small></div></div>
        <div className="login-heading">
          <span><UserPlus size={18} />创建新账号</span>
          <h1 id="register-title">注册装修档案</h1>
          <p>每个账号拥有独立的装修项目空间，数据完全隔离。</p>
        </div>

        {apiAvailable === null ? (
          <p className="login-security" style={{ textAlign: "center", padding: "30px" }}>正在连接服务…</p>
        ) : registered ? (
          <div className="register-success"><p>注册成功！正在跳转到你的装修项目…</p></div>
        ) : (
          <form onSubmit={submit}>
            <label><span>用户名</span><input autoComplete="username" maxLength={30} minLength={2} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="2-30位，支持中英文、数字和下划线" required autoFocus /></label>
            <label><span>密码{pwdMin > 1 ? `（${pwdMin}-128 位）` : ""}</span><div className="password-input"><input type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={pwdMin} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} required /><button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}</button></div>
              {passwordStrength.level > 0 ? <div className="password-strength"><div className={`strength-bar level-${passwordStrength.level}`} /><span>密码强度：{passwordStrength.label}</span></div> : null}
            </label>
            <label><span>确认密码</span><input type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={pwdMin} maxLength={128} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></label>
            {message ? <p className="login-error" role="alert">{message}</p> : null}
            <button className="primary-button login-submit" type="submit" disabled={submitting}>{submitting ? "正在注册…" : <><UserPlus size={18} weight="bold" />创建账号</>}</button>
          </form>
        )}
        <p className="login-security">已有账号？<a href="/login">返回登录</a></p>
      </section>
    </main>
  );
}
