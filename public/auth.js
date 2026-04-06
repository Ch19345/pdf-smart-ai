// public/auth.js
// 前端登录逻辑

class AuthManager {
  constructor() {
    this.user = null;
    this.init();
  }

  async init() {
    // Check if we're on the callback page with OAuth params
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    
    // Handle OAuth errors
    if (error) {
      console.error('OAuth error:', error);
      alert('登录失败: ' + error);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    await this.checkAuth();
    this.updateUI();
  }

  // 检查是否已登录
  async checkAuth() {
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();
      this.user = data.loggedIn ? data.user : null;
    } catch (error) {
      console.error('Auth check failed:', error);
      this.user = null;
    }
  }

  // 发起 Google 登录
  async login() {
    try {
      const response = await fetch('/api/auth/login');
      const data = await response.json();
      
      if (data.url) {
        // 跳转到 Google 登录页
        window.location.href = data.url;
      } else {
        console.error('Login response missing URL:', data);
        alert('登录初始化失败，请重试');
      }
    } catch (error) {
      console.error('Login failed:', error);
      alert('登录失败，请重试');
    }
  }

  // 退出登录
  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      this.user = null;
      this.updateUI();
      window.location.reload();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  // 更新 UI
  updateUI() {
    const loginBtn = document.getElementById('loginBtn');
    const userInfo = document.getElementById('userInfo');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');

    if (this.user) {
      // 已登录状态
      if (loginBtn) loginBtn.classList.add('hidden');
      if (userInfo) {
        userInfo.classList.remove('hidden');
        if (userAvatar) userAvatar.src = this.user.picture || '';
        if (userName) userName.textContent = this.user.name || this.user.email || 'User';
      }
      console.log('User logged in:', this.user);
    } else {
      // 未登录状态
      if (loginBtn) loginBtn.classList.remove('hidden');
      if (userInfo) userInfo.classList.add('hidden');
    }
  }

  getUser() {
    return this.user;
  }

  isLoggedIn() {
    return !!this.user;
  }
}

// 初始化
const auth = new AuthManager();

// 导出供全局使用
window.auth = auth;
