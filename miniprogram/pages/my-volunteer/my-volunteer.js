const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    applications: [],
    loading: true,
    user: null,
    API_BASE: app.globalData.API_BASE
  },

  onShow() {
    const user = app.checkLogin();
    if (user) {
      this.setData({ user });
      this.loadApplications();
    } else {
      this.setData({ user: null, loading: false });
    }
  },

  onPullDownRefresh() {
    if (this.data.user) {
      this.loadApplications(() => {
        wx.stopPullDownRefresh();
      });
    } else {
      wx.stopPullDownRefresh();
    }
  },

  loadApplications(callback) {
    const that = this;
    api.get('/api/volunteer/my-applications', {
      success(res) {
        if (res.data && res.data.applications) {
          that.setData({ applications: res.data.applications, loading: false });
        } else if (Array.isArray(res.data)) {
          that.setData({ applications: res.data, loading: false });
        } else {
          that.setData({ applications: [], loading: false });
        }
        if (callback) callback();
      },
      fail() {
        that.setData({ loading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
        if (callback) callback();
      }
    });
  },

  goLogin() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  goVolunteer() {
    wx.navigateTo({ url: '/pages/volunteer/volunteer' });
  }
});
