const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    user: null,
    isDeveloper: false,
    // 提交表单
    feedbackContent: '',
    selectedTypeIndex: 0,
    typeOptions: ['建议', 'Bug', '其他'],
    // 我的反馈
    myFeedback: [],
    // 开发者：全部反馈
    allFeedback: [],
    filteredFeedback: [],
    filterType: 'all'
  },

  onShow() {
    const user = app.checkLogin();
    if (!user) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      wx.navigateBack();
      return;
    }
    this.setData({ user, isDeveloper: user.role === 'developer' });

    if (user.role === 'developer') {
      this.loadAllFeedback();
    } else {
      this.loadMyFeedback();
    }
  },

  // ===== 提交反馈 =====
  onTypeChange(e) {
    this.setData({ selectedTypeIndex: e.detail.value });
  },

  onContentInput(e) {
    const val = e.detail.value;
    if (val.length > 1000) return;
    this.setData({ feedbackContent: val });
  },

  submitFeedback() {
    const content = this.data.feedbackContent.trim();
    if (!content) {
      wx.showToast({ title: '请填写反馈内容', icon: 'none' });
      return;
    }
    const typeMap = ['suggestion', 'bug', 'other'];
    const type = typeMap[this.data.selectedTypeIndex];

    wx.showLoading({ title: '提交中...' });
    api.post('/api/feedback', { content, type }, {
      success: (res) => {
        wx.hideLoading();
        if (res.data && res.data.error) {
          wx.showToast({ title: res.data.error, icon: 'none' });
          return;
        }
        wx.showToast({ title: '反馈已提交，谢谢！', icon: 'success' });
        this.setData({ feedbackContent: '', selectedTypeIndex: 0 });
        this.loadMyFeedback();
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '提交失败', icon: 'none' });
      }
    });
  },

  // ===== 我的反馈 =====
  loadMyFeedback() {
    api.get('/api/feedback/my', {
      success: (res) => {
        if (res.data && res.data.feedback) {
          this.setData({ myFeedback: res.data.feedback });
        }
      }
    });
  },

  // ===== 开发者：全部反馈 =====
  loadAllFeedback() {
    api.get('/api/feedback', {
      success: (res) => {
        if (res.data && res.data.feedback) {
          this.setData({ allFeedback: res.data.feedback });
          this.applyFilter();
        }
      }
    });
  },

  setFilter(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ filterType: type });
    this.applyFilter();
  },

  applyFilter() {
    const type = this.data.filterType;
    let filtered = this.data.allFeedback;
    if (type === 'pending') {
      filtered = filtered.filter(fb => fb.status === 'pending');
    } else if (type === 'resolved') {
      filtered = filtered.filter(fb => fb.status === 'resolved');
    }
    this.setData({ filteredFeedback: filtered });
  },

  markResolved(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '标记已处理',
      content: '确认将此反馈标记为已处理？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          api.put('/api/feedback/' + id + '/resolve', {}, {
            success: (r) => {
              wx.hideLoading();
              wx.showToast({ title: '已标记为已处理', icon: 'success' });
              this.loadAllFeedback();
            },
            fail: () => {
              wx.hideLoading();
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          });
        }
      }
    });
  }
});
