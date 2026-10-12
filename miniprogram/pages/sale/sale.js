const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    products: [],
    filteredProducts: [],
    categories: [
      { key: 'all', name: '全部' },
      { key: '文创', name: '文创' },
      { key: '文具', name: '文具' },
      { key: '手作', name: '手作' },
      { key: '饰品', name: '饰品' },
      { key: '服饰', name: '服饰' },
      { key: '其他', name: '其他' }
    ],
    activeCategory: 'all',
    bannerImages: [
      { id: 1, image: '/images/logo/club-logo.png', text: '爱心义卖 · 为流浪猫献出一份爱' },
      { id: 2, image: '/images/logo/club-logo.png', text: '所有收入用于校园猫咪救助' }
    ],
    loading: true,
    API_BASE: app.globalData.API_BASE
  },

  onShow() {
    this.loadProducts();
  },

  loadProducts() {
    const preloaded = app.globalData.preloaded;
    if (preloaded && preloaded.products) {
      this.setData({ products: preloaded.products, loading: false });
      this.filterByCategory(this.data.activeCategory);
      // 后台刷新最新数据，但不删除 preloaded
      api.get('/api/products', {
        success: (res) => {
          let products = [];
          if (res.data && Array.isArray(res.data)) products = res.data;
          else if (res.data && res.data.products) products = res.data.products;
          preloaded.products = products;
          this.setData({ products });
          this.filterByCategory(this.data.activeCategory);
        }
      });
      return;
    }
    this.setData({ loading: true });
    api.get('/api/products', {
      success: (res) => {
        let products = [];
        if (res.data && Array.isArray(res.data)) {
          products = res.data;
        } else if (res.data && res.data.products) {
          products = res.data.products;
        }
        this.setData({ products, loading: false });
        this.filterByCategory(this.data.activeCategory);
      },
      fail: () => {
        this.setData({ loading: false });
        wx.showToast({ title: '网络出错了', icon: 'none' });
      }
    });
  },

  filterByCategory(categoryKey) {
    const products = this.data.products;
    let filtered = [];
    if (categoryKey === 'all') {
      filtered = products;
    } else {
      filtered = products.filter(p => p.category === categoryKey);
    }
    this.setData({ filteredProducts: filtered });
  },

  onCategoryTap(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ activeCategory: key });
    this.filterByCategory(key);
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/sale-detail/sale-detail?id=' + id });
  }
});
