/* 1590 Charity Club Mini Program · (c) 2026 Eason Yuan (@Eason928) · https://github.com/Eason928/1590-charity-miniprogram */

App({
  globalData: {
    API_BASE: 'http://82.157.182.21:3000',
    // API_BASE: '',
    // local: http://localhost:3000,
    // aidi: http://172.16.15.228:3000
    user: null,
    token: ''
  },

  checkLogin() {
    const token = wx.getStorageSync('token');
    const user = wx.getStorageSync('user');
    if (token && user) {
      this.globalData.token = token;
      this.globalData.user = user;
      return user;
    }
    return null;
  },

  onLaunch() {
    console.log('公益社小猫小程序启动啦 🐱');
    this.checkLogin();
  }
});
