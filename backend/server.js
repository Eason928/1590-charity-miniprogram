require('dotenv').config();
const Koa = require('koa');
const Router = require('@koa/router');
const { koaBody } = require('koa-body');
const cors = require('@koa/cors');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

// ====== 初始化 ======
const app = new Koa();
const router = new Router();
const PORT = process.env.PORT || 3000;

// 上传目录
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ====== 数据库连接池 ======
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'catforum',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cat_forum',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
});

// ====== 中间件 ======
// 错误日志
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error('请求错误:', err.message);
    console.error(err.stack);
    ctx.status = err.status || 500;
    ctx.body = { error: err.message || '服务器内部错误' };
  }
});
app.use(cors());
app.use(koaBody({
  multipart: true,
  jsonLimit: '20mb',
  formLimit: '20mb',
  textLimit: '20mb',
  formidable: {
    uploadDir: UPLOAD_DIR,
    keepExtensions: true,
    maxFileSize: 5 * 1024 * 1024, // 5MB
  }
}));

// 静态文件 — 上传的图片手动服务
app.use(async (ctx, next) => {
  if (ctx.path.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, 'uploads', ctx.path.replace('/uploads/', ''));
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      const mimes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
      ctx.type = mimes[ext] || 'application/octet-stream';
      ctx.body = fs.createReadStream(filePath);
      return;
    }
  }
  await next();
});

// 静态文件 — 小程序本地猫咪图片
const MINIPROGRAM_IMAGES = path.join(__dirname, '..', 'miniprogram', 'images');
if (fs.existsSync(MINIPROGRAM_IMAGES)) {
  app.use(async (ctx, next) => {
    if (ctx.path.startsWith('/images/')) {
      const filePath = path.join(MINIPROGRAM_IMAGES, ctx.path.replace('/images/', ''));
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase();
        const mimes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
        ctx.type = mimes[ext] || 'application/octet-stream';
        ctx.body = fs.createReadStream(filePath);
        return;
      }
    }
    await next();
  });
  console.log('📁 猫咪图片服务 → /images/');
}

// ====== JWT 工具 ======
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

// 认证中间件（可选：没有 token 也能过，但 req.user 为 null）
async function authMiddleware(ctx, next) {
  const auth = ctx.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      ctx.user = jwt.verify(auth.slice(7), JWT_SECRET);
    } catch (e) {
      ctx.user = null;
    }
  } else {
    ctx.user = null;
  }
  await next();
}
app.use(authMiddleware);

// ====== 图片嵌入工具（后端直接返回 data URL，解决真机显示问题） ======
function embedImage(imagePath) {
  if (!imagePath) return '';
  if (!imagePath.startsWith('/uploads/')) return imagePath;
  const filePath = path.join(__dirname, imagePath.replace(/^\//, ''));
  if (!fs.existsSync(filePath)) return imagePath;
  try {
    const ext = path.extname(imagePath).toLowerCase();
    const mimes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
    const mime = mimes[ext] || 'image/jpeg';
    const data = fs.readFileSync(filePath);
    return 'data:' + mime + ';base64,' + data.toString('base64');
  } catch(e) {
    return imagePath;
  }
}

function embedImages(items, field) {
  return items.map(item => {
    const val = item[field];
    if (val && val.startsWith('/uploads/')) {
      item[field] = embedImage(val);
    }
    if (item.images) {
      try {
        const imgArr = JSON.parse(item.images);
        item.images = imgArr.map(p => embedImage(p));
      } catch(e) {}
    }
    return item;
  });
}

// ====== 微信登录 ======
router.post('/api/wx-login', async (ctx) => {
  const { code } = ctx.request.body || {};
  if (!code) { ctx.status = 400; ctx.body = { error: '缺少 code' }; return; }

  let openid;
  const appid = process.env.WX_APPID;
  const secret = process.env.WX_SECRET;
  const isRealMode = !!(appid && secret);

  if (isRealMode) {
    try {
      const wxRes = await fetch(`https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`);
      const wxData = await wxRes.json();
      if (wxData.openid) {
        openid = wxData.openid;
      } else {
        // 微信 API 返回错误（如 code 过期/无效），回退到 mock（测试/开发用）
        console.warn('微信 API 返回异常，回退测试模式:', wxData);
        openid = 'mock_openid_' + code.slice(0, 8);
      }
    } catch (e) {
      console.error('微信 API 调用失败，回退测试模式:', e.message);
      openid = 'mock_openid_' + code.slice(0, 8);
    }
  } else {
    // 测试模式：用 code 生成固定 mock openid（同一设备同一会话 code 变化，但不影响测试逻辑）
    openid = 'mock_openid_' + code.slice(0, 8);
  }

  // 查询 openid 是否已绑定
  let [users] = await pool.query(
    'SELECT id, nickname, role, approved, password_reset_required, student_id, title FROM users WHERE openid=?',
    [openid]
  );

  if (users.length === 0) {
    // 首次登录（无绑定账号）→ 需要学号验证
    ctx.body = { needStudentVerify: true, openid };
    return;
  }

  const user = users[0];

  // 已绑定但强制改密 → 前端跳转改密页
  if (user.password_reset_required) {
    ctx.body = { needPasswordReset: true, openid };
    return;
  }

  // 正常登录
  const token = signToken(user);
  ctx.body = { token, user: { id: user.id, nickname: user.nickname, role: user.role, approved: user.approved } };
});

// ====== 学号验证（首次登录用） ======
router.post('/api/student-verify', async (ctx) => {
  const { studentId, password, openid } = ctx.request.body || {};
  if (!studentId || !password || !openid) {
    ctx.status = 400;
    ctx.body = { error: '缺少学号、密码或openid' };
    return;
  }

  // 1. 查学生花名册
  const [roster] = await pool.query('SELECT * FROM student_roster WHERE student_id=?', [studentId]);
  if (roster.length === 0) {
    ctx.status = 403;
    ctx.body = { error: '学号不存在，请联系管理员' };
    return;
  }
  const student = roster[0];
  if (password !== student.password) {
    ctx.status = 403;
    ctx.body = { error: '学号或密码错误' };
    return;
  }

  // 2. 检查该学号是否已被注册
  const [existingUsers] = await pool.query('SELECT id FROM users WHERE student_id=?', [studentId]);
  if (existingUsers.length > 0) {
    // 已注册 → 绑定新 openid，检查是否需要改密
    await pool.query('UPDATE users SET openid=? WHERE student_id=?', [openid, studentId]);
    const [rows] = await pool.query(
      'SELECT id, nickname, role, approved, password_reset_required, title FROM users WHERE student_id=?',
      [studentId]
    );
    const user = rows[0];
    const token = signToken(user);
    ctx.body = {
      token,
      user: { id: user.id, nickname: user.nickname, role: user.role, approved: user.approved },
      passwordResetRequired: !!user.password_reset_required
    };
    return;
  }

  // 3. 新用户 → 创建账号，标记为待改密（password_reset_required=1）
  const nickname = student.name || '学生_' + studentId.slice(-4);
  const [result] = await pool.query(
    'INSERT INTO users (openid, student_id, nickname, password, password_reset_required, role, approved, applying_admin) VALUES (?, ?, ?, ?, 1, "user", 1, 0)',
    [openid, studentId, nickname, password]
  );

  const token = signToken({ id: result.insertId, role: 'user' });
  ctx.body = {
    token,
    user: { id: result.insertId, nickname, role: 'user', approved: 1 },
    passwordResetRequired: true
  };
});

// ====== 学生快捷登录（开发者测试用，直接按花名册登录） ======
router.post('/api/student-direct-login', async (ctx) => {
  const { studentId, password } = ctx.request.body || {};
  if (!studentId || !password) {
    ctx.status = 400;
    ctx.body = { error: '请输入学号和密码' };
    return;
  }

  // 查花名册
  const [roster] = await pool.query('SELECT * FROM student_roster WHERE student_id=?', [studentId]);
  if (roster.length === 0) {
    ctx.status = 403;
    ctx.body = { error: '学号不存在' };
    return;
  }
  const student = roster[0];
  if (password !== student.password) {
    ctx.status = 403;
    ctx.body = { error: '学号或密码错误' };
    return;
  }

  // 查是否已有用户
  const [existing] = await pool.query('SELECT id, nickname, role, approved, title FROM users WHERE student_id=?', [studentId]);
  if (existing.length > 0) {
    const user = existing[0];
    const token = signToken({ id: user.id, role: user.role, title: user.title || '' });
    ctx.body = { token, user: { id: user.id, nickname: user.nickname, role: user.role, approved: user.approved, title: user.title || '' } };
    return;
  }

  // 新用户 → 直接创建（不要求改密、自动通过）
  const nickname = student.name || '学生_' + studentId.slice(-4);
  const [result] = await pool.query(
    'INSERT INTO users (student_id, nickname, password, password_reset_required, role, approved) VALUES (?, ?, ?, 0, "user", 1)',
    [studentId, nickname, password]
  );
  const token = signToken({ id: result.insertId, role: 'user' });
  ctx.body = {
    token,
    user: { id: result.insertId, nickname, role: 'user', approved: 1 }
  };
});

// ====== 强制重置密码（首次登录后） ======
router.post('/api/reset-password', async (ctx) => {
  if (!ctx.user) { ctx.status = 401; ctx.body = { error: '未登录' }; return; }
  const { password, confirmPassword } = ctx.request.body || {};
  if (!password || password.length < 6) { ctx.status = 400; ctx.body = { error: '密码至少6个字符' }; return; }
  if (password !== confirmPassword) { ctx.status = 400; ctx.body = { error: '两次密码不一致' }; return; }

  // 查当前密码，防止设置相同密码
  const [currentUser] = await pool.query('SELECT password FROM users WHERE id=?', [ctx.user.id]);
  if (currentUser.length > 0 && currentUser[0].password === password) {
    ctx.status = 400; ctx.body = { error: '新密码不能与旧密码相同' }; return;
  }

  await pool.query('UPDATE users SET password=?, password_reset_required=0 WHERE id=?', [password, ctx.user.id]);

  // 重新签发 token（包含最新状态）
  const [rows] = await pool.query('SELECT id, nickname, role, approved, title FROM users WHERE id=?', [ctx.user.id]);
  const user = rows[0];
  const newToken = signToken(user);
  ctx.body = { message: '密码已重置，请重新登录', token: newToken, user: { id: user.id, nickname: user.nickname, role: user.role, approved: user.approved, title: user.title || '' } };
});

// ====== 管理员：管理学生花名册 ======
const STUDENT_ADMIN_ROLES = ['developer', 'rongdada'];

// 获取所有学生
router.get('/api/admin/students', async (ctx) => {
  if (!ctx.user || !STUDENT_ADMIN_ROLES.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const [rows] = await pool.query('SELECT id, student_id, name FROM student_roster ORDER BY student_id');
  ctx.body = { students: rows };
});

// 添加单个学生
router.post('/api/admin/students', async (ctx) => {
  if (!ctx.user || !STUDENT_ADMIN_ROLES.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const { studentId, name, password } = ctx.request.body || {};
  if (!studentId) { ctx.status = 400; ctx.body = { error: '请输入学号' }; return; }
  const pwd = password || studentId; // 默认密码 = 学号
  try {
    await pool.query('INSERT INTO student_roster (student_id, name, password) VALUES (?, ?, ?)', [studentId, name || '', pwd]);
    ctx.body = { message: '已添加' };
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') { ctx.status = 409; ctx.body = { error: '该学号已存在' }; return; }
    throw e;
  }
});

// 批量导入学生
router.post('/api/admin/students/batch', async (ctx) => {
  if (!ctx.user || !STUDENT_ADMIN_ROLES.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const { students } = ctx.request.body || {};
  if (!Array.isArray(students) || students.length === 0) { ctx.status = 400; ctx.body = { error: '请提供学生列表' }; return; }
  let added = 0, skipped = 0;
  for (const s of students) {
    if (!s.studentId) continue;
    const pwd = s.password || s.studentId;
    try {
      await pool.query('INSERT INTO student_roster (student_id, name, password) VALUES (?, ?, ?)', [s.studentId, s.name || '', pwd]);
      added++;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') { skipped++; }
      else throw e;
    }
  }
  ctx.body = { message: `导入完成：新增 ${added} 条，跳过 ${skipped} 条` };
});

// 删除学生
router.delete('/api/admin/students/:studentId', async (ctx) => {
  if (!ctx.user || !STUDENT_ADMIN_ROLES.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const studentId = decodeURIComponent(ctx.params.studentId);
  await pool.query('DELETE FROM student_roster WHERE student_id=?', [studentId]);
  ctx.body = { message: '已删除' };
});

// ====== 原来的路由继续 ======

// 获取所有猫咪
router.get('/api/cats', async (ctx) => {
  const [rows] = await pool.query('SELECT * FROM cats ORDER BY id');
  ctx.body = { cats: embedImages(rows, 'avatar') };
});

// 获取单只猫咪
router.get('/api/cats/:id', async (ctx) => {
  const [rows] = await pool.query('SELECT * FROM cats WHERE id = ?', [ctx.params.id]);
  if (rows.length === 0) {
    ctx.status = 404;
    ctx.body = { error: '未找到该猫咪' };
    return;
  }
  ctx.body = { cat: embedImages(rows, 'avatar')[0] };
});

// --- 用户登录 ---

// 用户名+密码登录
router.post('/api/login', async (ctx) => {
  const { username, password } = ctx.request.body || {};
  if (!username || !password) {
    ctx.status = 400;
    ctx.body = { error: '请输入用户名和密码' };
    return;
  }
  
  const [users] = await pool.query('SELECT * FROM users WHERE nickname = ?', [username]);
  if (users.length === 0) {
    ctx.status = 403;
    ctx.body = { error: '用户名或密码错误' };
    return;
  }
  
  const user = users[0];
  if (password !== user.password) {
    ctx.status = 403;
    ctx.body = { error: '用户名或密码错误' };
    return;
  }
  
  if (!user.approved) {
    ctx.status = 403;
    ctx.body = { error: '账号正在等待管理员审核', pending: true };
    return;
  }
  
  const token = signToken(user);
  ctx.body = { token, user: { id: user.id, nickname: user.nickname, role: user.role, approved: user.approved } };
});

// 用户注册
router.post('/api/register', async (ctx) => {
  const { username, password } = ctx.request.body || {};
  if (!username || !password) {
    ctx.status = 400;
    ctx.body = { error: '请输入用户名和密码' };
    return;
  }
  if (username.length < 2 || username.length > 20) {
    ctx.status = 400;
    ctx.body = { error: '用户名长度需在2-20个字符之间' };
    return;
  }
  if (password.length < 3) {
    ctx.status = 400;
    ctx.body = { error: '密码至少3个字符' };
    return;
  }
  
  const [existing] = await pool.query('SELECT id FROM users WHERE nickname = ?', [username]);
  if (existing.length > 0) {
    ctx.status = 409;
    ctx.body = { error: '该用户名已被注册' };
    return;
  }
  
  const openid = 'usr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const [result] = await pool.query(
    'INSERT INTO users (openid, nickname, password, role, approved) VALUES (?, ?, ?, "user", 0)',
    [openid, username, password]
  );
  
  ctx.body = { id: result.insertId, message: '注册成功，等待管理员审核' };
});

// 获取当前用户信息
router.get('/api/me', async (ctx) => {
  if (!ctx.user) {
    ctx.status = 401;
    ctx.body = { error: '未登录' };
    return;
  }
  const [rows] = await pool.query('SELECT id, nickname, avatar, role, title FROM users WHERE id = ?', [ctx.user.id]);
  if (rows.length === 0) {
    ctx.status = 404;
    ctx.body = { error: '用户不存在' };
    return;
  }
  ctx.body = { user: rows[0] };
});

// 获取我的帖子
router.get('/api/my/posts', async (ctx) => {
  if (!ctx.user) { ctx.status = 401; ctx.body = { error: '未登录' }; return; }
  const [rows] = await pool.query(
    `SELECT p.id, p.cat_id, p.image, p.images, p.text, p.title, p.status, p.created_at,
            p.is_pinned, p.is_spotlight, p.pinned_until, p.volunteer_task_id,
            p.category, p.income_amount, p.expense_amount,
            c.name as cat_name
     FROM posts p
     LEFT JOIN cats c ON p.cat_id = c.id
     WHERE p.user_id = ?
     ORDER BY p.created_at DESC`, [ctx.user.id]
  );
  const stats = { total: rows.length, approved: 0, pending: 0, rejected: 0 };
  rows.forEach(p => { if (p.status === 'approved') stats.approved++;
    else if (p.status === 'pending') stats.pending++;
    else if (p.status === 'rejected') stats.rejected++; });
  const posts = embedImages(rows, 'image').map(p => {
    // 置顶过期的不再显示置顶标签
    if (p.is_pinned && p.pinned_until && new Date(p.pinned_until) < new Date()) {
      p.is_pinned = 0;
    }
    if (!p.images && p.image) p.images = [p.image];
    return p;
  });
  ctx.body = { posts, stats };
});

// --- 帖子相关 ---

// 获取已审核通过的帖子
router.get('/api/posts', async (ctx) => {
  const catId = ctx.query.cat_id;
  let query = `
    SELECT p.id, p.user_id, p.cat_id, p.image, p.images, p.text, p.title, p.created_at,
           p.is_pinned, p.is_spotlight, p.volunteer_task_id, p.category,
           p.income_amount, p.expense_amount,
           u.nickname, u.role, u.title, u.avatar as user_avatar
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.status = 'approved'
  `;
  const params = [];
  if (catId) {
    query += ' AND p.cat_id = ?';
    params.push(catId);
  }
  // 置顶和动态顶部优先（置顶过期的不算），再按时间倒序
  query += ' ORDER BY p.is_spotlight DESC, (p.is_pinned=1 AND (p.pinned_until IS NULL OR p.pinned_until >= NOW())) DESC, p.created_at DESC LIMIT 50';
  const [rows] = await pool.query(query, params);
  const posts = embedImages(rows, 'image').map(p => {
    // 置顶过期的不再显示置顶标签
    if (p.is_pinned && p.pinned_until && new Date(p.pinned_until) < new Date()) {
      p.is_pinned = 0;
    }
    if (!p.images && p.image) p.images = [p.image];
    return p;
  });
  ctx.body = { posts };
});

// 获取单个帖子详情
router.get('/api/posts/post/:id', async (ctx) => {
  const [rows] = await pool.query(`
    SELECT p.id, p.user_id, p.cat_id, p.image, p.images, p.text, p.title, p.created_at,
           p.is_pinned, p.is_spotlight, p.pinned_until, p.volunteer_task_id, p.category, p.income_amount, p.expense_amount, c.name as cat_name,
           u.nickname, u.role, u.title, u.avatar as user_avatar
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN cats c ON p.cat_id = c.id
    WHERE p.id = ? AND p.status = 'approved'
  `, [ctx.params.id]);
  
  if (rows.length === 0) {
    ctx.status = 404;
    ctx.body = { error: '帖子不存在' };
    return;
  }
  
  const post = embedImages(rows, 'image')[0];
  // 置顶过期的不再显示置顶标签
  if (post.is_pinned && post.pinned_until && new Date(post.pinned_until) < new Date()) {
    post.is_pinned = 0;
  }
  if (!post.images && post.image) post.images = [post.image];
  
  ctx.body = { post };
});

// 发布帖子（需登录 + 已审核）
router.post('/api/posts', async (ctx) => {
  if (!ctx.user) {
    ctx.status = 401;
    ctx.body = { error: '请先登录' };
    return;
  }
  
  const [userCheck] = await pool.query('SELECT approved, role FROM users WHERE id = ?', [ctx.user.id]);
  if (userCheck.length === 0) {
    ctx.status = 403;
    ctx.body = { error: '账号不存在' };
    return;
  }
  
  const role = userCheck[0].role;
  const isManager = role === 'rongdada' || role === 'developer';
  const isAdminRole = role === 'admin';
  
  if (!isManager && !isAdminRole && !userCheck[0].approved) {
    ctx.status = 403;
    ctx.body = { error: '你的账号正在等待管理员审核，暂时无法发帖' };
    return;
  }
  
  const { cat_id, text, title, is_pinned, is_spotlight, pinned_until, images: base64Images, category, income_amount, expense_amount } = ctx.request.body || {};
  let image = '';
  let images = [];
  
  if (base64Images && Array.isArray(base64Images)) {
    base64Images.forEach((dataUri, i) => {
      const matches = dataUri.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? '.jpg' : '.' + matches[1];
        const filename = Date.now() + '_' + Math.random().toString(36).slice(2, 6) + ext;
        const destPath = path.join(UPLOAD_DIR, filename);
        fs.writeFileSync(destPath, Buffer.from(matches[2], 'base64'));
        const url = '/uploads/' + filename;
        images.push(url);
        if (i === 0) image = url;
      }
    });
  }
  if (images.length === 0 && ctx.request.files) {
    if (ctx.request.files.image) {
      const file = Array.isArray(ctx.request.files.image) ? ctx.request.files.image[0] : ctx.request.files.image;
      const ext = path.extname(file.originalFilename) || '.jpg';
      const filename = Date.now() + '_' + Math.random().toString(36).slice(2, 6) + ext;
      const destPath = path.join(UPLOAD_DIR, filename);
      fs.renameSync(file.filepath, destPath);
      image = '/uploads/' + filename;
      images.push(image);
    }
    if (ctx.request.files.images) {
      const files = Array.isArray(ctx.request.files.images) ? ctx.request.files.images : [ctx.request.files.images];
      files.forEach(file => {
        const ext = path.extname(file.originalFilename) || '.jpg';
        const filename = Date.now() + '_' + Math.random().toString(36).slice(2, 6) + ext;
        const destPath = path.join(UPLOAD_DIR, filename);
        fs.renameSync(file.filepath, destPath);
        images.push('/uploads/' + filename);
      });
      if (images.length > 0 && !image) image = images[0];
    }
  }
  
  const canAutoApprove = isManager || isAdminRole;
  const status = canAutoApprove ? 'approved' : 'pending';
  const pinVal = isManager ? (is_pinned ? 1 : 0) : 0;
  const spotVal = isManager ? (is_spotlight ? 1 : 0) : 0;
  
  const imagesJson = images.length > 0 ? JSON.stringify(images) : null;
  
  // 只有荣大大/开发者可以设置置顶截止时间
  const pinUntil = (isManager && pinned_until) ? pinned_until : null;
  
  const [result] = await pool.query(
    'INSERT INTO posts (user_id, cat_id, image, images, text, title, status, is_pinned, pinned_until, is_spotlight, category, income_amount, expense_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [ctx.user.id, cat_id || null, image, imagesJson, text || '', title || '', status, pinVal, pinUntil, spotVal, category || null, income_amount || 0, expense_amount || 0]
  );
  
  ctx.body = { 
    id: result.insertId, 
    message: canAutoApprove ? '发布成功' : '发布成功，等待管理员审核',
    status: status
  };
});

// --- 管理员接口 ---

// 获取待审核帖子
router.get('/api/admin/posts/pending', async (ctx) => {
  if (!ctx.user || !['admin','developer','rongdada'].includes(ctx.user.role)) {
    ctx.status = 403;
    ctx.body = { error: '需要管理员权限' };
    return;
  }
  
  const [rows] = await pool.query(`
    SELECT p.id, p.title, p.cat_id, p.image, p.images, p.text, p.created_at, p.status, p.volunteer_task_id, p.category,
           p.income_amount, p.expense_amount,
           p.is_pinned, p.pinned_until,
           u.nickname, u.role, u.title, u.avatar as user_avatar
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.status = 'pending'
    ORDER BY p.created_at DESC
  `);
  ctx.body = { posts: embedImages(rows, 'image') };
});

// 获取所有帖子（管理员查看全部）
router.get('/api/admin/posts/all', async (ctx) => {
  if (!ctx.user || !['admin','developer','rongdada'].includes(ctx.user.role)) {
    ctx.status = 403;
    ctx.body = { error: '需要管理员权限' };
    return;
  }
  
  const [rows] = await pool.query(`
    SELECT p.id, p.title, p.cat_id, p.image, p.images, p.text, p.created_at, p.status, p.volunteer_task_id, p.category,
           p.income_amount, p.expense_amount,
           p.is_pinned, p.pinned_until,
           u.nickname, u.role, u.title, u.avatar as user_avatar
    FROM posts p
    JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC
  `);
  ctx.body = { posts: embedImages(rows, 'image') };
});

// 更新帖子的关联猫咪
router.put('/api/admin/posts/:id/cat', async (ctx) => {
  if (!ctx.user || !['admin','developer','rongdada'].includes(ctx.user.role)) {
    ctx.status = 403;
    ctx.body = { error: '需要管理员权限' };
    return;
  }
  
  const { cat_id } = ctx.request.body;
  const postId = ctx.params.id;
  
  await pool.query('UPDATE posts SET cat_id = ? WHERE id = ?', [cat_id || null, postId]);
  ctx.body = { message: '关联猫咪已更新' };
});

// 审核：通过帖子
router.post('/api/admin/posts/:id/approve', async (ctx) => {
  if (!ctx.user || !['admin','developer','rongdada'].includes(ctx.user.role)) {
    ctx.status = 403;
    ctx.body = { error: '需要管理员权限' };
    return;
  }
  
  await pool.query("UPDATE posts SET status = 'approved' WHERE id = ?", [ctx.params.id]);
  ctx.body = { message: '已审核通过' };
});

// 审核：拒绝帖子
router.post('/api/admin/posts/:id/reject', async (ctx) => {
  if (!ctx.user || !['admin','developer','rongdada'].includes(ctx.user.role)) {
    ctx.status = 403;
    ctx.body = { error: '需要管理员权限' };
    return;
  }
  
  await pool.query("UPDATE posts SET status = 'rejected' WHERE id = ?", [ctx.params.id]);
  ctx.body = { message: '已拒绝' };
});

// 管理员新增猫咪
router.post('/api/admin/cats', async (ctx) => {
  if (!ctx.user || !['admin','developer','rongdada'].includes(ctx.user.role)) {
    ctx.status = 403;
    ctx.body = { error: '需要管理员权限' };
    return;
  }
  
  const { name, gender, color, age, neutered, personality, favorite_food, locations, story, health_status, status } = ctx.request.body || {};
  let avatar = '';
  
  if (ctx.request.files && ctx.request.files.avatar) {
    const file = ctx.request.files.avatar;
    const ext = path.extname(file.originalFilename) || '.jpg';
    const filename = 'cat_' + Date.now() + ext;
    const destPath = path.join(UPLOAD_DIR, filename);
    fs.renameSync(file.filepath, destPath);
    avatar = '/uploads/' + filename;
  }
  
  const [result] = await pool.query(
    'INSERT INTO cats (name, avatar, gender, color, age, neutered, personality, favorite_food, locations, story, health_status, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [name, avatar, gender, color, age, neutered || false, personality, favorite_food, locations, story, health_status, status || '在校']
  );
  
  ctx.body = { id: result.insertId, message: '猫咪添加成功' };
});

// 管理员获取所有猫咪
router.get('/api/admin/cats', async (ctx) => {
  if (!ctx.user || !['admin','developer','rongdada'].includes(ctx.user.role)) {
    ctx.status = 403;
    ctx.body = { error: '需要管理员权限' };
    return;
  }
  const [rows] = await pool.query('SELECT * FROM cats ORDER BY id');
  ctx.body = { cats: embedImages(rows, 'avatar') };
});

// 管理员更新猫咪
router.put('/api/admin/cats/:id', async (ctx) => {
  if (!ctx.user || !['admin','developer','rongdada'].includes(ctx.user.role)) {
    ctx.status = 403;
    ctx.body = { error: '需要管理员权限' };
    return;
  }
  const { name, gender, color, age, neutered, personality, favorite_food, locations, story, health_status, status } = ctx.request.body || {};
  
  let fields = [];
  let values = [];
  const setField = (key, val) => { if (val !== undefined) { fields.push(key + '=?'); values.push(val); } };
  setField('name', name);
  setField('gender', gender);
  setField('color', color);
  setField('age', age);
  setField('neutered', neutered === 'true' || neutered === true ? 1 : 0);
  setField('personality', personality);
  setField('favorite_food', favorite_food);
  setField('locations', locations);
  setField('story', story);
  setField('health_status', health_status);
  setField('status', status);
  
  let avatar = ctx.request.body.avatar || '';
  if (ctx.request.files && ctx.request.files.avatar) {
    const file = ctx.request.files.avatar;
    const ext = path.extname(file.originalFilename) || '.jpg';
    const filename = 'cat_' + Date.now() + ext;
    const destPath = path.join(UPLOAD_DIR, filename);
    fs.renameSync(file.filepath, destPath);
    avatar = '/uploads/' + filename;
    fields.push('avatar=?');
    values.push(avatar);
  }
  
  if (fields.length === 0) {
    ctx.body = { message: '没有需要更新的字段' };
    return;
  }
  
  values.push(ctx.params.id);
  await pool.query('UPDATE cats SET ' + fields.join(',') + ' WHERE id=?', values);
  ctx.body = { message: '猫咪信息已更新' };
});

// 微信 uploadFile 只支持 POST，所以加一条同样的路由
router.post('/api/admin/cats/:id', async (ctx) => {
  if (!ctx.user || !['admin','developer','rongdada'].includes(ctx.user.role)) {
    ctx.status = 403;
    ctx.body = { error: '需要管理员权限' };
    return;
  }
  const bodyFields = ctx.request.body || {};
  const { name, gender, color, age, neutered, personality, favorite_food, locations, story, health_status, status } = bodyFields;
  
  let fields = [];
  let values = [];
  const setField = (key, val) => { if (val !== undefined && val !== '') { fields.push(key + '=?'); values.push(val); } };
  setField('name', name);
  setField('gender', gender);
  setField('color', color);
  setField('age', age);
  setField('neutered', neutered === 'true' || neutered === true ? 1 : 0);
  setField('personality', personality);
  setField('favorite_food', favorite_food);
  setField('locations', locations);
  setField('story', story);
  setField('health_status', health_status);
  setField('status', status);
  
  if (ctx.request.files && ctx.request.files.avatar) {
    const file = ctx.request.files.avatar;
    const ext = path.extname(file.originalFilename) || '.jpg';
    const filename = 'cat_' + Date.now() + ext;
    const destPath = path.join(UPLOAD_DIR, filename);
    fs.renameSync(file.filepath, destPath);
    fields.push('avatar=?');
    values.push('/uploads/' + filename);
  }
  
  if (fields.length > 0) {
    values.push(ctx.params.id);
    await pool.query('UPDATE cats SET ' + fields.join(',') + ' WHERE id=?', values);
  }
  ctx.body = { message: '猫咪信息已更新' };
});

// 管理员删除猫咪（仅荣大大/开发者）
router.delete('/api/admin/cats/:id', async (ctx) => {
  if (!ctx.user || !['developer','rongdada'].includes(ctx.user.role)) {
    ctx.status = 403;
    ctx.body = { error: '权限不足' };
    return;
  }
  await pool.query('DELETE FROM cats WHERE id = ?', [ctx.params.id]);
  ctx.body = { message: '猫咪已删除' };
});

// 管理员删除帖子（仅荣大大/开发者；用户删除自己帖子走 DELETE /api/posts/:id）
router.delete('/api/admin/posts/:id', async (ctx) => {
  if (!ctx.user || !['developer','rongdada'].includes(ctx.user.role)) {
    ctx.status = 403;
    ctx.body = { error: '权限不足' };
    return;
  }
  await pool.query('DELETE FROM posts WHERE id = ?', [ctx.params.id]);
  ctx.body = { message: '帖子已删除' };
});

// 删除帖子（自己的帖子或开发者/荣大大删除任意帖子）
router.delete('/api/posts/:id', async (ctx) => {
  if (!ctx.user) {
    ctx.status = 401;
    ctx.body = { error: '请先登录' };
    return;
  }
  const [rows] = await pool.query('SELECT user_id FROM posts WHERE id = ?', [ctx.params.id]);
  if (rows.length === 0) {
    ctx.status = 404;
    ctx.body = { error: '帖子不存在' };
    return;
  }
  const isOwner = rows[0].user_id === ctx.user.id;
  const isAdminManager = ['developer','rongdada'].includes(ctx.user.role);
  if (!isOwner && !isAdminManager) {
    ctx.status = 403;
    ctx.body = { error: '无权删除此帖子' };
    return;
  }
  await pool.query('DELETE FROM posts WHERE id = ?', [ctx.params.id]);
  ctx.body = { message: '帖子已删除' };
});

// 编辑帖子（仅荣大大/开发者）
router.put('/api/posts/:id', async (ctx) => {
  if (!ctx.user) {
    ctx.status = 401;
    ctx.body = { error: '请先登录' };
    return;
  }
  if (ctx.user.role !== 'rongdada' && ctx.user.role !== 'developer') {
    ctx.status = 403;
    ctx.body = { error: '无权编辑帖子' };
    return;
  }
  const [rows] = await pool.query('SELECT id FROM posts WHERE id = ?', [ctx.params.id]);
  if (rows.length === 0) {
    ctx.status = 404;
    ctx.body = { error: '帖子不存在' };
    return;
  }
  const { title, text, is_spotlight, is_pinned, pinned_until, income_amount, expense_amount } = ctx.request.body || {};
  let fields = [], values = [];
  if (title !== undefined) { fields.push('title=?'); values.push(title); }
  if (text !== undefined) { fields.push('text=?'); values.push(text); }
  if (is_spotlight !== undefined) { fields.push('is_spotlight=?'); values.push(is_spotlight ? 1 : 0); }
  if (is_pinned !== undefined) { fields.push('is_pinned=?'); values.push(is_pinned ? 1 : 0); }
  if (pinned_until !== undefined) { fields.push('pinned_until=?'); values.push(pinned_until || null); }
  if (income_amount !== undefined) { fields.push('income_amount=?'); values.push(income_amount); }
  if (expense_amount !== undefined) { fields.push('expense_amount=?'); values.push(expense_amount); }
  if (fields.length === 0) {
    ctx.status = 400;
    ctx.body = { error: '没有需要更新的字段' };
    return;
  }
  values.push(ctx.params.id);
  await pool.query('UPDATE posts SET ' + fields.join(',') + ' WHERE id=?', values);
  ctx.body = { message: '帖子已更新' };
});

// 管理员获取待审核用户（仅荣大大/开发者）
router.get('/api/admin/users/pending', async (ctx) => {
  if (!ctx.user || !['developer','rongdada'].includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const [rows] = await pool.query('SELECT id, nickname, created_at FROM users WHERE role="user" AND approved=0 ORDER BY created_at DESC');
  ctx.body = { users: rows };
});

// 管理员获取所有用户（仅荣大大/开发者）
router.get('/api/admin/users', async (ctx) => {
  if (!ctx.user || !['developer','rongdada'].includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const [rows] = await pool.query('SELECT id, nickname, role, approved, title, created_at FROM users ORDER BY created_at DESC');
  ctx.body = { users: rows };
});

// 管理员审核通过用户（仅荣大大/开发者）
router.post('/api/admin/users/:id/approve', async (ctx) => {
  if (!ctx.user || !['developer','rongdada'].includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  await pool.query('UPDATE users SET approved=1 WHERE id=?', [ctx.params.id]);
  ctx.body = { message: '用户已通过审核' };
});

// 管理员更新用户信息（仅荣大大/开发者）
router.put('/api/admin/users/:id', async (ctx) => {
  if (!ctx.user || (!['developer','rongdada'].includes(ctx.user.role))) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const { nickname, role, password, title } = ctx.request.body || {};
  if (!nickname && !role && !password && title === undefined) { ctx.status = 400; ctx.body = { error: '没有需要修改的字段' }; return; }
  let fields = [], values = [];
  if (nickname) { fields.push('nickname=?'); values.push(nickname); }
  if (role) { fields.push('role=?'); values.push(role); }
  if (password) { fields.push('password=?'); values.push(password); }
  if (title !== undefined) { fields.push('title=?'); values.push(title || null); }
  values.push(ctx.params.id);
  await pool.query('UPDATE users SET ' + fields.join(',') + ' WHERE id=?', values);
  ctx.body = { message: '用户信息已更新' };
});

// 管理员撤销管理员/开发者权限（仅荣大大/开发者）
router.post('/api/admin/users/:id/revoke', async (ctx) => {
  if (!ctx.user || (!['developer','rongdada'].includes(ctx.user.role))) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const [targets] = await pool.query('SELECT id, role FROM users WHERE id=?', [ctx.params.id]);
  if (targets.length === 0) { ctx.status = 404; ctx.body = { error: '用户不存在' }; return; }
  const target = targets[0];
  if (target.id == ctx.user.id) { ctx.status = 400; ctx.body = { error: '不能撤销自己的权限' }; return; }
  if (target.role === 'developer') { ctx.status = 403; ctx.body = { error: '开发者权限不可被任何人撤销' }; return; }
  if (ctx.user.role !== 'developer' && target.role === 'rongdada') { ctx.status = 403; ctx.body = { error: '仅开发者可撤销荣大大权限' }; return; }
  if (target.role === 'user') { ctx.status = 400; ctx.body = { error: '该用户已经是普通用户' }; return; }
  await pool.query('UPDATE users SET role="user" WHERE id=?', [ctx.params.id]);
  ctx.body = { message: '已撤销' + (target.role === 'developer' ? '开发者' : target.role === 'rongdada' ? '荣大大' : '管理员') + '权限' };
});

// 管理员拒绝/删除用户（仅荣大大/开发者）
router.delete('/api/admin/users/:id', async (ctx) => {
  if (!ctx.user || !['developer','rongdada'].includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  await pool.query('DELETE FROM users WHERE id=?', [ctx.params.id]);
  ctx.body = { message: '用户已删除' };
});

// 用户申请成为管理员（受开关控制）
router.post('/api/apply-admin', async (ctx) => {
  if (!ctx.user) { ctx.status = 401; ctx.body = { error: '请先登录' }; return; }
  if (ctx.user.role === 'admin' || ctx.user.role === 'developer') { ctx.status = 400; ctx.body = { error: '你已经是管理员/开发者了' }; return; }
  const [setting] = await pool.query('SELECT `value` FROM settings WHERE `key`="admin_applications_open"');
  if (setting.length > 0 && setting[0].value !== '1') { ctx.status = 403; ctx.body = { error: '目前暂未开放管理员申请' }; return; }
  await pool.query('UPDATE users SET applying_admin=1 WHERE id=?', [ctx.user.id]);
  ctx.body = { message: '申请已提交，等待管理员审核' };
});

// 开发者 - 获取所有用户含密码
router.get('/api/dev/users', async (ctx) => {
  if (!ctx.user || ctx.user.role !== 'developer') { ctx.status = 403; ctx.body = { error: '仅开发者可访问' }; return; }
  const [rows] = await pool.query('SELECT id, nickname, password, role, approved, title, created_at FROM users ORDER BY id');
  ctx.body = { users: rows };
});

// 开发者 - 更新用户信息
router.put('/api/dev/users/:id', async (ctx) => {
  if (!ctx.user || ctx.user.role !== 'developer') { ctx.status = 403; ctx.body = { error: '仅开发者可访问' }; return; }
  const { nickname, password, role, title } = ctx.request.body || {};
  let fields = [], values = [];
  if (nickname) { fields.push('nickname=?'); values.push(nickname); }
  if (password) { fields.push('password=?'); values.push(password); }
  if (role) { fields.push('role=?'); values.push(role); }
  if (title !== undefined) { fields.push('title=?'); values.push(title || null); }
  if (fields.length > 0) {
    values.push(ctx.params.id);
    await pool.query('UPDATE users SET ' + fields.join(',') + ' WHERE id=?', values);
  }
  ctx.body = { message: '用户信息已更新' };
});

// 开发者仪表盘数据
router.get('/api/dev/dashboard', async (ctx) => {
  if (!ctx.user || ctx.user.role !== 'developer') { ctx.status = 403; ctx.body = { error: '仅开发者可访问' }; return; }
  
  const [tableCount] = await pool.query("SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema='cat_forum'");
  const [catCount] = await pool.query('SELECT COUNT(*) as cnt FROM cats');
  const [userCount] = await pool.query('SELECT COUNT(*) as cnt FROM users');
  const [postCount] = await pool.query('SELECT COUNT(*) as cnt FROM posts');
  const [pendingPosts] = await pool.query("SELECT COUNT(*) as cnt FROM posts WHERE status='pending'");
  const [pendingUsers] = await pool.query('SELECT COUNT(*) as cnt FROM users WHERE approved=0');
  const [adminApps] = await pool.query('SELECT COUNT(*) as cnt FROM users WHERE applying_admin=1');
  const [dbSize] = await pool.query("SELECT ROUND(SUM(data_length + index_length) / 1024, 1) as size_kb FROM information_schema.tables WHERE table_schema='cat_forum'");
  
  const [catStatus] = await pool.query('SELECT status, COUNT(*) as cnt FROM cats GROUP BY status');
  const [postStatus] = await pool.query('SELECT status, COUNT(*) as cnt FROM posts GROUP BY status');
  const [recentUsers] = await pool.query('SELECT nickname, role, created_at FROM users ORDER BY id DESC LIMIT 5');
  const [recentPosts] = await pool.query('SELECT p.text, u.nickname, u.role, p.created_at FROM posts p JOIN users u ON p.user_id=u.id ORDER BY p.id DESC LIMIT 5');
  
  const [catRanking] = await pool.query(
    'SELECT c.name, c.avatar, COUNT(p.id) as post_count FROM cats c LEFT JOIN posts p ON p.cat_id=c.id AND p.status="approved" GROUP BY c.id ORDER BY post_count DESC'
  );
  
  const [dailyPosts] = await pool.query(
    "SELECT DATE(created_at) as date, COUNT(*) as cnt FROM posts WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) GROUP BY DATE(created_at) ORDER BY date"
  );
  const [dailyUsers] = await pool.query(
    "SELECT DATE(created_at) as date, COUNT(*) as cnt FROM users WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) GROUP BY DATE(created_at) ORDER BY date"
  );

  ctx.body = {
    server: {
      node: process.version,
      platform: process.platform,
      uptime: Math.floor(process.uptime()),
      memory: Math.round(process.memoryUsage().rss / 1024 / 1024),
      port: process.env.PORT || 3000
    },
    database: {
      tables: tableCount[0].cnt,
      size_kb: dbSize[0].size_kb || 0,
      connection: process.env.DB_HOST || 'localhost'
    },
    counts: {
      cats: catCount[0].cnt,
      users: userCount[0].cnt,
      posts: postCount[0].cnt,
      pendingPosts: pendingPosts[0].cnt,
      pendingUsers: pendingUsers[0].cnt,
      adminApplications: adminApps[0].cnt
    },
    breakdown: {
      catStatus: catStatus,
      postStatus: postStatus
    },
    recent: {
      users: recentUsers,
      posts: recentPosts
    },
    catRanking: catRanking,
    trends: {
      dailyPosts: dailyPosts,
      dailyUsers: dailyUsers
    }
  };
});

// 获取设置（公开）
router.get('/api/settings', async (ctx) => {
  const [rows] = await pool.query('SELECT * FROM settings');
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  ctx.body = { settings };
});

// 更新设置（仅荣大大/开发者）
router.put('/api/dev/settings', async (ctx) => {
  if (!ctx.user || !['developer','rongdada'].includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const { key, value } = ctx.request.body || {};
  if (!key) { ctx.status = 400; ctx.body = { error: '缺少key' }; return; }
  await pool.query('INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value`=?', [key, value, value]);
  ctx.body = { message: '设置已更新' };
});

// 检查管理员申请是否开放
router.get('/api/settings/admin-applications', async (ctx) => {
  const [rows] = await pool.query('SELECT `value` FROM settings WHERE `key`="admin_applications_open"');
  const open = rows.length > 0 && rows[0].value === '1';
  ctx.body = { open };
});

// 管理员 - 获取申请管理员列表（仅荣大大/开发者）
router.get('/api/admin/applications', async (ctx) => {
  if (!ctx.user || !['developer','rongdada'].includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const [rows] = await pool.query('SELECT id, nickname, created_at FROM users WHERE applying_admin=1 ORDER BY created_at DESC');
  ctx.body = { users: rows };
});

// 管理员 - 批准管理员申请（仅荣大大/开发者）
router.post('/api/admin/applications/:id/approve', async (ctx) => {
  if (!ctx.user || !['developer','rongdada'].includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  await pool.query('UPDATE users SET role="admin", applying_admin=0 WHERE id=?', [ctx.params.id]);
  ctx.body = { message: '已升级为管理员' };
});

// 管理员 - 拒绝管理员申请（仅荣大大/开发者）
router.post('/api/admin/applications/:id/reject', async (ctx) => {
  if (!ctx.user || !['developer','rongdada'].includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  await pool.query('UPDATE users SET applying_admin=0 WHERE id=?', [ctx.params.id]);
  ctx.body = { message: '已拒绝申请' };
});

// ====== 权限帮助函数 ======
const ADMIN_ROLES = ['admin','developer','rongdada'];
const DEV_ROLES = ['developer','rongdada'];
const PUBLISH_VOLUNTEER = ['rongdada'];              // 仅荣大大可发布志愿任务
const MANAGE_PRODUCT = ['developer','rongdada']; // 开发者+荣大大可管理义卖

function requireRole(roles) {
  return (ctx, next) => {
    if (!ctx.user || !roles.includes(ctx.user.role)) {
      ctx.status = 403;
      ctx.body = { error: '权限不足' };
      return null;
    }
    return next();
  };
}

// ====== 义卖商品 API ======

// 获取所有在售商品（公开）
router.get('/api/products', async (ctx) => {
  const [rows] = await pool.query("SELECT * FROM products WHERE status='on_sale' ORDER BY created_at DESC");
  ctx.body = { products: embedImages(rows, 'image') };
});

// 获取单件商品
router.get('/api/products/:id', async (ctx) => {
  const [rows] = await pool.query('SELECT * FROM products WHERE id=?', [ctx.params.id]);
  if (rows.length === 0) { ctx.status = 404; ctx.body = { error: '商品不存在' }; return; }
  ctx.body = { product: embedImages(rows, 'image')[0] };
});

// 管理员获取所有商品（含下架的）
router.get('/api/admin/products', async (ctx) => {
  if (!ctx.user || !MANAGE_PRODUCT.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const [rows] = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
  ctx.body = { products: embedImages(rows, 'image') };
});

// 新增商品
router.post('/api/admin/products', async (ctx) => {
  if (!ctx.user || !MANAGE_PRODUCT.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const { name, description, price, category } = ctx.request.body || {};
  if (!name) { ctx.status = 400; ctx.body = { error: '请输入商品名称' }; return; }
  let image = '';
  if (ctx.request.files && ctx.request.files.image) {
    const file = ctx.request.files.image;
    const ext = path.extname(file.originalFilename) || '.jpg';
    const filename = 'prod_' + Date.now() + ext;
    const destPath = path.join(UPLOAD_DIR, filename);
    fs.renameSync(file.filepath, destPath);
    image = '/uploads/' + filename;
  }
  const [result] = await pool.query(
    'INSERT INTO products (name, description, price, image, category, created_by) VALUES (?,?,?,?,?,?)',
    [name, description||'', price||0, image, category||'', ctx.user.id]
  );
  ctx.body = { id: result.insertId, message: '商品已上架' };
});

// 更新商品
router.put('/api/admin/products/:id', async (ctx) => {
  if (!ctx.user || !MANAGE_PRODUCT.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const { name, description, price, category, status } = ctx.request.body || {};
  let fields = [], values = [];
  if (name !== undefined) { fields.push('name=?'); values.push(name); }
  if (description !== undefined) { fields.push('description=?'); values.push(description); }
  if (price !== undefined) { fields.push('price=?'); values.push(price); }
  if (category !== undefined) { fields.push('category=?'); values.push(category); }
  if (status !== undefined) { fields.push('status=?'); values.push(status); }
  if (ctx.request.files && ctx.request.files.image) {
    const file = ctx.request.files.image;
    const ext = path.extname(file.originalFilename) || '.jpg';
    const filename = 'prod_' + Date.now() + ext;
    const destPath = path.join(UPLOAD_DIR, filename);
    fs.renameSync(file.filepath, destPath);
    fields.push('image=?');
    values.push('/uploads/' + filename);
  }
  if (fields.length === 0) { ctx.body = { message: '没有需要更新的字段' }; return; }
  values.push(ctx.params.id);
  await pool.query('UPDATE products SET ' + fields.join(',') + ' WHERE id=?', values);
  ctx.body = { message: '商品已更新' };
});

// 删除商品
router.delete('/api/admin/products/:id', async (ctx) => {
  if (!ctx.user || !MANAGE_PRODUCT.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  await pool.query('DELETE FROM products WHERE id=?', [ctx.params.id]);
  ctx.body = { message: '商品已删除' };
});

// ====== 志愿任务 API ======

// 获取正在招募的志愿任务（公开）
router.get('/api/volunteer/tasks', async (ctx) => {
  const [rows] = await pool.query("SELECT * FROM volunteer_tasks WHERE status='recruiting' ORDER BY created_at DESC");
  ctx.body = { tasks: rows };
});

// 获取所有志愿任务（含已截止的 — 荣大大/开发者可见）
router.get('/api/admin/volunteer/tasks', async (ctx) => {
  if (!ctx.user || !DEV_ROLES.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const [rows] = await pool.query(`SELECT vt.*, u.nickname as creator_name,
    (SELECT COUNT(*) FROM volunteer_applications va WHERE va.task_id=vt.id AND va.status='pending') as pending_apps
    FROM volunteer_tasks vt LEFT JOIN users u ON vt.created_by=u.id ORDER BY vt.created_at DESC`);
  ctx.body = { tasks: rows };
});

// 获取单个任务详情
router.get('/api/volunteer/tasks/:id', async (ctx) => {
  const [rows] = await pool.query('SELECT * FROM volunteer_tasks WHERE id=?', [ctx.params.id]);
  if (rows.length === 0) { ctx.status = 404; ctx.body = { error: '任务不存在' }; return; }
  ctx.body = { task: rows[0] };
});

// 发布志愿任务（仅荣大大）
router.post('/api/admin/volunteer/tasks', async (ctx) => {
  if (!ctx.user || !PUBLISH_VOLUNTEER.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const { title, description, location, date_time, deadline, slots_needed } = ctx.request.body || {};
  if (!title) { ctx.status = 400; ctx.body = { error: '请输入任务标题' }; return; }
  const [result] = await pool.query(
    'INSERT INTO volunteer_tasks (title, description, location, date_time, deadline, slots_needed, created_by) VALUES (?,?,?,?,?,?,?)',
    [title, description||'', location||'', date_time||null, deadline||null, slots_needed||1, ctx.user.id]
  );
  const taskId = result.insertId;
  const postText = '📢 新的志愿活动「' + title + '」已发布！\n活动时间：' + (date_time || '待确定') + '\n活动地点：' + (location || '待确定') + '\n需要人数：' + (slots_needed || 1) + ' 人\n\n' + (description || '');
  await pool.query(
    "INSERT INTO posts (user_id, title, text, status, is_spotlight, volunteer_task_id, category) VALUES (?, ?, ?, 'approved', 0, ?, '志愿者')",
    [ctx.user.id, '有新的志愿任务发布了', postText, taskId]
  );
  ctx.body = { id: taskId, message: '志愿任务已发布' };
});

// 更新志愿任务（仅荣大大）
router.put('/api/admin/volunteer/tasks/:id', async (ctx) => {
  if (!ctx.user || !PUBLISH_VOLUNTEER.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const { title, description, location, date_time, deadline, slots_needed, status } = ctx.request.body || {};
  let fields = [], values = [];
  if (title !== undefined) { fields.push('title=?'); values.push(title); }
  if (description !== undefined) { fields.push('description=?'); values.push(description); }
  if (location !== undefined) { fields.push('location=?'); values.push(location); }
  if (date_time !== undefined) { fields.push('date_time=?'); values.push(date_time); }
  if (deadline !== undefined) { fields.push('deadline=?'); values.push(deadline); }
  if (slots_needed !== undefined) { fields.push('slots_needed=?'); values.push(slots_needed); }
  if (status !== undefined) { fields.push('status=?'); values.push(status); }
  if (fields.length === 0) { ctx.body = { message: '没有需要更新的字段' }; return; }
  values.push(ctx.params.id);
  await pool.query('UPDATE volunteer_tasks SET ' + fields.join(',') + ' WHERE id=?', values);
  ctx.body = { message: '任务已更新' };
});

// 删除志愿任务（开发者+荣大大）
router.delete('/api/admin/volunteer/tasks/:id', async (ctx) => {
  if (!ctx.user || !DEV_ROLES.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  await pool.query('DELETE FROM volunteer_applications WHERE task_id=?', [ctx.params.id]);
  await pool.query('DELETE FROM volunteer_tasks WHERE id=?', [ctx.params.id]);
  ctx.body = { message: '任务已删除' };
});

// ====== 志愿者报名 API ======

// 用户报名（学生和管理员可报名）
router.post('/api/volunteer/apply', async (ctx) => {
  if (!ctx.user) { ctx.status = 401; ctx.body = { error: '请先登录' }; return; }
  const [userCheck] = await pool.query('SELECT role, approved FROM users WHERE id=?', [ctx.user.id]);
  if (userCheck.length === 0 || !userCheck[0].approved) { ctx.status = 403; ctx.body = { error: '账号未审核通过' }; return; }
  if (userCheck[0].role !== 'user' && userCheck[0].role !== 'admin') { ctx.status = 403; ctx.body = { error: '仅学生和管理员可报名' }; return; }
  
  const { task_id, contact_info, note } = ctx.request.body || {};
  if (!task_id) { ctx.status = 400; ctx.body = { error: '缺少任务ID' }; return; }
  
  const [taskCheck] = await pool.query("SELECT id, slots_needed, slots_filled, status FROM volunteer_tasks WHERE id=? AND status='recruiting'", [task_id]);
  if (taskCheck.length === 0) { ctx.status = 404; ctx.body = { error: '任务不存在或已截止' }; return; }
  if (taskCheck[0].slots_filled >= taskCheck[0].slots_needed) { ctx.status = 400; ctx.body = { error: '报名人数已满' }; return; }
  
  const [existing] = await pool.query('SELECT id FROM volunteer_applications WHERE task_id=? AND user_id=?', [task_id, ctx.user.id]);
  if (existing.length > 0) { ctx.status = 409; ctx.body = { error: '你已经报名过这个任务了' }; return; }
  
  const [result] = await pool.query(
    'INSERT INTO volunteer_applications (task_id, user_id, contact_info, note) VALUES (?,?,?,?)',
    [task_id, ctx.user.id, contact_info||'', note||'']
  );
  await pool.query('UPDATE volunteer_tasks SET slots_filled = slots_filled + 1 WHERE id=?', [task_id]);
  
  ctx.body = { id: result.insertId, message: '报名成功' };
});

// 获取我的报名（当前用户）
router.get('/api/volunteer/my-applications', async (ctx) => {
  if (!ctx.user) { ctx.status = 401; ctx.body = { error: '请先登录' }; return; }
  const [rows] = await pool.query(
    `SELECT va.*, vt.title as task_title, vt.date_time, vt.location, vt.status as task_status
     FROM volunteer_applications va
     JOIN volunteer_tasks vt ON va.task_id=vt.id
     WHERE va.user_id=?
     ORDER BY va.created_at DESC`, [ctx.user.id]
  );
  ctx.body = { applications: rows };
});

// 管理员查看某个任务的报名列表（荣大大/开发者）
router.get('/api/admin/volunteer/applications/:taskId', async (ctx) => {
  if (!ctx.user || !DEV_ROLES.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const [rows] = await pool.query(
    `SELECT va.*, u.nickname FROM volunteer_applications va
     JOIN users u ON va.user_id=u.id
     WHERE va.task_id=?
     ORDER BY va.created_at DESC`, [ctx.params.taskId]
  );
  ctx.body = { applications: rows };
});

// 管理员查看所有报名记录（荣大大/开发者）
router.get('/api/admin/volunteer/applications', async (ctx) => {
  if (!ctx.user || !DEV_ROLES.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const [rows] = await pool.query(
    `SELECT va.*, u.nickname, vt.title as task_title FROM volunteer_applications va
     JOIN users u ON va.user_id=u.id
     JOIN volunteer_tasks vt ON va.task_id=vt.id
     ORDER BY va.created_at DESC`
  );
  ctx.body = { applications: rows };
});

// 管理员确认/更新报名状态（荣大大/开发者）
router.put('/api/admin/volunteer/applications/:id', async (ctx) => {
  if (!ctx.user || !DEV_ROLES.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const { status } = ctx.request.body || {};
  if (!status) { ctx.status = 400; ctx.body = { error: '缺少状态' }; return; }
  await pool.query('UPDATE volunteer_applications SET status=? WHERE id=?', [status, ctx.params.id]);
  ctx.body = { message: '报名状态已更新' };
});

// ====== 关于我们内容 API ======

// 获取关于我们页面数据
router.get('/api/about', async (ctx) => {
  const [rows] = await pool.query('SELECT * FROM settings WHERE `key` LIKE "about_%"');
  const data = {};
  rows.forEach(r => data[r.key.replace('about_', '')] = r.value);
  ctx.body = { about: data };
});

// 更新关于我们内容（荣大大+开发者）
router.put('/api/admin/about', async (ctx) => {
  if (!ctx.user || !DEV_ROLES.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const { sections } = ctx.request.body || {};
  if (!sections || !Array.isArray(sections)) { ctx.status = 400; ctx.body = { error: '缺少sections' }; return; }
  for (const s of sections) {
    await pool.query(
      'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value`=?',
      ['about_' + s.key, s.value, s.value]
    );
  }
  ctx.body = { message: '关于我们内容已更新' };
});

// 待处理事项汇总
router.get('/api/pending-summary', async (ctx) => {
  if (!ctx.user || !['admin','developer','rongdada'].includes(ctx.user.role)) {
    ctx.status = 403; ctx.body = { error: '权限不足' }; return;
  }
  
  const [pendingPosts] = await pool.query("SELECT COUNT(*) as cnt FROM posts WHERE status='pending'");
  
  if (ctx.user.role === 'admin') {
    ctx.body = {
      pendingPosts: pendingPosts[0].cnt,
      pendingUsers: 0,
      adminApplications: 0,
      pendingVolunteerApps: 0
    };
    return;
  }
  
  const [pendingUsers] = await pool.query('SELECT COUNT(*) as cnt FROM users WHERE approved=0');
  const [adminApps] = await pool.query('SELECT COUNT(*) as cnt FROM users WHERE applying_admin=1');
  const [pendingVolApps] = await pool.query(
    "SELECT COUNT(*) as cnt FROM volunteer_applications va JOIN volunteer_tasks vt ON va.task_id=vt.id WHERE va.status='pending'"
  );
  
  ctx.body = {
    pendingPosts: pendingPosts[0].cnt,
    pendingUsers: pendingUsers[0].cnt,
    adminApplications: adminApps[0].cnt,
    pendingVolunteerApps: pendingVolApps[0].cnt
  };
});

// ====== 意见反馈 API ======

// 提交反馈（所有登录用户）
router.post('/api/feedback', async (ctx) => {
  if (!ctx.user) { ctx.status = 401; ctx.body = { error: '请先登录' }; return; }
  const { content, type } = ctx.request.body || {};
  if (!content) { ctx.status = 400; ctx.body = { error: '请输入反馈内容' }; return; }
  const feedbackType = ['suggestion','bug','other'].includes(type) ? type : 'suggestion';
  await pool.query('INSERT INTO feedback (user_id, content, type) VALUES (?, ?, ?)', [ctx.user.id, content, feedbackType]);
  ctx.body = { message: '反馈已提交，谢谢！' };
});

// 获取当前用户自己的反馈
router.get('/api/feedback/my', async (ctx) => {
  if (!ctx.user) { ctx.status = 401; ctx.body = { error: '请先登录' }; return; }
  const [rows] = await pool.query('SELECT id, content, type, status, reply, created_at FROM feedback WHERE user_id=? ORDER BY created_at DESC', [ctx.user.id]);
  ctx.body = { feedback: rows };
});

// 开发者获取所有反馈
router.get('/api/feedback', async (ctx) => {
  if (!ctx.user || ctx.user.role !== 'developer') { ctx.status = 403; ctx.body = { error: '仅开发者可查看' }; return; }
  const [rows] = await pool.query('SELECT f.id, f.content, f.type, f.status, f.reply, f.created_at, u.nickname FROM feedback f LEFT JOIN users u ON f.user_id=u.id ORDER BY f.status ASC, f.created_at DESC');
  ctx.body = { feedback: rows };
});

// 开发者标记反馈为已处理
router.put('/api/feedback/:id/resolve', async (ctx) => {
  if (!ctx.user || ctx.user.role !== 'developer') { ctx.status = 403; ctx.body = { error: '仅开发者可操作' }; return; }
  const id = parseInt(ctx.params.id);
  if (!id) { ctx.status = 400; ctx.body = { error: '参数错误' }; return; }
  await pool.query("UPDATE feedback SET status='resolved' WHERE id=?", [id]);
  ctx.body = { message: '已标记为已处理' };
});

// ====== 商品类别管理 API ======

// 获取所有商品类别
router.get('/api/admin/product-categories', async (ctx) => {
  if (!ctx.user || !MANAGE_PRODUCT.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const [rows] = await pool.query("SELECT `value` FROM settings WHERE `key`='product_categories'");
  let categories = [];
  if (rows.length > 0 && rows[0].value) {
    try { categories = JSON.parse(rows[0].value); } catch(e) { categories = []; }
  }
  ctx.body = { categories };
});

// 添加类别
router.post('/api/admin/product-categories', async (ctx) => {
  if (!ctx.user || !MANAGE_PRODUCT.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const { name } = ctx.request.body || {};
  if (!name) { ctx.status = 400; ctx.body = { error: '请输入类别名称' }; return; }
  
  const [rows] = await pool.query("SELECT `value` FROM settings WHERE `key`='product_categories'");
  let categories = [];
  if (rows.length > 0 && rows[0].value) {
    try { categories = JSON.parse(rows[0].value); } catch(e) { categories = []; }
  }
  if (categories.includes(name)) { ctx.status = 409; ctx.body = { error: '该类别已存在' }; return; }
  categories.push(name);
  await pool.query(
    'INSERT INTO settings (`key`, `value`) VALUES ("product_categories", ?) ON DUPLICATE KEY UPDATE `value`=?',
    [JSON.stringify(categories), JSON.stringify(categories)]
  );
  ctx.body = { message: '类别已添加', categories };
});

// 删除类别
router.delete('/api/admin/product-categories/:name', async (ctx) => {
  if (!ctx.user || !MANAGE_PRODUCT.includes(ctx.user.role)) { ctx.status = 403; ctx.body = { error: '权限不足' }; return; }
  const name = decodeURIComponent(ctx.params.name);
  
  const [rows] = await pool.query("SELECT `value` FROM settings WHERE `key`='product_categories'");
  let categories = [];
  if (rows.length > 0 && rows[0].value) {
    try { categories = JSON.parse(rows[0].value); } catch(e) { categories = []; }
  }
  categories = categories.filter(c => c !== name);
  await pool.query(
    'INSERT INTO settings (`key`, `value`) VALUES ("product_categories", ?) ON DUPLICATE KEY UPDATE `value`=?',
    [JSON.stringify(categories), JSON.stringify(categories)]
  );
  ctx.body = { message: '类别已删除', categories };
});

// ====== 注册路由并启动 ======
app.use(router.routes());
app.use(router.allowedMethods());

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐱 公益社小猫小程序后端已启动 → http://localhost:${PORT}`);
  console.log(`📸 上传图片访问 → http://localhost:${PORT}/uploads/`);
  console.log(`👤 管理员登录昵称: 管理员`);
});
