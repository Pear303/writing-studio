console.log("MAIN: Starting with login system");

import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { db } from "./db";
import { UserProvider, useUser } from "./auth/UserContext";
import { AuthPage } from "./components/Auth/AuthPage";

const getThemeColors = () => {
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  const colors: Record<string, { bgStart: string; bgEnd: string; cardBg: string; cardBorder: string; textPrimary: string; textSecondary: string; inputBg: string; inputBorder: string; buttonBg: string; buttonHover: string; link: string; linkHover: string; errorBg: string; errorText: string }> = {
    light: {
      bgStart: '#f8fafc', bgEnd: '#f1f5f9', cardBg: '#ffffff', cardBorder: '#e2e8f0', textPrimary: '#1e293b', textSecondary: '#64748b', inputBg: '#ffffff', inputBorder: '#e2e8f0', buttonBg: '#3b82f6', buttonHover: '#2563eb', link: '#3b82f6', linkHover: '#2563eb', errorBg: '#fef2f2', errorText: '#dc2626'
    },
    dark: {
      bgStart: '#1e1e1e', bgEnd: '#1e1e1e', cardBg: '#252526', cardBorder: '#3d3d3d', textPrimary: '#e2e2e2', textSecondary: '#9ca3af', inputBg: '#2d2d2d', inputBorder: '#3d3d3d', buttonBg: '#0098ff', buttonHover: '#0078d4', link: '#0098ff', linkHover: '#1177bb', errorBg: 'rgba(239, 68, 68, 0.15)', errorText: '#f87171'
    },
    'eye-care': {
      bgStart: '#f5f5dc', bgEnd: '#f5f5dc', cardBg: '#fafad2', cardBorder: '#d0d0b8', textPrimary: '#222222', textSecondary: '#555555', inputBg: '#fafad2', inputBorder: '#d0d0b8', buttonBg: '#6b8e6b', buttonHover: '#5a7a5a', link: '#6b8e6b', linkHover: '#5a7a5a', errorBg: 'rgba(220, 38, 38, 0.15)', errorText: '#b91c1c'
    }
  };
  return colors[theme] || colors.light;
};

const LoginPage = ({ onLogin }: { onLogin: (user: { id: string; username: string; email?: string }) => void }) => {
  // 使用setXxxx时，通过专用函数更新，React 知道要重新渲染界面
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [colors, setColors] = useState(getThemeColors());

  /*
  useEffect 就像一个"监听器"
  当某些条件满足时，自动执行里面的代码
  */
  useEffect(() => {
    setColors(getThemeColors());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();  // 阻止表单默认提交行为
    setError("");        // 清空错误信息
    setLoading(true);    // 显示加载状态

    try {
      if (mode === "register") {
        if (password.length < 6) {
          setError("密码至少6位");
          setLoading(false);
          return;
        }
        
        const existing = await db.users.where("username").equals(username).first();
        if (existing) {
          setError("用户名已存在");
          setLoading(false);
          return;
        }
        
        const bcrypt = await import("bcryptjs");
        const hash = await bcrypt.hash(password, 10);
        
        await db.users.add({
          id: crypto.randomUUID(),
          username,
          email: email || undefined,
          passwordHash: hash,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        
        alert("注册成功！请登录");
        setMode("login");
        setUsername("");
        setPassword("");
        setEmail("");
      } else {
        // 登录
        const user = await db.users.where("username").equals(username).first();
        if (!user) {
          setError("用户不存在");
          setLoading(false);
          return;
        }
        
        const bcrypt = await import("bcryptjs");
        const valid = await bcrypt.compare(password, user.passwordHash);
        
        if (!valid) {
          setError("密码错误");
          setLoading(false);
          return;
        }
        
        const token = {
          userId: user.id,
          token: crypto.randomUUID(),
          createdAt: Date.now(),
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        };
        
        localStorage.setItem("auth_token", JSON.stringify(token));
        
        onLogin({ id: user.id, username: user.username, email: user.email });
      }
    } catch (e: any) {
      setError(e.message || "操作失败");
    }
    
    setLoading(false);
  };

  const s = colors;

  return (
    <div style={{ 
      minHeight: "100vh", 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center",
      background: `linear-gradient(135deg, ${s.bgStart} 0%, ${s.bgEnd} 100%)`,
      fontFamily: "system-ui, -apple-system, sans-serif"
    }}>
      <div style={{ 
        background: s.cardBg, 
        padding: 40, 
        borderRadius: 16, 
        boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
        width: "100%",
        maxWidth: 400,
        border: `1px solid ${s.cardBorder}`
      }}>
        <h1 style={{ textAlign: "center", color: s.textPrimary, marginBottom: 8 }}>Writing Studio</h1>
        <p style={{ textAlign: "center", color: s.textSecondary, marginBottom: 32 }}>
          {mode === "login" ? "登录你的账号" : "创建新账号"}
        </p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", marginBottom: 4, color: s.textPrimary, fontSize: 14 }}>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: "100%", padding: 12, border: `1px solid ${s.inputBorder}`, borderRadius: 8, fontSize: 16, backgroundColor: s.inputBg, color: s.textPrimary }}
              required
            />
          </div>
          {mode === "register" && (
            <div>
              <label style={{ display: "block", marginBottom: 4, color: s.textPrimary, fontSize: 14 }}>邮箱 (可选)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: "100%", padding: 12, border: `1px solid ${s.inputBorder}`, borderRadius: 8, fontSize: 16, backgroundColor: s.inputBg, color: s.textPrimary }}
              />
            </div>
          )}
          <div>
            <label style={{ display: "block", marginBottom: 4, color: s.textPrimary, fontSize: 14 }}>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", padding: 12, border: `1px solid ${s.inputBorder}`, borderRadius: 8, fontSize: 16, backgroundColor: s.inputBg, color: s.textPrimary }}
              required
            />
          </div>
          {error && (
            <div style={{ color: s.errorText, fontSize: 14, padding: 12, background: s.errorBg, borderRadius: 8 }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: 14,
              background: s.buttonBg,
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 16,
              fontWeight: "bold",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? "处理中..." : (mode === "login" ? "登录" : "注册")}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: 24, color: s.textSecondary }}>
          {mode === "login" ? "没有账号？" : "已有账号？"}
          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            style={{ background: "none", border: "none", color: s.link, cursor: "pointer", marginLeft: 8, fontWeight: "bold" }}
          >
            {mode === "login" ? "立即注册" : "立即登录"}
          </button>
        </p>
      </div>
    </div>
  );
};

const Main = () => {
  // 使用 useUser hook 获取认证状态
  const { isAuthenticated, isLoading } = useUser();
  const [showApp, setShowApp] = useState(false);

  // 退出登录时重置 showApp，确保回到登录页
  useEffect(() => {
    if (!isAuthenticated) {
      setShowApp(false);
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return <div style={{ 
      minHeight: "100vh", 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center", 
      background: "#f5f5f5" 
    }}>加载中...</div>;
  }

  // 双重保障：UserContext 状态变更或 onSuccess 回调都会触发导航到主界面
  if (showApp || isAuthenticated) {
    return <App />;
  }

  return <AuthPage onSuccess={() => setShowApp(true)} />;
};

// AppWrapper 组件负责提供 UserProvider 上下文
const AppWrapper = () => {
  return (
    <UserProvider>
      <Main />
    </UserProvider>
  );
};

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("No root element");
const root = ReactDOM.createRoot(rootElement);
root.render(<React.StrictMode><AppWrapper /></React.StrictMode>);