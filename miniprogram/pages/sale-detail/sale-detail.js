const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    product: null,
    loading: true,
    API_BASE: app.globalData.API_BASE
  },

  onLoad(options) {
    if (options.id) {
      this.loadProduct(options.id);
    }
  },

  loadProduct(productId) {
    this.setData({ loading: true });
    api.get('/api/products/' + productId, {
      success: (res) => {
        let product = null;
        if (res.data && res.data.product) {
          product = res.data.product;
        } else if (res.data && res.data.id) {
          product = res.data;
        }
        if (product) {
          this.setData({ product, loading: false });
          wx.setNavigationBarTitle({ title: product.name || '商品详情' });
        } else {
          this.setData({ loading: false });
        }
      },
      fail: () => {
        this.setData({ loading: false });
        wx.showToast({ title: '网络出错了', icon: 'none' });
      }
    });
  },

  goBack() {
    wx.navigateBack();
  }
});
