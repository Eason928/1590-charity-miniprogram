const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    tasks: [],
    loading: true,
    user: null,
    hasLogin: false,
    appliedTaskIds: [],
    API_BASE: app.globalData.API_BASE
  },

  onShow() {
    const user = app.checkLogin();
    this.setData({ user, hasLogin: !!user });
    this.loadTasks();
  },

  onPullDownRefresh() {
    this.loadTasks(() => {
      wx.stopPullDownRefresh();
    });
  },

  loadTasks(callback) {
    const that = this;

    // 优先使用入场动画预加载的数据
    const preloaded = app.globalData.preloaded;
    if (preloaded && preloaded.tasks && !callback) {
      this.setData({ tasks: preloaded.tasks, loading: false });
      // 后台刷新最新数据
      api.get('/api/volunteer/tasks', {
        success(res) {
          let tasks = [];
          if (res.data && res.data.tasks) tasks = res.data.tasks;
          else if (Array.isArray(res.data)) tasks = res.data;
          preloaded.tasks = tasks;
          // 如果已登录，顺便加载报名记录
          const user = that.data.user || app.checkLogin();
          if (user) {
            api.get('/api/volunteer/my-applications', {
              success(ar) {
                const apps = (ar.data && ar.data.applications) || [];
                const appliedIds = apps.map(a => a.task_id);
                tasks.forEach(t => { t.applied = appliedIds.includes(t.id); });
                that.setData({ tasks, appliedTaskIds: appliedIds });
              }
            });
          } else {
            that.setData({ tasks });
          }
        }
      });
      return;
    }

    api.get('/api/volunteer/tasks', {
      success(res) {
        let tasks = [];
        if (res.data && res.data.tasks) {
          tasks = res.data.tasks;
        } else if (Array.isArray(res.data)) {
          tasks = res.data;
        }
        // 如果用户已登录，同时加载报名记录，标记已报名的任务
        const user = that.data.user || app.checkLogin();
        if (user) {
          api.get('/api/volunteer/my-applications', {
            success(ar) {
              const apps = (ar.data && ar.data.applications) || [];
              const appliedIds = apps.map(a => a.task_id);
              tasks.forEach(t => {
                t.applied = appliedIds.includes(t.id);
              });
              that.setData({ tasks, appliedTaskIds: appliedIds, loading: false });
              if (callback) callback();
            },
            fail() {
              that.setData({ tasks, loading: false });
              if (callback) callback();
            }
          });
        } else {
          that.setData({ tasks, loading: false });
          if (callback) callback();
        }
      },
      fail() {
        that.setData({ loading: false });
        wx.showToast({ title: '加载失败，请重试', icon: 'none' });
        if (callback) callback();
      }
    });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/volunteer-detail/volunteer-detail?id=' + id
    });
  },

  goMyVolunteer() {
    const user = app.checkLogin();
    if (!user) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/my-volunteer/my-volunteer'
    });
  }
});
