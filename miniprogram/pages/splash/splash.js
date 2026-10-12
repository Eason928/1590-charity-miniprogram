const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    logoUrl: '/images/logo/entrance-logo.png',
    logoAnim: 'init',
    textVisible: false,
    typedName: '',
    showCursor: false,
    showSubtitle: false,
    showVersion: false,
    loadStatus: { cats: false, posts: false, products: false, tasks: false }
  },

  onLoad() {
    // 动画期间预加载所有首页数据
    this.preloadData();
  },

  preloadData() {
    const preloaded = {};

    // 猫咪数据
    api.get('/api/cats', {
      success: (res) => {
        if (res.data && res.data.cats) {
          preloaded.cats = res.data.cats;
          this.setData({ 'loadStatus.cats': true });
        }
      },
      fail: () => { this.setData({ 'loadStatus.cats': true }); }
    });

    // 论坛帖子
    api.get('/api/posts', {
      success: (res) => {
        if (res.data && res.data.posts) {
          preloaded.posts = res.data.posts;
          this.setData({ 'loadStatus.posts': true });
        }
      },
      fail: () => { this.setData({ 'loadStatus.posts': true }); }
    });

    // 义卖商品
    api.get('/api/products', {
      success: (res) => {
        let products = [];
        if (res.data && Array.isArray(res.data)) products = res.data;
        else if (res.data && res.data.products) products = res.data.products;
        preloaded.products = products;
        this.setData({ 'loadStatus.products': true });
      },
      fail: () => { this.setData({ 'loadStatus.products': true }); }
    });

    // 志愿任务
    api.get('/api/volunteer/tasks', {
      success: (res) => {
        let tasks = [];
        if (res.data && res.data.tasks) tasks = res.data.tasks;
        else if (Array.isArray(res.data)) tasks = res.data;
        preloaded.tasks = tasks;
        this.setData({ 'loadStatus.tasks': true });
      },
      fail: () => { this.setData({ 'loadStatus.tasks': true }); }
    });

    // 存入全局，各页面可读取但不删除
    app.globalData.preloaded = preloaded;
  },

  onReady() {
    this.setData({ logoAnim: 'bounce' });

    setTimeout(() => {
      this.setData({ logoAnim: 'slide', textVisible: true });

      setTimeout(() => {
        this.startTyping();
      }, 500);
    }, 1000);
  },

  startTyping() {
    const name = '1590公益社';
    let i = 0;

    this.setData({ showCursor: true });

    const timer = setInterval(() => {
      if (i < name.length) {
        this.setData({ typedName: name.slice(0, i + 1) });
        i++;
      } else {
        clearInterval(timer);

        setTimeout(() => {
          this.setData({ showCursor: false, showSubtitle: true });

          setTimeout(() => {
            this.setData({ showVersion: true });

            // 动画结束前检查预加载是否完成，最多等2s
            let waitCount = 0;
            const checkLoaded = () => {
              const done = this.data.loadStatus.cats && this.data.loadStatus.posts;
              if (done || waitCount >= 10) {
                // 加载完成或超时，都跳转
                setTimeout(() => {
                  wx.switchTab({ url: '/pages/forum/forum' });
                }, 400);
              } else {
                waitCount++;
                setTimeout(checkLoaded, 200);
              }
            };
            checkLoaded();
          }, 300);
        }, 400);
      }
    }, 120);
  }
});
