const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    cats: [],
    allCats: [],
    loading: true,
    currentStatus: '全部'
  },

  onLoad() {
    this.loadCats();
  },

  onShow() {
    this.loadCats();
  },

  loadCats() {
    // 优先使用入场动画预加载的数据
    const preloaded = app.globalData.preloaded;
    if (preloaded && preloaded.cats) {
      this.setData({ allCats: preloaded.cats, loading: false });
      this.applyFilter();
      // 后台刷新最新数据，但不删除 preloaded
      api.get('/api/cats', {
        success: (res) => {
          if (res.data && res.data.cats) {
            preloaded.cats = res.data.cats;
            this.setData({ allCats: res.data.cats });
          }
        }
      });
      return;
    }
    api.get('/api/cats', {
      success: (res) => {
        if (res.data && res.data.cats) {
          this.setData({ allCats: res.data.cats, loading: false });
          this.applyFilter();
        }
      },
      fail: () => {
        const catsData = require('../../data/cats.js');
        this.setData({ cats: catsData, allCats: catsData, loading: false });
      }
    });
  },

  filterByStatus(e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ currentStatus: status });
    this.applyFilter();
  },

  applyFilter() {
    const status = this.data.currentStatus;
    if (status === '全部') {
      this.setData({ cats: this.data.allCats });
    } else {
      const filtered = this.data.allCats.filter(c => c.status === status);
      this.setData({ cats: filtered });
    }
  },

  onSearch(e) {
    const keyword = e.detail.value.trim().toLowerCase();
    if (!keyword) {
      this.applyFilter();
      return;
    }
    const base = this.data.currentStatus === '全部' ? this.data.allCats : this.data.allCats.filter(c => c.status === this.data.currentStatus);
    const filtered = base.filter(cat => cat.name.toLowerCase().includes(keyword));
    this.setData({ cats: filtered });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    });
  }
});
