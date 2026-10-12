const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    cat: null,
    posts: [],
    API_BASE: app.globalData.API_BASE
  },

  onLoad(options) {
    this.loadCat(options.id);
  },

  loadCat(catId) {
    api.get('/api/cats/' + catId, {
      success: (res) => {
        if (res.data && res.data.cat) {
          const cat = res.data.cat;
          if (cat.locations && typeof cat.locations === 'string') {
            cat.locations = cat.locations.split(',');
          }
          this.setData({ cat });
          wx.setNavigationBarTitle({ title: cat.name });
          this.loadPosts(catId);
        }
      },
      fail: () => {
        const catsData = require('../../data/cats.js');
        const cat = catsData.find(c => c.id === 'cat_00' + catId);
        if (cat) {
          this.setData({ cat });
          wx.setNavigationBarTitle({ title: cat.name });
        }
      }
    });
  },

  loadPosts(catId) {
    api.get('/api/posts?cat_id=' + catId, {
      success: (res) => {
        if (res.data && res.data.posts) {
          this.setData({ posts: res.data.posts });
        }
      }
    });
  }
});
