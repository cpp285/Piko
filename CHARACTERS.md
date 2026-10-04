# Piko 人物形象

[返回 Piko 中文文档目录](DOCUMENTATION.zh-CN.md)

团队选择、单人添加、自定义成员头像、聊天头像、办公室中的角色与加载动画共用 14 套像素人物。原有 8 款保留，另提前制作 6 款同风格的新形象；新建人物时点击选择即可，无需现场生成或调用 Agent。

| 名字 | 职位 | 形象 | 素材 |
| --- | --- | --- | --- |
| 陈峰 | 团队负责人 | 鼠尾草绿帽、米白夹克、铜色徽章 | `zhiheng.png` |
| 李敏 | 代码审查者 | 银色短发、圆眼镜、紫色马甲 | `mingjing.png` |
| 张伟 | 资深开发者 | 灰短发、胡须、靛蓝工装 | `lichuan.png` |
| 林悦 | 前端开发者 | 青色短发、珊瑚色上衣、米白背带裤 | `qinghe.png` |
| 周宁 | 后端架构师 | 深蓝发髻、芥黄围巾、绿色外套 | `molan.png` |
| 赵凯 | 原型开发者 | 橙色针织帽、湖蓝连帽衫 | `yuebai.png` |
| 许琳 | 界面设计师 | 粉紫短发、贝雷帽、画师围裙 | `huiqing.png` |
| 王欣 | 产品经理 | 双辫、琥珀色眼镜、蓝色长马甲 | `xingyao.png` |

## 新增形象

下面的名称只描述外观，不限制人物的姓名或岗位。用户可以给任一形象设置文章编辑、产品经理等自定义岗位。

| 形象 | 外观 | 素材 |
| --- | --- | --- |
| 米白针织 | 栗色中长发、椭圆眼镜、米白开衫、深绿半裙 | [editor-cream.png](apps/web/public/assets/characters/team/editor-cream.png) |
| 浅绿衬衫 | 黑色中分短发、浅绿衬衫、燕麦色针织背心 | [writer-sage.png](apps/web/public/assets/characters/team/writer-sage.png) |
| 酒红开衫 | 赤棕短卷发、酒红开衫、浅灰长裤 | [analyst-plum.png](apps/web/public/assets/characters/team/analyst-plum.png) |
| 青蓝外套 | 黑色高马尾、青蓝夹克、米色半裙 | [ops-teal.png](apps/web/public/assets/characters/team/ops-teal.png) |
| 浅蓝牛仔 | 棕色短卷发、方框眼镜、浅蓝衬衫、绿灰工装裤 | [research-denim.png](apps/web/public/assets/characters/team/research-denim.png) |
| 砖红马甲 | 蜜棕中长发、砖红针织马甲、深蓝长裤 | [planner-coral.png](apps/web/public/assets/characters/team/planner-coral.png) |

## 素材与提示词

- 原始透明 PNG：`apps/web/public/assets/characters/team/`。由内置 `image_gen` 工具独立生成，保存未经修改的原始图。
- 完整提示词：`scripts/characters/prompts.json`，记录每个人物的外观及 7 列 × 3 行动作布局。
- 新增 6 款的制作记录：[additional-prompts.json](scripts/characters/additional-prompts.json)。使用内置 `image_gen`，按项目统一的像素风格和动作布局制作，分别设计发型、服装和配饰；原始输出直接保存到素材目录。
- 共用人物表：`packages/shared/src/characters.ts`。
- 显示适配：`apps/web/src/components/office/sprites/characterAtlas.ts`。运行时读取透明边界，将每个动作按统一比例和脚底基线映射为引擎使用的 16 × 32 像素，保留三种朝向和行走、工作、阅读姿势；左侧朝向沿用镜像渲染。
- 独立加载：`characterLoader.ts` 按人物缓存图片请求，成员面板、组队弹窗和办公室共用缓存。头像无需先打开办公室；单个图片失败不影响其他成员，失败请求可重试。
- 头像保真：成员卡片、头像选择和聊天头像直接使用原始 PNG 的正面站立帧，保留原始像素和透明背景，由页面按显示尺寸缩放；不再先压成游戏使用的 16 × 32 网格后放大。原始人物图和现代姓名保持不变。

成员 ID、素材文件名与团队分工保持稳定，显示名字采用现代职场常见姓名。职位的内部英文值用于工具匹配，显示时按界面语言翻译。预设成员和默认配置共用一个数据来源，自动创建审查者也使用同一份人物定义。

运行 `pnpm test:characters` 检查全部透明背景、动作、朝向、14 个不同头像与原角色 ID 的兼容性；运行 `pnpm test:scene` 检查 12 类场景的座位和通行。
