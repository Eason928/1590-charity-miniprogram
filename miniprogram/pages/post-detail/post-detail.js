const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    post: {},
    loading: true,
    previewUrls: [],
    user: null,
    isAuthor: false,
    API_BASE: app.globalData.API_BASE
  },

  onLoad(options) {
    const user = app.checkLogin();
    this.setData({ user });
    if (options.id) {
      this.loadPost(options.id);
    }
  },

  loadPost(postId) {
    api.get('/api/posts/post/' + postId, {
      success: (res) => {
        if (res.data && res.data.post) {
          const post = res.data.post;
          const isAuthor = this.data.user && post.user_id === this.data.user.id;
          this.setData({ post, isAuthor, loading: false });
          wx.setNavigationBarTitle({ title: post.title || '帖子详情' });
          this.prepareImages(post.images || []);
        } else {
          this.setData({ loading: false });
          wx.showToast({ title: '帖子不存在', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ loading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    });
  },

  prepareImages(images) {
    const urls = [];
    let done = 0;
    images.forEach((url, i) => {
      if (url.startsWith('data:')) {
        const fsm = wx.getFileSystemManager();
        const tempPath = wx.env.USER_DATA_PATH + '/post_img_' + i + '.jpg';
        const matches = url.match(/^data:image\/(\w+);base64,(.+)$/);
        if (matches && wx.base64ToArrayBuffer) {
          try {
            const buffer = wx.base64ToArrayBuffer(matches[2]);
            fsm.writeFileSync(tempPath, buffer, 'binary');
            urls[i] = tempPath;
          } catch(e) {
            urls[i] = url;
          }
        } else {
          urls[i] = url;
        }
      } else {
        urls[i] = url;
      }
      done++;
      if (done === images.length) {
        this.setData({ previewUrls: urls });
      }
    });
  },

  previewImage(e) {
    const idx = parseInt(e.currentTarget.dataset.index, 10);
    const urls = this.data.previewUrls.length > 0 ? this.data.previewUrls : this.data.post.images;
    wx.previewImage({
      current: urls[idx] || urls[0],
      urls: urls,
      showmenu: true
    });
  },

  deletePost() {
    const post = this.data.post;
    wx.showModal({
      title: '删除帖子',
      content: '确定删除这篇帖子？删除后不可恢复。',
      success: (res) => {
        if (res.confirm) {
          api.del('/api/posts/' + post.id, {
            success: () => {
              wx.showToast({ title: '已删除', icon: 'success' });
              setTimeout(() => { wx.navigateBack(); }, 1500);
            },
            fail: (err) => {
              wx.showToast({ title: '删除失败：' + (err.data?.error || '网络错误'), icon: 'none' });
            }
          });
        }
      }
    });
  },

  goVolunteerApply() {
    const vtId = this.data.post.volunteer_task_id;
    if (vtId) {
      wx.navigateTo({ url: '/pages/volunteer-detail/volunteer-detail?id=' + vtId });
    }
  }
});