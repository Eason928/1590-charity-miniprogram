// ======== 猫咪数据 ========
// 后续可以在微信开发者工具里把图片放进 images/cats/ 目录
// 需要你提供猫咪照片和信息的完整清单，我来补充更多猫咪

const cats = [
  {
    id: "cat_001",
    name: "橘子",
    avatar: "/images/cats/orange.jpg",
    gender: "公",
    color: "橘色",
    age: "约2岁",
    neutered: true,
    personality: "亲人、贪吃、喜欢蹭人",
    favorite_food: "皇家猫粮、罐头、鸡肉干",
    locations: ["教学楼前花坛", "食堂后门"],
    story: "2023年出现在校园，性格温顺，是全校最受欢迎的猫咪",
    health_status: "健康"
  },
  {
    id: "cat_002",
    name: "小花",
    avatar: "/images/cats/xiaohua.jpg",
    gender: "母",
    color: "黑白花",
    age: "约1岁",
    neutered: true,
    personality: "胆小、好奇、喜欢躲在灌木丛里",
    favorite_food: "猫条、鱼肉罐头",
    locations: ["宿舍区花坛", "图书馆后面"],
    story: "去年冬天出现在宿舍区，一开始很怕人，现在偶尔会靠近",
    health_status: "健康"
  },
  {
    id: "cat_003",
    name: "Alpha（系统测试官）",
    avatar: "/images/cats/pangpang.jpg",
    gender: "公",
    color: "灰白（经典款）",
    age: "约3岁（v1.0.0 正式版）",
    neutered: true,
    personality: "高冷但靠谱。偶尔出现小bug（比如突然消失），重启一下就好了。",
    favorite_food: "测试用例、边界值、空值校验（其实也爱吃罐罐）",
    locations: ["主页列表第一位", "每个测试用例里", "你的心里"],
    story: "Alpha 是猫猫图鉴的第一位内部测试官（Alpha Tester）。他跑遍了所有页面、点击了每个按钮、测试了搜索框的各种输入。他的存在就代表系统正常运行——如果哪天看不到 Alpha，说明程序出 bug 了。",
    health_status: "测试通过 ✅"
  }
];

module.exports = cats;
