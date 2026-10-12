const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    isAdmin: false,
    isDeveloper: false,
    userRole: '',
    currentTab: 'posts',
    postsSubTab: 'all',
    currentPostsLength: 0,
    usersSubTab: 'all',
    pendingPosts: [],
    allPosts: [],
    allCats: [],
    pendingCount: 0,
    pendingUsers: 0,
    pendingUserList: [],
    allUsers: [],
    adminUsers: [],
    adminAppCount: 0,
    adminAppList: [],
    devUsers: [],
    adminAppsOpen: true,
    dashboard: {
      server: { node: '', platform: '', uptime: 0, memory: 0, port: 0 },
      database: { tables: 0, size_kb: 0, connection: '' },
      counts: { cats: 0, users: 0, posts: 0, pendingPosts: 0, pendingUsers: 0, adminApplications: 0 },
      breakdown: { catStatus: [], postStatus: [] },
      recent: { users: [], posts: [] },
      catRanking: [],
      trends: { dailyPosts: [], dailyUsers: [] },
      maxTrend: 1
    },
    API_BASE: app.globalData.API_BASE,
    editUserForm: { show: false, id: null, nickname: '', role: '', newNickname: '', newPassword: '', newRole: '', newTitle: '' },
    showEditForm: false,
    editCatId: null,
    catAvatarPath: '',
    newCat: { name: '', gender: '', color: '', age: '', personality: '', favorite_food: '', locations: '', story: '', health_status: '', neutered: false, status: '在校' },
    products: [],
    showProductForm: false,
    editProductId: null,
    productImagePath: '',
    productForm: { name: '', description: '', price: '', category: '', status: 'on_sale' },
    productCategories: ['文创','文具','手作','饰品','服饰','其他'],
    productCategoryIndex: -1,
    showCategoryInput: false,
    newCategoryName: '',
    // 学生管理
    studentList: [],
    newStudentId: '',
    newStudentName: '',
    newStudentPwd: '',
    batchStudentJson: '',
    volunteerTasks: [],
    showTaskForm: false,
    editTaskId: null,
    taskForm: { title: '', description: '', location: '', date_time_date: '', date_time_time: '', deadline_date: '', deadline_time: '', slots_needed: '', status: 'recruiting' },
    showAppList: false,
    appListTitle: '',
    appList: [],
    appTaskId: null,
    editPostCat: { show: false, postId: null, catId: null, cats: [], catNames: ['不关联猫咪'], catIndex: 0 }
  },

  formatUptime(s) {
    if (!s) return '0s';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + sec + 's';
    return sec + 's';
  },

  onLoad(options) {
    if (options && options.tab) {
      // onLoad runs before onShow — 记录目标tab，onShow 直接用
      this._targetTab = options.tab;
    }
  },

  onShow() {
    const user = app.checkLogin();
    if (user && (user.role === 'admin' || user.role === 'developer' || user.role === 'rongdada')) {
      const isDev = user.role === 'developer';
      const isAdmin = user.role === 'admin';
      // 如果是从外部跳转进来的，直接用目标tab，避免先闪一下待审核
      const initialTab = this._targetTab || (isDev ? 'overview' : 'posts');
      this._targetTab = null;
      this.setData({ isAdmin: true, isDeveloper: isDev, userRole: user.role, currentTab: initialTab });
      // 加载对应tab数据
      if (initialTab === 'posts' || initialTab === 'pending' || initialTab === 'all') {
        this.loadPosts();
        this.setData({ postsSubTab: initialTab === 'pending' ? 'pending' : 'all', currentTab: 'posts' });
      }
      else if (initialTab === 'users' || initialTab === 'allusers' || initialTab === 'adminApps') {
        this.loadUsers();
        this.setData({ usersSubTab: initialTab === 'adminApps' ? 'apps' : 'all', currentTab: 'users' });
      }
      else if (initialTab === 'overview' || initialTab === 'dashboard') { if (isDev) this.loadDevData(); this.setData({ currentTab: 'overview' }); }
      else if (initialTab === 'products') this.loadProducts();
      else if (initialTab === 'volunteerMgmt') { this.loadVolunteerTasks(); this.setData({ showAppList: false }); }
      else if (initialTab === 'students') this.loadStudents();
      // 帖子总是预加载
      this.loadPosts();
      this.loadCats();
      // 管理员只加载帖子和猫咪管理，不加载用户/志愿/义卖
      if (!isAdmin) {
        this.loadUsers();
        if (isDev) this.loadDevData();
      }
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    const user = app.globalData.user;
    // 管理员不可访问用户管理/志愿管理/义卖管理/学生管理/概览
    if (user && user.role !== 'developer' && user.role !== 'rongdada' && ['users','volunteerMgmt','products','students','overview'].includes(tab)) {
      return;
    }
    this.setData({ currentTab: tab });
    if (tab === 'posts') this.loadPosts();
    else if (tab === 'catmgmt') this.loadCats();
    else if (tab === 'users') this.loadUsers();
    else if (tab === 'overview') this.loadDevData();
    else if (tab === 'products') this.loadProducts();
    else if (tab === 'volunteerMgmt') { this.loadVolunteerTasks(); this.setData({ showAppList: false }); }
    else if (tab === 'students') this.loadStudents();
  },

  switchPostsSub(e) {
    const sub = e.currentTarget.dataset.sub;
    this.setData({ postsSubTab: sub });
    if (sub === 'pending') { this.loadPending(); this.setData({ currentPostsLength: this.data.pendingPosts.length }); }
    if (sub === 'all') { this.loadAll(); this.setData({ currentPostsLength: this.data.allPosts.length }); }
  },

  switchUsersSub(e) {
    this.setData({ usersSubTab: e.currentTarget.dataset.sub });
  },

  goProfile() { wx.switchTab({ url: '/pages/profile/profile' }); },

  // ===== 帖子相关 =====
  loadPosts() { this.loadPending(); this.loadAll(); },
  loadPending() {
    api.get('/api/admin/posts/pending', {
      success: (res) => { if (res.data && res.data.posts) this.setData({ pendingPosts: res.data.posts, pendingCount: res.data.posts.length, currentPostsLength: res.data.posts.length }); }
    });
  },
  loadAll() {
    api.get('/api/admin/posts/all', {
      success: (res) => { if (res.data && res.data.posts) this.setData({ allPosts: res.data.posts, currentPostsLength: res.data.posts.length }); }
    });
  },
  approvePost(e) {
    api.post('/api/admin/posts/' + e.currentTarget.dataset.id + '/approve', null, {
      success: () => { wx.showToast({ title: '已通过', icon: 'success' }); this.loadPosts(); }
    });
  },
  rejectPost(e) {
    wx.showModal({ title: '拒绝帖子', content: '确定拒绝吗？',
      success: (r) => { if (r.confirm)
        api.post('/api/admin/posts/' + e.currentTarget.dataset.id + '/reject', null, {
          success: () => { wx.showToast({ title: '已拒绝', icon: 'success' }); this.loadPosts(); }
        });
      }
    });
  },
  deletePost(e) {
    wx.showModal({ title: '删除帖子', content: '删除后不可恢复',
      success: (r) => { if (r.confirm)
        api.del('/api/admin/posts/' + e.currentTarget.dataset.id, {
          success: () => { wx.showToast({ title: '已删除', icon: 'success' }); this.loadPosts(); }
        });
      }
    });
  },

  // ===== 帖子关联猫咪管理 =====
  editPostCat(e) {
    const postId = e.currentTarget.dataset.id;
    const currentCatId = e.currentTarget.dataset.catid;
    // 加载猫咪列表
    api.get('/api/cats', {
      success: (res) => {
        const cats = (res.data && res.data.cats) || [];
        const catNames = ['不关联猫咪', ...cats.map(c => c.name)];
        let catIndex = 0;
        if (currentCatId) {
          const found = cats.findIndex(c => String(c.id) === String(currentCatId));
          if (found >= 0) catIndex = found + 1; // +1 因为第一项是"不关联猫咪"
        }
        this.setData({
          editPostCat: { show: true, postId, catId: currentCatId || null, cats, catNames, catIndex }
        });
      }
    });
  },
  onEditPostCatChange(e) {
    this.setData({ 'editPostCat.catIndex': e.detail.value });
  },
  submitEditPostCat() {
    const epc = this.data.editPostCat;
    const catId = epc.catIndex > 0 ? epc.cats[epc.catIndex - 1].id : null;
    api.put('/api/admin/posts/' + epc.postId + '/cat', { cat_id: catId }, {
      success: (res) => {
        if (res.data.message) {
          wx.showToast({ title: res.data.message, icon: 'success' });
          this.setData({ 'editPostCat.show': false });
          this.loadAll();
        } else {
          wx.showToast({ title: res.data.error || '更新失败', icon: 'none' });
        }
      },
      fail: () => { wx.showToast({ title: '网络错误', icon: 'none' }); }
    });
  },
  cancelEditPostCat() {
    this.setData({ 'editPostCat.show': false });
  },

  // ===== 猫咪管理 =====
  loadCats() {
    api.get('/api/admin/cats', {
      success: (res) => { if (res.data && res.data.cats) {
        this.setData({ allCats: res.data.cats });
      }}
    });
  },
  editCat(e) {
    const d = e.currentTarget.dataset;
    this.setData({ editCatId: d.id, showEditForm: true, catAvatarPath: '',
      newCat: { name: d.name||'', gender: d.gender||'', color: d.color||'', age: d.age||'', personality: d.personality||'', favorite_food: d.favorite_food||'', locations: d.locations||'', story: d.story||'', health_status: d.health_status||'', neutered: !!Number(d.neutered), status: d.status||'在校' }
    });
  },
  deleteCat(e) {
    wx.showModal({ title: '删除猫咪', content: '确定删除「' + e.currentTarget.dataset.name + '」？',
      success: (r) => { if (r.confirm)
        api.del('/api/admin/cats/' + e.currentTarget.dataset.id, {
          success: () => { wx.showToast({ title: '已删除', icon: 'success' }); this.loadCats(); }
        });
      }
    });
  },
  showAddForm() {
    this.setData({ showEditForm: true, editCatId: null, catAvatarPath: '',
      newCat: { name: '', gender: '', color: '', age: '', personality: '', favorite_food: '', locations: '', story: '', health_status: '', neutered: false, status: '在校' }
    });
  },
  cancelEdit() {
    this.setData({ showEditForm: false, editCatId: null, catAvatarPath: '',
      newCat: { name: '', gender: '', color: '', age: '', personality: '', favorite_food: '', locations: '', story: '', health_status: '', neutered: false, status: '在校' }
    });
  },
  chooseCatAvatar() {
    wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
      success: (res) => { this.setData({ catAvatarPath: res.tempFilePaths[0] }); }
    });
  },
  onNewCatInput(e) { this.setData({ ['newCat.' + e.currentTarget.dataset.field]: e.detail.value }); },
  onNeuteredChange(e) { this.setData({ 'newCat.neutered': e.detail.value }); },
  pickStatus(e) { this.setData({ 'newCat.status': e.currentTarget.dataset.status }); },
  addCat() {
    const cat = this.data.newCat;
    if (!cat.name) { wx.showToast({ title: '请输入猫咪名字', icon: 'none' }); return; }
    wx.showLoading({ title: this.data.editCatId ? '更新中...' : '添加中...' });
    const hasImage = this.data.catAvatarPath;
    const url = '/api/admin/cats' + (this.data.editCatId ? '/' + this.data.editCatId : '');
    const method = this.data.editCatId ? 'PUT' : 'POST';
    if (hasImage) {
      api.uploadField(url, { filePath: this.data.catAvatarPath, fieldName: 'avatar', formData: cat, method },
        {
          success: (res) => { wx.hideLoading(); const data = JSON.parse(res.data); if (data.message) { wx.showToast({ title: data.message, icon: 'success' }); this.cancelEdit(); this.loadCats(); } else { wx.showToast({ title: data.error || '操作失败', icon: 'none' }); } },
          fail: () => { wx.hideLoading(); wx.showToast({ title: '网络错误', icon: 'none' }); }
        });
    } else {
      const req = method === 'PUT' ? api.put : api.post;
      req(url, cat, {
        success: (res) => { wx.hideLoading(); if (res.data.message) { wx.showToast({ title: res.data.message, icon: 'success' }); this.cancelEdit(); this.loadCats(); } else { wx.showToast({ title: res.data.error || '操作失败', icon: 'none' }); } },
        fail: () => { wx.hideLoading(); wx.showToast({ title: '网络错误', icon: 'none' }); }
      });
    }
  },

  // ===== 用户审核 =====
  loadUsers() {
    api.get('/api/admin/users/pending', {
      success: (res) => { if (res.data && res.data.users) this.setData({ pendingUserList: res.data.users, pendingUsers: res.data.users.length }); }
    });
    api.get('/api/admin/users', {
      success: (res) => { if (res.data && res.data.users) { this.setData({ allUsers: res.data.users });
        if (!this.data.isDeveloper) this.setData({ adminUsers: res.data.users });
      } }
    });
    if (this.data.isDeveloper) {
      api.get('/api/dev/users', {
        success: (res) => { if (res.data && res.data.users) this.setData({ adminUsers: res.data.users, devUsers: res.data.users }); }
      });
    }
    this.loadAdminApps();
  },
  approveUser(e) { const id=e.currentTarget.dataset.id, name=e.currentTarget.dataset.name;
    wx.showModal({ title:'审核通过', content:'通过「'+name+'」的注册申请？',
      success:(r)=>{if(r.confirm) api.post('/api/admin/users/'+id+'/approve', null, {success:()=>{wx.showToast({title:'已通过',icon:'success'});this.loadUsers();}});}
    });
  },
  rejectUser(e) { const id=e.currentTarget.dataset.id, name=e.currentTarget.dataset.name;
    wx.showModal({ title:'拒绝用户', content:'删除「'+name+'」的申请？',
      success:(r)=>{if(r.confirm) api.del('/api/admin/users/'+id, {success:()=>{wx.showToast({title:'已拒绝',icon:'success'});this.loadUsers();}});}
    });
  },

  // ===== 管理员申请 =====
  loadAdminApps() {
    api.get('/api/admin/applications', {
      success: (res) => { if (res.data && res.data.users) this.setData({ adminAppList: res.data.users, adminAppCount: res.data.users.length }); }
    });
  },
  approveAdminApp(e) { const id=e.currentTarget.dataset.id, name=e.currentTarget.dataset.name;
    wx.showModal({ title:'升级管理员', content:'将「'+name+'」升级为管理员？',
      success:(r)=>{if(r.confirm) api.post('/api/admin/applications/'+id+'/approve', null, {success:()=>{wx.showToast({title:'已升级',icon:'success'});this.loadUsers();}});}
    });
  },
  rejectAdminApp(e) { const id=e.currentTarget.dataset.id, name=e.currentTarget.dataset.name;
    wx.showModal({ title:'拒绝申请', content:'拒绝「'+name+'」的申请？',
      success:(r)=>{if(r.confirm) api.post('/api/admin/applications/'+id+'/reject', null, {success:()=>{wx.showToast({title:'已拒绝',icon:'success'});this.loadUsers();}});}
    });
  },

  // ===== 开发者面板 =====
  loadDevData() {
    api.get('/api/settings', {
      success: (res) => { if (res.data && res.data.settings) this.setData({ adminAppsOpen: res.data.settings.admin_applications_open === '1' }); }
    });
    api.get('/api/dev/dashboard', {
      success: (res) => { if (res.data) {
        const d = res.data;
        let maxTrend = 1;
        d.trends.dailyPosts.forEach(p => { if (p.cnt > maxTrend) maxTrend = p.cnt; });
        d.trends.dailyUsers.forEach(u => { if (u.cnt > maxTrend) maxTrend = u.cnt; });
        d.maxTrend = maxTrend;
        const statusMap = { '在校': 0, '已领养': 0, '喵星': 0 };
        d.breakdown.catStatus.forEach(s => { statusMap[s.status] = s.cnt; });
        d.breakdown.catStatus = Object.entries(statusMap).map(([k,v]) => ({ status: k, cnt: v }));
        this.setData({ dashboard: d });
      } }
    });
    api.get('/api/dev/users', {
      success: (res) => { if (res.data && res.data.users) this.setData({ devUsers: res.data.users }); }
    });
  },

  toggleAdminApps(e) {
    api.put('/api/dev/settings', { key: 'admin_applications_open', value: e.detail.value ? '1' : '0' }, {
      success: () => { this.setData({ adminAppsOpen: e.detail.value }); wx.showToast({ title: '设置已更新', icon: 'success' }); }
    });
  },

  // ===== 撤销管理员/开发者权限 =====
  revokeRole(e) {
    const d = e.currentTarget.dataset;
    const roleLabel = d.role === 'developer' ? '开发者' : '管理员';
    wx.showModal({
      title: '撤销权限',
      content: '确定撤销「' + d.name + '」的' + roleLabel + '权限？撤销后将成为普通用户。',
      success: (r) => {
        if (r.confirm) {
          wx.showLoading({ title: '处理中...' });
          api.post('/api/admin/users/' + d.id + '/revoke', null, {
            success: (res) => {
              wx.hideLoading();
              if (res.data.message) {
                wx.showToast({ title: res.data.message, icon: 'success' });
                this.loadUsers();
              } else {
                wx.showToast({ title: res.data.error || '操作失败', icon: 'none' });
              }
            },
            fail: () => { wx.hideLoading(); wx.showToast({ title: '网络错误', icon: 'none' }); }
          });
        }
      }
    });
  },

  // ===== 编辑用户（弹窗） =====
  adminEditUser(e) {
    const d = e.currentTarget.dataset;
    this.setData({
      editUserForm: { show: true, id: d.id, nickname: d.name, role: d.role, newNickname: '', newPassword: '', newRole: d.role, newTitle: d.title || '' }
    });
  },
  onEditUserInput(e) { this.setData({ ['editUserForm.' + e.currentTarget.dataset.field]: e.detail.value }); },
  pickEditUserRole(e) { this.setData({ 'editUserForm.newRole': e.currentTarget.dataset.role }); },
  pickEditUserTitle(e) { this.setData({ 'editUserForm.newTitle': e.currentTarget.dataset.title }); },
  submitEditUser() {
    const f = this.data.editUserForm;
    const body = {};
    if (f.newNickname) body.nickname = f.newNickname;
    if (f.newPassword) body.password = f.newPassword;
    if (f.newRole && f.newRole !== f.role) body.role = f.newRole;
    if (f.newTitle !== f.title) body.title = f.newTitle;
    if (Object.keys(body).length === 0) { wx.showToast({ title: '没有需要修改的内容', icon: 'none' }); return; }
    api.put('/api/dev/users/' + f.id, body, {
      success: (res) => {
        if (res.data.message) {
          wx.showToast({ title: res.data.message, icon: 'success' });
          this.setData({ 'editUserForm.show': false });
          this.loadUsers();
        } else {
          wx.showToast({ title: res.data.error || '更新失败', icon: 'none' });
        }
      },
      fail: () => { wx.showToast({ title: '网络错误', icon: 'none' }); }
    });
  },
  cancelEditUser() { this.setData({ 'editUserForm.show': false }); },
  emptyHandler() {},

  // ===== 义卖管理 =====
  loadProducts() {
    api.get('/api/admin/products', {
      success: (res) => { if (res.data && res.data.products) this.setData({ products: res.data.products }); }
    });
    this.loadCategories();
  },
  loadCategories() {
    api.get('/api/admin/product-categories', {
      success: (res) => {
        if (res.data && res.data.categories && res.data.categories.length > 0) {
          this.setData({ productCategories: res.data.categories });
        }
      }
    });
  },
  showAddProduct() {
    this.setData({
      showProductForm: true, editProductId: null, productImagePath: '',
      productForm: { name: '', description: '', price: '', category: '', status: 'on_sale' },
      productCategoryIndex: -1
    });
  },
  onProductInput(e) { this.setData({ ['productForm.' + e.currentTarget.dataset.field]: e.detail.value }); },
  chooseProductImage() {
    wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
      success: (res) => { this.setData({ productImagePath: res.tempFilePaths[0] }); }
    });
  },
  onProductCategoryChange(e) {
    this.setData({ productCategoryIndex: e.detail.value, 'productForm.category': this.data.productCategories[e.detail.value] });
  },
  pickProductStatus(e) { this.setData({ 'productForm.status': e.currentTarget.dataset.status }); },
  saveProduct() {
    const pf = this.data.productForm;
    if (!pf.name) { wx.showToast({ title: '请输入商品名称', icon: 'none' }); return; }
    wx.showLoading({ title: this.data.editProductId ? '更新中...' : '添加中...' });
    const hasImage = this.data.productImagePath;
    const url = '/api/admin/products' + (this.data.editProductId ? '/' + this.data.editProductId : '');
    const method = this.data.editProductId ? 'PUT' : 'POST';
    if (hasImage) {
      api.uploadField(url, { filePath: this.data.productImagePath, fieldName: 'image', formData: pf, method }, {
        success: (res) => { wx.hideLoading(); const data = JSON.parse(res.data); if (data.message) { wx.showToast({ title: data.message, icon: 'success' }); this.cancelProductForm(); this.loadProducts(); } else { wx.showToast({ title: data.error || '操作失败', icon: 'none' }); } },
        fail: () => { wx.hideLoading(); wx.showToast({ title: '网络错误', icon: 'none' }); }
      });
    } else {
      const req = method === 'PUT' ? api.put : api.post;
      req(url, pf, {
        success: (res) => { wx.hideLoading(); if (res.data.message) { wx.showToast({ title: res.data.message, icon: 'success' }); this.cancelProductForm(); this.loadProducts(); } else { wx.showToast({ title: res.data.error || '操作失败', icon: 'none' }); } },
        fail: () => { wx.hideLoading(); wx.showToast({ title: '网络错误', icon: 'none' }); }
      });
    }
  },
  editProduct(e) {
    const d = e.currentTarget.dataset;
    const catIdx = this.data.productCategories.indexOf(d.category);
    this.setData({
      showProductForm: true, editProductId: d.id, productImagePath: '',
      productForm: { name: d.name, description: d.desc, price: String(d.price), category: d.category || '', status: d.status || 'on_sale' },
      productCategoryIndex: catIdx >= 0 ? catIdx : -1
    });
  },
  deleteProduct(e) {
    wx.showModal({ title: '删除商品', content: '确定删除「' + e.currentTarget.dataset.name + '」？',
      success: (r) => { if (r.confirm)
        api.del('/api/admin/products/' + e.currentTarget.dataset.id, {
          success: () => { wx.showToast({ title: '已删除', icon: 'success' }); this.loadProducts(); }
        });
      }
    });
  },
  cancelProductForm() {
    this.setData({ showProductForm: false, editProductId: null, productImagePath: '',
      productForm: { name: '', description: '', price: '', category: '', status: 'on_sale' },
      productCategoryIndex: -1
    });
  },
  showAddCategory() { this.setData({ showCategoryInput: true, newCategoryName: '' }); },
  hideAddCategory() { this.setData({ showCategoryInput: false, newCategoryName: '' }); },
  onNewCategoryInput(e) { this.setData({ newCategoryName: e.detail.value }); },
  doAddCategory() {
    const name = this.data.newCategoryName.trim();
    if (!name) { wx.showToast({ title: '请输入类别名称', icon: 'none' }); return; }
    api.post('/api/admin/product-categories', { name }, {
      success: (res) => { if (res.data.message) { wx.showToast({ title: res.data.message, icon: 'success' }); this.hideAddCategory(); this.loadCategories(); this.loadProducts(); } else { wx.showToast({ title: res.data.error || '添加失败', icon: 'none' }); } }
    });
  },
  deleteCategory(e) {
    const name = e.currentTarget.dataset.name;
    wx.showModal({ title: '删除类别', content: '确定删除类别「' + name + '」？',
      success: (r) => { if (r.confirm)
        api.del('/api/admin/product-categories/' + encodeURIComponent(name), {
          success: () => { wx.showToast({ title: '已删除', icon: 'success' }); this.loadCategories(); }
        });
      }
    });
  },

  // ===== 志愿管理 =====
  loadVolunteerTasks() {
    api.get('/api/admin/volunteer/tasks', {
      success: (res) => { if (res.data && res.data.tasks) this.setData({ volunteerTasks: res.data.tasks }); }
    });
  },
  showAddTask() {
    this.setData({
      showTaskForm: true, editTaskId: null,
      taskForm: { title: '', description: '', location: '', date_time_date: '', date_time_time: '', deadline_date: '', deadline_time: '', slots_needed: '', status: 'recruiting' }
    });
  },
  onTaskInput(e) { this.setData({ ['taskForm.' + e.currentTarget.dataset.field]: e.detail.value }); },
  onTaskDateChange(e) { this.setData({ ['taskForm.' + e.currentTarget.dataset.field]: e.detail.value }); },
  pickTaskStatus(e) { this.setData({ 'taskForm.status': e.currentTarget.dataset.status }); },
  saveTask() {
    const f = this.data.taskForm;
    if (!f.title) { wx.showToast({ title: '请输入任务标题', icon: 'none' }); return; }
    const dateTime = f.date_time_date && f.date_time_time ? f.date_time_date + ' ' + f.date_time_time : '';
    const deadline = f.deadline_date && f.deadline_time ? f.deadline_date + ' ' + f.deadline_time : '';
    const body = { title: f.title, description: f.description, location: f.location, date_time: dateTime, deadline, slots_needed: f.slots_needed, status: f.status };
    wx.showLoading({ title: this.data.editTaskId ? '更新中...' : '发布中...' });
    const url = '/api/admin/volunteer/tasks' + (this.data.editTaskId ? '/' + this.data.editTaskId : '');
    const method = this.data.editTaskId ? 'PUT' : 'POST';
    const req = method === 'PUT' ? api.put : api.post;
    req(url, body, {
      success: (res) => { wx.hideLoading(); if (res.data.message) { wx.showToast({ title: res.data.message, icon: 'success' }); this.cancelTaskForm(); this.loadVolunteerTasks(); } else { wx.showToast({ title: res.data.error || '操作失败', icon: 'none' }); } },
      fail: () => { wx.hideLoading(); wx.showToast({ title: '网络错误', icon: 'none' }); }
    });
  },
  editVolunteerTask(e) {
    const id = Number(e.currentTarget.dataset.id);
    const tasks = this.data.volunteerTasks;
    const task = tasks.find(t => t.id === id);
    if (!task) { wx.showToast({ title: '任务数据异常', icon: 'none' }); return; }
    const dt = task.date_time ? task.date_time.split(' ') : ['', ''];
    const dl = task.deadline ? task.deadline.split(' ') : ['', ''];
    this.setData({
      showTaskForm: true, editTaskId: id,
      taskForm: {
        title: task.title || '',
        description: task.description || '',
        location: task.location || '',
        date_time_date: dt[0] || '',
        date_time_time: dt[1] || '',
        deadline_date: dl[0] || '',
        deadline_time: dl[1] || '',
        slots_needed: String(task.slots_needed || ''),
        status: task.status || 'recruiting'
      }
    });
  },
  deleteVolunteerTask(e) {
    wx.showModal({ title: '删除任务', content: '确定删除「' + e.currentTarget.dataset.title + '」？',
      success: (r) => { if (r.confirm)
        api.del('/api/admin/volunteer/tasks/' + e.currentTarget.dataset.id, {
          success: () => { wx.showToast({ title: '已删除', icon: 'success' }); this.loadVolunteerTasks(); }
        });
      }
    });
  },
  cancelTaskForm() {
    this.setData({ showTaskForm: false, editTaskId: null,
      taskForm: { title: '', description: '', location: '', date_time_date: '', date_time_time: '', deadline_date: '', deadline_time: '', slots_needed: '', status: 'recruiting' }
    });
  },
  viewVolunteerApps(e) {
    const id = e.currentTarget.dataset.id;
    const title = e.currentTarget.dataset.title;
    this.setData({ showAppList: true, appListTitle: title, appTaskId: id });
    api.get('/api/admin/volunteer/applications/' + id, {
      success: (res) => { if (res.data && res.data.applications) this.setData({ appList: res.data.applications }); }
    });
  },
  confirmApp(e) {
    api.put('/api/admin/volunteer/applications/' + e.currentTarget.dataset.id, { status: 'confirmed' }, {
      success: () => { wx.showToast({ title: '已确认', icon: 'success' }); this.viewVolunteerApps({ currentTarget: { dataset: { id: this.data.appTaskId, title: this.data.appListTitle } } }); }
    });
  },
  markAttended(e) {
    api.put('/api/admin/volunteer/applications/' + e.currentTarget.dataset.id, { status: 'attended' }, {
      success: () => { wx.showToast({ title: '已标记', icon: 'success' }); this.viewVolunteerApps({ currentTarget: { dataset: { id: this.data.appTaskId, title: this.data.appListTitle } } }); }
    });
  },
  closeAppList() {
    this.setData({ showAppList: false, appList: [], appListTitle: '', appTaskId: null });
  },

  // ===== 分享到微信好友 =====
  onShareAppMessage(e) {
    // 从分享按钮的 dataset 获取任务信息
    const taskId = e.target.dataset.id;
    const taskTitle = e.target.dataset.title || '志愿活动';

    // 从本地数据中找到该任务的完整信息
    const tasks = this.data.volunteerTasks || [];
    const task = tasks.find(t => String(t.id) === String(taskId));

    return {
      title: taskTitle,
      path: '/pages/volunteer-detail/volunteer-detail?id=' + taskId,
      imageUrl: '', // 使用默认截图
      desc: task ? (task.description || '志愿活动详情') : '志愿活动详情'
    };
  },

  // ===== 学生管理 =====
  loadStudents() {
    api.get('/api/admin/students', {
      success: (res) => { if (res.data && res.data.students) this.setData({ studentList: res.data.students }); }
    });
  },
  onNewStudentId(e) { this.setData({ newStudentId: e.detail.value }); },
  onNewStudentName(e) { this.setData({ newStudentName: e.detail.value }); },
  onNewStudentPwd(e) { this.setData({ newStudentPwd: e.detail.value }); },
  onBatchStudentJson(e) { this.setData({ batchStudentJson: e.detail.value }); },
  addStudent() {
    const studentId = this.data.newStudentId.trim();
    const name = this.data.newStudentName.trim();
    const password = this.data.newStudentPwd;
    if (!studentId) { wx.showToast({ title: '请输入学号', icon: 'none' }); return; }
    wx.showLoading({ title: '添加中...' });
    api.post('/api/admin/students', { studentId, name, password: password || undefined }, {
      success: (res) => {
        wx.hideLoading();
        if (res.data && res.data.error) { wx.showToast({ title: res.data.error, icon: 'none' }); return; }
        wx.showToast({ title: '已添加', icon: 'success' });
        this.setData({ newStudentId: '', newStudentName: '', newStudentPwd: '' });
        this.loadStudents();
      },
      fail: () => { wx.hideLoading(); wx.showToast({ title: '添加失败', icon: 'none' }); }
    });
  },
  batchAddStudents() {
    const jsonStr = this.data.batchStudentJson.trim();
    if (!jsonStr) { wx.showToast({ title: '请粘贴JSON数据', icon: 'none' }); return; }
    let students;
    try { students = JSON.parse(jsonStr); }
    catch(e) { wx.showToast({ title: 'JSON格式错误', icon: 'none' }); return; }
    if (!Array.isArray(students) || students.length === 0) { wx.showToast({ title: '请提供学生数组', icon: 'none' }); return; }
    wx.showLoading({ title: '导入中...' });
    api.post('/api/admin/students/batch', { students }, {
      success: (res) => {
        wx.hideLoading();
        if (res.data && res.data.message) { wx.showToast({ title: res.data.message, icon: 'success' }); }
        this.setData({ batchStudentJson: '' });
        this.loadStudents();
      },
      fail: () => { wx.hideLoading(); wx.showToast({ title: '导入失败', icon: 'none' }); }
    });
  },
  deleteStudent(e) {
    const studentId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除学生', content: '确定从花名册中删除该学生？',
      success: (r) => {
        if (r.confirm) {
          wx.showLoading({ title: '删除中...' });
          api.del('/api/admin/students/' + encodeURIComponent(studentId), {
            success: (res) => {
              wx.hideLoading();
              wx.showToast({ title: '已删除', icon: 'success' });
              this.loadStudents();
            },
            fail: () => { wx.hideLoading(); wx.showToast({ title: '删除失败', icon: 'none' }); }
          });
        }
      }
    });
  },

  // ===== 退出 =====
  logout() {
    wx.showModal({ title: '退出管理后台', content: '确定退出吗？',
      success: (r) => { if (r.confirm) wx.navigateBack(); }
    });
  }
});
