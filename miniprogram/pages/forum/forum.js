/* 1590 Charity Club Mini Program · (c) 2026 Eason Yuan (@Eason928) · https://github.com/Eason928/1590-charity-miniprogram */

const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    posts: [],
    spotlightPosts: [],
    tasks: [],
    loading: true,
    user: null,
    API_BASE: app.globalData.API_BASE,
    bannerImages: []
  },

  onShow() {
    const user = app.checkLogin();
    this.setData({ user });
    this.loadPosts();
  },

  loadPosts() {
    const preloaded = app.globalData.preloaded;
    if (preloaded && preloaded.posts) {
      this.processPosts(preloaded.posts);
      // 后台刷新最新数据，但不删除 preloaded（其他页面可能还需要）
      api.get('/api/posts', {
        success: (res) => {
          if (res.data && res.data.posts) {
            preloaded.posts = res.data.posts;
            this.processPosts(res.data.posts);
          }
        }
      });
      return;
    }
    api.get('/api/posts', {
      success: (res) => {
        if (res.data && res.data.posts) {
          this.processPosts(res.data.posts);
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

  // 分离动态顶部帖子和平常帖子
  processPosts(posts) {
    const spotlightPosts = posts.filter(p => p.is_spotlight);
    // 志愿通知帖子留在动态列表，其他 spotlight 帖子仅在横幅
    const regularPosts = posts.filter(p => !p.is_spotlight || p.volunteer_task_id);
    // 将动态顶部帖子注入轮播横幅
    const bannerImages = [];
    // 先放社团默认轮播图
    if (spotlightPosts.length === 0) {
      bannerImages.push(
        { id: 1, image: '/images/logo/club-logo.png', text: '1590公益社 · 用爱记录每一只喵' },
        { id: 2, image: '/images/logo/club-logo.png', text: '参与志愿活动，为校园猫咪出一份力' },
        { id: 3, image: '/images/logo/club-logo.png', text: '爱心义卖 · 所有收入用于猫咪救助' }
      );
    } else {
      // 有动态顶部帖子时，用帖子的第一张图作为轮播背景
      spotlightPosts.forEach(p => {
        const img = (p.images && p.images[0]) || '/images/logo/club-logo.png';
        bannerImages.push({
          id: 'spotlight_' + p.id,
          image: img,
          text: p.title || p.text || '动态顶部',
          postId: p.id,
          isSpotlight: true,
          volunteerTaskId: p.volunteer_task_id || null
        });
      });
    }
    this.setData({ spotlightPosts, posts: regularPosts, bannerImages, loading: false });
  },

  goPost() {
    const user = app.checkLogin();
    if (user) {
      wx.navigateTo({ url: '/pages/post/post' });
    } else {
      wx.showModal({
        title: '需要登录',
        content: '请先在「我的」页面登录后再发帖',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/profile/profile' });
          }
        }
      });
    }
  },

  goVolunteer() {
    wx.navigateTo({ url: '/pages/volunteer/volunteer' });
  },

  goSale() {
    wx.switchTab({ url: '/pages/sale/sale' });
  },

  goPostDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/post-detail/post-detail?id=' + id });
  },

  // 轮播点击：动态顶部帖子跳详情，志愿任务帖子跳报名页，其他不处理
  onBannerTap(e) {
    const ds = e.currentTarget.dataset;
    const id = ds.id;
    const isSpotlight = ds.spotlight === 'true' || ds.spotlight === true;
    const vtId = ds.volunteertaskid;
    if (vtId) {
      // 志愿任务帖子 → 跳转到报名页
      wx.navigateTo({ url: '/pages/volunteer-detail/volunteer-detail?id=' + vtId });
    } else if (id && isSpotlight) {
      wx.navigateTo({ url: '/pages/post-detail/post-detail?id=' + id });
    }
  }
});
