import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User } from '../db';
import { getUserById, migrateLegacyData } from '../db';
import { getToken, removeToken, type AuthToken, saveUserSession } from './token';

interface UserContextType {
  user: User | null;
  token: AuthToken | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (user: User, token: AuthToken) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType | null>(null);

/*
UserProvider = 一个全局用户状态的 “容器”
children = 放进这个容器里的所有组件
只有放进容器里的组件，才能拿到容器里的：用户信息、登录 / 登出方法
*/

// children = <UserProvider> 标签里的所有页面/组件
export const UserProvider = ({ children }: { children: ReactNode }) => {
  // const [状态变量, 更新函数] = useState<ts类型>(初始值);
  // React 的核心思想是：UI = f(state)（界面是状态的函数）
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<AuthToken | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /*
    概念	        说明	                   示例
    useState	    React 的状态管理钩子	    const [user, setUser] = useState(null)
    user	        当前状态值（只读）	      { id: 1, username: "张三" }
    setUser	      更新状态的函数（只写）	  setUser(newUser)
    状态更新效果	 触发组件重新渲染	        界面自动显示新用户信息

    当我调用 setUser() 时：
    1.React 更新内部状态：将 user 的值改为新值
    2.标记组件为"需要重新渲染"：所有使用了 user 或从 UserContext 获取数据的组件
    3.执行重新渲染：React 调用这些组件的函数，生成新的虚拟 DOM
    4.对比并更新真实 DOM：只更新变化的部分到界面上
  */

  // 应用启动时检查登录状态
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = getToken();
      if (storedToken) {
        const storedUser = await getUserById(storedToken.userId);
        if (storedUser) {
          setUser(storedUser);
          setToken(storedToken);
          // 等待迁移完成后再显示主界面（避免 Sidebar 加载时数据未归属）
          await migrateLegacyData(storedToken.userId);
        } else {
          removeToken();
        }
      }
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const login = async (loggedInUser: User, authToken: AuthToken) => {
    setUser(loggedInUser);
    setToken(authToken);
    saveUserSession(loggedInUser.id, loggedInUser.username);
    // 等待迁移完成，确保后续数据加载正确
    await migrateLegacyData(loggedInUser.id);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    removeToken();
  };

  const refreshUser = async () => {
    if (token) {
      const updatedUser = await getUserById(token.userId);
      if (updatedUser) {
        setUser(updatedUser);
      }
    }
  };

  return (
    <UserContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,  // 用户是否已认证（已登录）
        login,
        logout,
        refreshUser,
      }}
    >
      {children}   {/* Provider把数据传给children里面所有组件 */}
    </UserContext.Provider>
  );
};

export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
};

/*
详细过程揭秘：

1. 第一次渲染（初始状态）
typescript
// React 内部大致做了这件事：
function UserProvider() {
  // 第 1 次调用 useState
  const [isLoading, setIsLoading] = useState(true); 
  // isLoading = true (常量，不可变)
  
  return <Context.Provider value={{ isLoading, ... }}>...</Context.Provider>;
}
此时内存中：

isLoading 指向内存地址 A，值为 true
setIsLoading 是一个函数，指向内存地址 B


2. 当我调用 setIsLoading(false) 时

React 内部发生的事情：
① 标记更新
React 记录："UserProvider 组件的状态变了，需要重新渲染。"
② 调度重新渲染
React 不会修改原来的 isLoading 变量（因为它是 const）。

相反，React 会：

丢弃当前的 UserProvider 组件实例
创建一个新的 UserProvider 组件实例
再次执行 UserProvider() 函数
③ 第二次渲染（新状态）
typescript
// 新的组件实例，函数被重新执行
function UserProvider() {
  // 第 2 次调用 useState
  // React 识别出这是同一个状态槽位，返回新值
  const [isLoading, setIsLoading] = useState(true); 
  // ⚠️ 注意：虽然代码写的是 useState(true)
  // 但 React 内部会返回之前设置的值 false
  
  // 实际上 isLoading = false (新的常量)
  
  return <Context.Provider value={{ isLoading, ... }}>...</Context.Provider>;
}
此时内存中：

旧的 isLoading（值为 true）被垃圾回收
新的 isLoading 指向内存地址 C，值为 false
setIsLoading 也可能是一个新的函数引用（或相同的，取决于 React 优化）

*/