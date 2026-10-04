# 十二类像素办公室

[返回 Piko 中文文档目录](DOCUMENTATION.zh-CN.md)

提供 12 类场景，每一类都有独立背景和通行地图。花园工作室属于现代主题。界面使用浅色配色，场景名称、分类与说明支持中文和英文。

| 分类 | 场景 | 资源名称 |
| --- | --- | --- |
| Retro | 邮局工坊 | `retro-atelier` |
| Modern | 花园工作室 | `garden-studio` |
| Cute Whimsical | 云朵创作屋 | `cloud-playhouse` |
| Mythological | 日晷书院 | `sun-temple` |
| Cyberpunk | 霓虹天台 | `neon-rooftop` |
| SciFi | 轨道观测站 | `orbital-lab` |
| Post Apocalyptic | 新生驿站 | `renewal-outpost` |
| Historical | 运河图志馆 | `canal-archive` |
| Eastern Fantasy | 竹影书阁 | `bamboo-pavilion` |
| Western Fantasy | 森语公会 | `woodland-guild` |
| Gothic | 玫窗书库 | `rose-library` |
| Dark Legend | 月石秘院 | `moonstone-sanctum` |

## 资源与制作

背景通过内置 `image_gen` 工具从文字生成，原始 PNG 保存在 `apps/web/public/offices/`。每个资源名称对应 `.png` 背景、`.room.json` 地图以及程序加载的 `.zip` 场景包。每张地图按画面标注家具、工位和通道，并接入角色动画与场景引擎。

- `scripts/scenes/catalog.json`：12 类的固定 ID、名称、双语文案与资源对应关系。
- `scripts/scenes/prompts.json`：全部 12 张背景的最终生成提示词，使用内置工具模式。
- `scripts/scenes/maps.json`：11 张新增地图的 64 × 64 网格标注；花园工作室由独立脚本维护。
- `scripts/scenes/build-scenes.mjs`：重建全部场景包，最后一次性写入完整选择列表。
- `scripts/scenes/verify-scenes.ts`：检查分类完整性、图片互不相同、预览与场景包一致、中文文案、真实引擎座位配对及路径。

## 行为

现代主题的花园工作室有 9 个工位；其他 11 类各有 6 个工位。邮局工坊、霓虹天台、森语公会另有可用休息座位；其他房间的空闲成员可以在通道走动。书柜、桌面、喷泉与水池阻挡行走，竹影书阁的小桥、日晷书院的地面拼花和森语公会的地图地毯可通行。

场景使用固定选择 ID。为兼容已有设置，`garden-studio` 自动映射到 `Modern`。

## 验证

运行 `pnpm build:scene` 重建全库；运行 `pnpm test:scene` 验证全部场景。单独重建花园工作室不会覆盖场景列表。浏览器可通过 `/office/?test` 临时放入测试成员，检查角色在座位上的显示；正常 `/office/` 不显示测试工具。
