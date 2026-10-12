/* 1590 Charity Club Mini Program · (c) 2026 Eason Yuan (@Eason928) · https://github.com/Eason928/1590-charity-miniprogram */

/**
 * 统一 API 请求层
 * 
 * 用法：
 *   const api = require('../../utils/api');
 *   const cats = await api.get('/api/cats');
 *   const res = await api.post('/api/login', { username, password });
 *   const res = await api.upload('/api/admin/cats', { filePath, formData });
 * 
 * 以后换云开发只改这个文件：
 *   get/post/put/del → 改成 wx.cloud.callFunction
 *   upload → 改成 wx.cloud.uploadFile
 */

const BASE = () => getApp().globalData.API_BASE;
const TOKEN = () => getApp().globalData.token || wx.getStorageSync('token');

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE() + url,
      method: options.method || 'GET',
      data: options.data,
      header: {
        'Content-Type': options.formData ? 'multipart/form-data' : 'application/json',
        'Authorization': 'Bearer ' + TOKEN()
      },
      success: (res) => {
        if (options.success) options.success(res);
        resolve(res.data);
      },
      fail: (err) => {
        if (options.fail) options.fail(err);
        wx.showToast({ title: '网络出错了', icon: 'none' });
        reject(err);
      }
    });
  });
}

module.exports = {
  /** GET 请求 */
  get(url, cb) {
    return request(url, { method: 'GET', success: cb && cb.success, fail: cb && cb.fail });
  },

  /** POST 请求 */
  post(url, data, cb) {
    if (data === null || data === undefined) data = {};
    return request(url, { method: 'POST', data, success: cb && cb.success, fail: cb && cb.fail });
  },

  /** PUT 请求 */
  put(url, data, cb) {
    if (data === null || data === undefined) data = {};
    return request(url, { method: 'PUT', data, success: cb && cb.success, fail: cb && cb.fail });
  },

  /** DELETE 请求 */
  del(url, cb) {
    return request(url, { method: 'DELETE', success: cb && cb.success, fail: cb && cb.fail });
  },

  /** 上传文件（图片等） */
  upload(url, { filePath, formData = {}, method = 'POST' } = {}, cb) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: BASE() + url,
        filePath,
        name: 'image',
        formData,
        method,
        header: { 'Authorization': 'Bearer ' + TOKEN() },
        success: (res) => {
          if (cb && cb.success) cb.success(res);
          try {
            resolve(JSON.parse(res.data));
          } catch (e) {
            resolve(res.data);
          }
        },
        fail: (err) => {
          if (cb && cb.fail) cb.fail(err);
          wx.showToast({ title: '上传失败', icon: 'none' });
          reject(err);
        }
      });
    });
  },

  /** 上传文件（自定义字段名） */
  uploadField(url, { filePath, fieldName = 'image', formData = {}, method = 'POST' } = {}, cb) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: BASE() + url,
        filePath,
        name: fieldName,
        formData,
        method,
        header: { 'Authorization': 'Bearer ' + TOKEN() },
        success: (res) => {
          if (cb && cb.success) cb.success(res);
          try {
            resolve(JSON.parse(res.data));
          } catch (e) {
            resolve(res.data);
          }
        },
        fail: (err) => {
          if (cb && cb.fail) cb.fail(err);
          reject(err);
        }
      });
    });
  }
};
