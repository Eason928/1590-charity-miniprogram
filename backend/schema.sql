-- =====================================================================
--  1590 公益社小程序 —— 数据库结构（库名：cat_forum）
-- ---------------------------------------------------------------------
--  来源   : 本地 MariaDB 11.7 用 mariadb-dump --no-data 导出
--  用途   : 交接 / 换电脑部署时重建数据库结构
--
--  说明：
--   1. 本文件只含【表结构】，不含任何数据。
--      刻意不导出 users / student_roster 的数据，避免泄露用户密码与学生名单。
--   2. 原始库中 student_roster 用的是 MariaDB 专有排序规则
--      utf8mb4_uca1400_ai_ci，在 MySQL 上不存在会导致导入失败。
--      这里已统一改成通用的 utf8mb4_unicode_ci，MySQL 8 / MariaDB 均可导入。
--   3. 末尾的 feedback 表为【按代码里的 SQL 语句还原】——
--      原始库中并没有这张表，但后端有 5 个 /api/feedback 接口在用它，
--      所以必须补上，否则「意见反馈」功能会报表不存在。
--
--  导入方法（先建库，再导入）：
--    mysql -u root -p -e "CREATE DATABASE cat_forum DEFAULT CHARACTER SET utf8mb4;"
--    mysql -u root -p cat_forum < schema.sql
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- users：用户表（学生 / 管理员 / 开发者 / 荣大大）
-- ---------------------------------------------------------------------
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `openid` varchar(100) NOT NULL,
  `student_id` varchar(50) DEFAULT NULL,
  `nickname` varchar(50) DEFAULT '',
  `avatar` varchar(300) DEFAULT '',
  `password` varchar(100) DEFAULT '',
  `password_reset_required` tinyint(1) DEFAULT 0,
  `role` enum('user','admin','developer','rongdada') DEFAULT 'user',
  `approved` tinyint(1) DEFAULT 1,
  `applying_admin` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `openid` (`openid`),
  UNIQUE KEY `uk_student_id` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- student_roster：学生花名册（首次登录用学号+初始密码验证）
-- ---------------------------------------------------------------------
CREATE TABLE `student_roster` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `student_id` varchar(50) NOT NULL,
  `name` varchar(50) NOT NULL DEFAULT '',
  `password` varchar(100) NOT NULL DEFAULT '',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `student_id` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- cats：猫咪图鉴
-- ---------------------------------------------------------------------
CREATE TABLE `cats` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `avatar` varchar(300) DEFAULT '',
  `gender` varchar(10) DEFAULT '',
  `color` varchar(50) DEFAULT '',
  `age` varchar(50) DEFAULT '',
  `neutered` tinyint(1) DEFAULT 0,
  `personality` text DEFAULT NULL,
  `favorite_food` text DEFAULT NULL,
  `locations` text DEFAULT NULL,
  `story` text DEFAULT NULL,
  `health_status` varchar(100) DEFAULT '',
  `status` varchar(20) DEFAULT '在校',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- posts：论坛帖子（需审核，可置顶 / 加精）
-- ---------------------------------------------------------------------
CREATE TABLE `posts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `cat_id` int(11) DEFAULT NULL,
  `image` varchar(300) DEFAULT '',
  `images` text DEFAULT NULL,
  `text` text DEFAULT NULL,
  `title` varchar(200) DEFAULT '',
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `is_pinned` tinyint(1) NOT NULL DEFAULT 0,
  `pinned_until` datetime DEFAULT NULL,
  `is_spotlight` tinyint(1) NOT NULL DEFAULT 0,
  `volunteer_task_id` int(11) DEFAULT NULL,
  `category` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `idx_volunteer_task` (`volunteer_task_id`),
  CONSTRAINT `posts_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- products：爱心义卖商品
-- ---------------------------------------------------------------------
CREATE TABLE `products` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `price` decimal(10,2) DEFAULT 0.00,
  `image` varchar(300) DEFAULT '',
  `category` varchar(50) DEFAULT '',
  `status` enum('on_sale','sold_out','hidden') DEFAULT 'on_sale',
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- volunteer_tasks：志愿活动任务
-- ---------------------------------------------------------------------
CREATE TABLE `volunteer_tasks` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `location` varchar(200) DEFAULT '',
  `date_time` datetime DEFAULT NULL,
  `deadline` datetime DEFAULT NULL,
  `slots_needed` int(11) DEFAULT 1,
  `slots_filled` int(11) DEFAULT 0,
  `status` enum('recruiting','closed','completed') DEFAULT 'recruiting',
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- volunteer_applications：志愿活动报名
-- ---------------------------------------------------------------------
CREATE TABLE `volunteer_applications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `task_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `contact_info` varchar(200) DEFAULT '',
  `note` text DEFAULT NULL,
  `status` enum('pending','confirmed','attended') DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- settings：键值配置表（存商品分类、关于我们内容开关等）
-- ---------------------------------------------------------------------
CREATE TABLE `settings` (
  `key` varchar(50) NOT NULL,
  `value` varchar(200) NOT NULL DEFAULT '',
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- feedback：意见反馈【按代码还原，原库缺失】
--   列名依据 server.js 里的 SQL 推断：
--     INSERT INTO feedback (user_id, content, type)
--     SELECT id, content, type, status, reply, created_at
--     UPDATE feedback SET status='resolved'
-- ---------------------------------------------------------------------
CREATE TABLE `feedback` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `content` text NOT NULL,
  `type` enum('suggestion','bug','other') DEFAULT 'suggestion',
  `status` enum('pending','resolved') DEFAULT 'pending',
  `reply` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `feedback_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
