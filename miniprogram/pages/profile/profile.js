const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    user: null,
    showPwdLogin: false,
    showPwd: false,
    loginUsername: '',
    loginPassword: '',
    // 学号验证
    showStudentVerify: false,
    verifyStudentId: '',
    verifyPassword: '',
    // 强制改密
    showResetPwd: false,
    resetPwd: '',
    resetConfirmPwd: '',
    resetShow: false,
    // 中间状态
    pendingOpenid: '',
    // 帖子
    posts: [],
    stats: { total: 0, approved: 0, pending: 0, rejected: 0 },
    postsCollapsed: false,
    pending: { pendingPosts: 0, pendingUsers: 0, adminApplications: 0, pendingVolunteerApps: 0 },
    pendingTotal: 0,
    API_BASE: app.globalData.API_BASE,
    // 编辑帖子
    showEditModal: false,
    editPostId: null,
    editForm: { title: '', text: '', is_spotlight: false, is_pinned: false, pinDate: '', pinTime: '' },
    // 学生快捷登录
    quickStudentId: '',
    quickStudentPwd: '',
    quickShowPwd: false
  },

  onShow() {
    const user = app.checkLogin();
    if (user) {
      this.setData({ user, showPwdLogin: false, showStudentVerify: false, showResetPwd: false });
      this.loadMyPosts();
      if (user.role === 'admin' || user.role === 'developer' || user.role === 'rongdada') {
        this.loadPendingSummary();
      }
    }
  },

  // ===== 微信登录 =====
  doWxLogin(e) {
    if (e.detail && e.detail.errMsg && e.detail.errMsg.indexOf('fail') !== -1) {
      // 用户拒绝授权，改用 code 方式登录
    }
    wx.showLoading({ title: '微信登录中...' });
    wx.login({
      success: (res) => {
        if (res.code) {
          api.post('/api/wx-login', { code: res.code }, {
            success: (r) => {
              wx.hideLoading();
              const data = r.data;
              if (!data) { wx.showToast({ title: '登录失败', icon: 'none' }); return; }

              // 需要学号验证（首次登录）
              if (data.needStudentVerify) {
                this.setData({ showStudentVerify: true, pendingOpenid: data.openid });
                return;
              }

              // 需要强制改密（openid 已绑定但未重置密码）
              if (data.needPasswordReset) {
                this.setData({ showResetPwd: true, pendingOpenid: data.openid });
                return;
              }

              // 正常登录
              if (data.token) {
                app.globalData.token = data.token;
                app.globalData.user = data.user;
                wx.setStorageSync('token', data.token);
                wx.setStorageSync('user', data.user);
                this.setData({ user: data.user, showPwdLogin: false, showStudentVerify: false, showResetPwd: false });
                this.loadMyPosts();
                wx.showToast({ title: '登录成功', icon: 'success' });
              } else {
                wx.showToast({ title: data.error || '登录失败', icon: 'none' });
              }
            },
            fail: () => {
              wx.hideLoading();
              wx.showToast({ title: '网络错误', icon: 'none' });
            }
          });
        } else {
          wx.hideLoading();
          wx.showToast({ title: '微信登录失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '微信登录失败', icon: 'none' });
      }
    });
  },

  // ===== 学号验证 =====
  onVerifyStudentId(e) { this.setData({ verifyStudentId: e.detail.value }); },
  onVerifyPassword(e) { this.setData({ verifyPassword: e.detail.value }); },
  cancelVerify() { this.setData({ showStudentVerify: false, verifyStudentId: '', verifyPassword: '' }); },

  doStudentVerify() {
    const studentId = this.data.verifyStudentId.trim();
    const password = this.data.verifyPassword;
    if (!studentId || !password) {
      wx.showToast({ title: '请输入学号和密码', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '验证中...' });
    api.post('/api/student-verify', {
      studentId,
      password,
      openid: this.data.pendingOpenid
    }, {
      success: (r) => {
        wx.hideLoading();
        const data = r.data;
        if (!data) { wx.showToast({ title: '验证失败', icon: 'none' }); return; }
        if (data.error) { wx.showToast({ title: data.error, icon: 'none' }); return; }

        // 保存 token 和用户信息
        if (data.token) {
          app.globalData.token = data.token;
          app.globalData.user = data.user;
          wx.setStorageSync('token', data.token);
          wx.setStorageSync('user', data.user);
        }

        // 需要强制改密
        if (data.passwordResetRequired) {
          this.setData({
            showStudentVerify: false,
            showResetPwd: true,
            verifyStudentId: '',
            verifyPassword: ''
          });
          wx.showToast({ title: '首次登录，请设置新密码', icon: 'none' });
          return;
        }

        // 正常登录
        this.setData({
          user: data.user,
          showStudentVerify: false,
          showResetPwd: false,
          verifyStudentId: '',
          verifyPassword: ''
        });
        this.loadMyPosts();
        wx.showToast({ title: '登录成功', icon: 'success' });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // ===== 强制改密 =====
  onResetPwd(e) { this.setData({ resetPwd: e.detail.value }); },
  onResetConfirmPwd(e) { this.setData({ resetConfirmPwd: e.detail.value }); },
  toggleResetPwd() { this.setData({ resetShow: !this.data.resetShow }); },
  cancelResetPwd() { this.setData({ showResetPwd: false, resetPwd: '', resetConfirmPwd: '' }); },

  doResetPassword() {
    const password = this.data.resetPwd;
    const confirmPassword = this.data.resetConfirmPwd;
    if (!password || password.length < 6) {
      wx.showToast({ title: '密码至少6个字符', icon: 'none' });
      return;
    }
    if (password !== confirmPassword) {
      wx.showToast({ title: '两次密码不一致', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '设置中...' });
    api.post('/api/reset-password', { password, confirmPassword }, {
      success: (r) => {
        wx.hideLoading();
        const data = r.data;
        if (!data) { wx.showToast({ title: '设置失败', icon: 'none' }); return; }
        if (data.error) { wx.showToast({ title: data.error, icon: 'none' }); return; }

        // 更新 token 和用户信息
        if (data.token) {
          app.globalData.token = data.token;
          app.globalData.user = data.user;
          wx.setStorageSync('token', data.token);
          wx.setStorageSync('user', data.user);
        }

        this.setData({
          user: data.user,
          showResetPwd: false,
          showStudentVerify: false,
          resetPwd: '',
          resetConfirmPwd: ''
        });
        this.loadMyPosts();
        wx.showToast({ title: '密码已设置，欢迎！', icon: 'success' });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // ===== 切换显示密码登录 =====
  togglePwdLogin() {
    this.setData({ showPwdLogin: !this.data.showPwdLogin });
  },

  loadMyPosts() {
    api.get('/api/my/posts', {
      success: (res) => {
        if (res.data) this.setData({ posts: res.data.posts || [], stats: res.data.stats || {} });
      }
    });
  },

  onLoginUsername(e) { this.setData({ loginUsername: e.detail.value }); },
  onLoginPassword(e) { this.setData({ loginPassword: e.detail.value }); },
  toggleLoginPwd() { this.setData({ showPwd: !this.data.showPwd }); },

  doLogin() {
    const username = this.data.loginUsername.trim();
    const password = this.data.loginPassword;
    if (!username || !password) { wx.showToast({ title: '请输入用户名和密码', icon: 'none' }); return; }
    wx.showLoading({ title: '登录中...' });
    api.post('/api/login', { username, password }, {
      success: (res) => {
        wx.hideLoading();
        if (res.data && res.data.token) {
          app.globalData.token = res.data.token;
          app.globalData.user = res.data.user;
          wx.setStorageSync('token', res.data.token);
          wx.setStorageSync('user', res.data.user);
          this.setData({ user: res.data.user, loginUsername: '', loginPassword: '', showPwdLogin: false });
          this.loadMyPosts();
          wx.showToast({ title: '登录成功', icon: 'success' });
        } else {
          wx.showToast({ title: res.data.error || '登录失败', icon: 'none' });
        }
      },
      fail: () => { wx.hideLoading(); wx.showToast({ title: '网络错误', icon: 'none' }); }
    });
  },

  goAdmin(e) {
    const tab = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab ? e.currentTarget.dataset.tab : '';
    const url = tab ? '/pages/admin/admin?tab=' + tab : '/pages/admin/admin';
    wx.navigateTo({ url });
  },

  goFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  },

  // ===== 学生快捷登录（测试用） =====
  onQuickStudentId(e) { this.setData({ quickStudentId: e.detail.value }); },
  onQuickStudentPwd(e) { this.setData({ quickStudentPwd: e.detail.value }); },
  toggleQuickPwd() { this.setData({ quickShowPwd: !this.data.quickShowPwd }); },

  doStudentDirectLogin() {
    const studentId = this.data.quickStudentId.trim();
    const password = this.data.quickStudentPwd;
    if (!studentId || !password) {
      wx.showToast({ title: '请输入学号和密码', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '登录中...' });
    api.post('/api/student-direct-login', { studentId, password }, {
      success: (res) => {
        wx.hideLoading();
        if (res.data && res.data.token) {
          const app = getApp();
          app.globalData.token = res.data.token;
          app.globalData.user = res.data.user;
          wx.setStorageSync('token', res.data.token);
          wx.setStorageSync('user', res.data.user);
          this.setData({
            user: res.data.user,
            quickStudentId: '', quickStudentPwd: '',
            showPwdLogin: false
          });
          this.loadMyPosts();
          wx.showToast({ title: '登录成功', icon: 'success' });
        } else {
          wx.showToast({ title: res.data.error || '登录失败', icon: 'none' });
        }
      },
      fail: () => { wx.hideLoading(); wx.showToast({ title: '网络错误', icon: 'none' }); }
    });
  },

  loadPendingSummary() {
    api.get('/api/pending-summary', {
      success: (res) => {
        if (res.data) {
          const p = res.data;
          const total = p.pendingPosts + p.pendingUsers + p.adminApplications + p.pendingVolunteerApps;
          this.setData({ pending: p, pendingTotal: total });
        }
      }
    });
  },

  togglePosts() {
    this.setData({ postsCollapsed: !this.data.postsCollapsed });
  },

  applyAdmin() {
    wx.showModal({
      title: '申请成为管理员',
      content: '提交申请后，现有管理员会收到通知。通过后你将获得审核内容、管理猫咪等权限。',
      success: (res) => {
        if (res.confirm) {
          api.post('/api/apply-admin', {}, {
            success: (r) => {
              wx.showToast({ title: r.data.message || '申请已提交', icon: 'success' });
            },
            fail: () => { wx.showToast({ title: '提交失败', icon: 'none' }); }
          });
        }
      }
    });
  },

  doLogout() {
    wx.showModal({
      title: '退出登录', content: '确定退出吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('token');
          wx.removeStorageSync('user');
          app.globalData.token = '';
          app.globalData.user = null;
          this.setData({ user: null, posts: [], stats: { total: 0, approved: 0, pending: 0, rejected: 0 } });
          wx.showToast({ title: '已退出', icon: 'success' });
        }
      }
    });
  },

  // 删除自己的帖子
  deletePost(e) {
    const id = e.currentTarget.dataset.id;
    const posts = this.data.posts;
    wx.showModal({
      title: '删除帖子',
      content: '确定删除这篇帖子？删除后不可恢复。',
      success: (res) => {
        if (res.confirm) {
          api.del('/api/posts/' + id, {
            success: () => {
              wx.showToast({ title: '已删除', icon: 'success' });
              this.setData({ posts: posts.filter(p => p.id !== id) });
              const stats = this.data.stats;
              stats.total--;
              this.setData({ stats });
            },
            fail: (err) => {
              wx.showToast({ title: '删除失败：' + (err.data?.error || '网络错误'), icon: 'none' });
            }
          });
        }
      }
    });
  },

  // ===== 编辑帖子（荣大大/开发者） =====
  editPost(e) {
    const id = Number(e.currentTarget.dataset.id);
    const posts = this.data.posts;
    const post = posts.find(p => p.id === id);
    if (!post) return;
    let pinDate = '', pinTime = '';
    if (post.pinned_until) {
      const parts = post.pinned_until.split(' ');
      pinDate = parts[0] || '';
      pinTime = parts[1] ? parts[1].slice(0, 5) : '';
    }
    this.setData({
      showEditModal: true,
      editPostId: id,
      editForm: {
        title: post.title || '',
        text: post.text || '',
        is_spotlight: !!post.is_spotlight,
        is_pinned: !!post.is_pinned,
        pinDate: pinDate,
        pinTime: pinTime
      }
    });
  },

  onEditInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['editForm.' + field]: e.detail.value });
  },

  onEditSwitch(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['editForm.' + field]: e.detail.value });
    if (field === 'is_pinned' && e.detail.value && !this.data.editForm.pinDate) {
      const future = new Date();
      future.setDate(future.getDate() + 7);
      this.setData({
        'editForm.pinDate': future.toISOString().slice(0, 10),
        'editForm.pinTime': '23:59'
      });
    }
  },

  onEditPinDateChange(e) { this.setData({ 'editForm.pinDate': e.detail.value }); },
  onEditPinTimeChange(e) { this.setData({ 'editForm.pinTime': e.detail.value }); },

  closeEdit() { this.setData({ showEditModal: false, editPostId: null }); },
  preventClose() {},

  saveEdit() {
    const f = this.data.editForm;
    const id = this.data.editPostId;
    if (!id) return;
    wx.showLoading({ title: '保存中...' });
    const body = {
      title: f.title, text: f.text,
      is_spotlight: f.is_spotlight ? 1 : 0,
      is_pinned: f.is_pinned ? 1 : 0
    };
    if (f.is_pinned && f.pinDate) {
      body.pinned_until = f.pinDate + ' ' + (f.pinTime || '23:59') + ':00';
    } else if (f.is_pinned === false) {
      body.pinned_until = null;
    }
    api.put('/api/posts/' + id, body, {
      success: (res) => {
        wx.hideLoading();
        if (res.data && res.data.message) {
          wx.showToast({ title: '已保存', icon: 'success' });
          this.setData({ showEditModal: false, editPostId: null });
          this.loadMyPosts();
        } else {
          wx.showToast({ title: res.data.error || '保存失败', icon: 'none' });
        }
      },
      fail: () => { wx.hideLoading(); wx.showToast({ title: '网络错误', icon: 'none' }); }
    });
  }
});
