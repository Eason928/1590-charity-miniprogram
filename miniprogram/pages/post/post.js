const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    cats: [],
    catNames: [],
    selectedCat: '',
    selectedCatId: null,
    catIndex: 0,
    title: '',
    imagePaths: [],
    imageBase64s: [],
    text: '',
    isPinned: false,
    isSpotlight: false,
    pinDate: '',
    pinTime: '',
    category: '',
    categoryIndex: 0,
    categoryList: ['日常分享帖', '猫猫帖'],
    // 活动记录收支
    incomeAmount: '',
    expenseAmount: '',
    user: null,
    isManager: false,
    isAdmin: false,
    isRongdada: false
  },

  onLoad() {
    const user = app.checkLogin();
    const isManager = user && (user.role === 'rongdada' || user.role === 'developer');
    const isAdmin = user && (user.role === 'admin');
    const isRongdada = user && (user.role === 'rongdada');
    const role = user ? user.role : '';
    let catList = ['日常分享帖', '猫猫帖'];
    if (role === 'rongdada') catList = ['日常分享帖', '猫猫帖', '公告帖子', '活动记录帖'];
    if (role === 'developer') catList = ['日常分享帖', '猫猫帖', '公告帖子', '活动记录帖', '开发者公告'];
    this.setData({ user, isManager, isAdmin, isRongdada, categoryList: catList, category: catList[0] });
    this.loadCats();
  },

  loadCats() {
    api.get('/api/cats', {
      success: (res) => {
        if (res.data && res.data.cats) {
          const cats = res.data.cats;
          const catNames = ['不关联猫咪', ...cats.map(c => c.name)];
          this.setData({ cats, catNames });
        }
      }
    });
  },

  onCatChange(e) {
    const idx = parseInt(e.detail.value, 10);
    if (idx === 0) {
      this.setData({ catIndex: 0, selectedCat: '', selectedCatId: null });
    } else {
      const cat = this.data.cats[idx - 1];
      this.setData({
        catIndex: idx,
        selectedCat: cat.name,
        selectedCatId: cat.id
      });
    }
  },

  chooseImage() {
    wx.chooseImage({
      count: 9,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({ imagePaths: res.tempFilePaths });
        // 先压缩再转 base64
        this.compressAndConvert(res.tempFilePaths);
      }
    });
  },

  compressAndConvert(paths) {
    const compressedPaths = [];
    let done = 0;
    paths.forEach((path, i) => {
      wx.compressImage({
        src: path,
        quality: 70,
        success: (res) => {
          compressedPaths[i] = res.tempFilePath;
          done++;
          if (done === paths.length) {
            this.convertToBase64(compressedPaths);
          }
        },
        fail: () => {
          // 压缩失败用原图
          compressedPaths[i] = path;
          done++;
          if (done === paths.length) {
            this.convertToBase64(compressedPaths);
          }
        }
      });
    });
  },

  convertToBase64(paths) {
    const base64s = [];
    let loaded = 0;
    paths.forEach((path) => {
      wx.getFileSystemManager().readFile({
        filePath: path,
        encoding: 'base64',
        success: (res) => {
          const ext = path.split('.').pop().toLowerCase();
          const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
          base64s.push('data:' + mime + ';base64,' + res.data);
          loaded++;
          if (loaded === paths.length) {
            this.setData({ imageBase64s: base64s });
          }
        },
        fail: () => {
          loaded++;
          if (loaded === paths.length) {
            this.setData({ imageBase64s: base64s });
          }
        }
      });
    });
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onTextInput(e) {
    this.setData({ text: e.detail.value });
  },

  onPinnedChange(e) {
    this.setData({ isPinned: e.detail.value });
  },

  onPinnedChange(e) {
    this.setData({ isPinned: e.detail.value });
    // 打开置顶时，默认设置截止时间为7天后23:59
    if (e.detail.value && !this.data.pinDate) {
      const future = new Date();
      future.setDate(future.getDate() + 7);
      const d = future.toISOString().slice(0, 10);
      const t = '23:59';
      this.setData({ pinDate: d, pinTime: t });
    }
  },

  onPinDateChange(e) {
    this.setData({ pinDate: e.detail.value });
  },

  onPinTimeChange(e) {
    this.setData({ pinTime: e.detail.value });
  },

  onSpotlightChange(e) {
    this.setData({ isSpotlight: e.detail.value });
  },

  onCategoryChange(e) {
    const idx = parseInt(e.detail.value, 10);
    const cat = this.data.categoryList[idx];
    const reset = { categoryIndex: idx, category: cat, incomeAmount: '', expenseAmount: '' };
    // 切换非猫猫帖时清除猫咪关联
    if (cat !== '猫猫帖') {
      reset.catIndex = 0;
      reset.selectedCat = '';
      reset.selectedCatId = null;
    }
    this.setData(reset);
  },

  onIncomeInput(e) {
    this.setData({ incomeAmount: e.detail.value });
  },

  onExpenseInput(e) {
    this.setData({ expenseAmount: e.detail.value });
  },

  submitPost() {
    if (!this.data.title && !this.data.text && this.data.imagePaths.length === 0) {
      wx.showToast({ title: '请填写主题或上传照片', icon: 'none' });
      return;
    }

    const token = app.globalData.token;
    if (!token) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '发布中...' });

    const body = {
      title: this.data.title,
      text: this.data.text,
      cat_id: this.data.selectedCatId || '',
      images: this.data.imageBase64s
    };

    if (this.data.isManager) {
      body.is_pinned = this.data.isPinned ? 1 : 0;
      body.is_spotlight = this.data.isSpotlight ? 1 : 0;
      body.category = this.data.category || '';
      // 置顶截止时间
      if (this.data.isPinned && this.data.pinDate) {
        body.pinned_until = this.data.pinDate + ' ' + (this.data.pinTime || '23:59') + ':00';
      }
      // 活动记录帖收支
      if (this.data.category === '活动记录帖') {
        body.income_amount = this.data.incomeAmount ? parseFloat(this.data.incomeAmount) || 0 : 0;
        body.expense_amount = this.data.expenseAmount ? parseFloat(this.data.expenseAmount) || 0 : 0;
      }
    }

    api.post('/api/posts', body, {
      success: (res) => {
        wx.hideLoading();
        if (res.data.message) {
          wx.showToast({ title: res.data.message, icon: 'success' });
          setTimeout(() => wx.navigateBack(), 1500);
        } else {
          wx.showToast({ title: res.data.error || '发布失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络失败', icon: 'none' });
      }
    });
  }
});
