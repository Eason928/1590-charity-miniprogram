const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    task: {},
    loading: true,
    user: null,
    canApply: false,
    applied: false,
    contact: '',
    remark: '',
    submitting: false,
    taskId: null,
    API_BASE: app.globalData.API_BASE
  },

  onLoad(options) {
    const user = app.checkLogin();
    // 学生(user)和管理员(admin)可以报名
    const canApply = user && (user.role === 'user' || user.role === 'admin');
    this.setData({
      user,
      canApply,
      taskId: options.id
    });
    this.loadDetail(options.id);
  },

  loadDetail(id) {
    const that = this;
    api.get('/api/volunteer/tasks/' + id, {
      success(res) {
        if (res.data && res.data.task) {
          that.setData({ task: res.data.task, loading: false });
          that.checkApplied(id);
        } else {
          that.setData({ loading: false });
          wx.showToast({ title: '任务不存在', icon: 'none' });
        }
      },
      fail() {
        that.setData({ loading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    });
  },

  checkApplied(taskId) {
    const that = this;
    const user = app.globalData.user;
    if (!user) return;

    api.get('/api/volunteer/my-applications', {
      success(res) {
        let apps = [];
        if (res.data && res.data.applications) {
          apps = res.data.applications;
        }
        const found = apps.find(a => String(a.task_id) === String(taskId));
        if (found) {
          that.setData({ applied: true });
        }
      }
    });
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  doApply() {
    const contact = this.data.contact.trim();
    if (!contact) {
      wx.showToast({ title: '请填写联系方式', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    api.post('/api/volunteer/apply', {
      task_id: this.data.taskId,
      contact_info: contact,
      note: this.data.remark.trim()
    }, {
      success: (res) => {
        this.setData({ submitting: false });
        if (res.data && (res.data.message || res.data.id)) {
          this.setData({ applied: true });
          wx.showToast({ title: '报名成功，等待通过', icon: 'none' });
        } else {
          wx.showToast({ title: res.data.error || '报名失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ submitting: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  goLogin() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  // ===== 分享到微信好友 =====
  onShareAppMessage() {
    const task = this.data.task;
    return {
      title: task.title || '志愿活动',
      path: '/pages/volunteer-detail/volunteer-detail?id=' + this.data.taskId,
      imageUrl: '',
      desc: task.description || '志愿活动详情'
    };
  }
});
