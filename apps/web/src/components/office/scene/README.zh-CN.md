# 如何创建新场景

[English](README.md)

办公室视图通过可插拔的 `SceneAdapter` 接口工作。实现一个包含六个方法的适配器类，以及一个创建适配器的 React 组件，就可以替换成 3D、等距、列表等其他渲染方式。

## 第一步：实现 SceneAdapter

```typescript
// scene/MySceneAdapter.ts
import type { SceneAdapter, AgentInfo, BubbleType } from "./SceneAdapter";
import type { AgentStatus } from "@piko/shared";

export class MySceneAdapter implements SceneAdapter {
  addAgent(agentId: string, info: AgentInfo) {
    // 成员加入，使用 info.name、info.label、info.labelColor 渲染
    // info.palette 是像素场景专用可选字段，不需要时可以忽略
  }

  removeAgent(agentId: string) {
    // 成员离开，从场景移除
  }

  updateAgent(agentId: string, status: AgentStatus, bubble: BubbleType | null) {
    // status: "idle" | "working" | "waiting_approval" | "done" | "error"
    // bubble: "permission" | "working" | "waiting" | null
  }

  showSpeechBubble(agentId: string, text: string) {
    // 用临时气泡展示成员最新消息
  }

  selectAgent(agentId: string | null) {
    // 高亮选中的成员，null 表示取消选择
  }

  dispose() {
    // 清理：停止循环、移除监听器、释放资源
  }
}
```

## 第二步：创建场景组件

```tsx
// scene/MyScene.tsx
import type { SceneComponentProps } from "./SceneAdapter";
import { MySceneAdapter } from "./MySceneAdapter";

export default function MyScene({ onAdapterReady, onAgentClick }: SceneComponentProps) {
  useEffect(() => {
    const adapter = new MySceneAdapter(/* ... */);
    onAdapterReady(adapter);
    return () => adapter.dispose();
  }, []);

  return <div onClick={(e) => {
    const agentId = /* 命中检测逻辑 */;
    if (agentId) onAgentClick(agentId);
  }}>
    {/* 场景渲染内容 */}
  </div>;
}
```

## 第三步：在 page.tsx 中替换场景

```tsx
// 在 apps/web/src/app/office/page.tsx 中修改动态导入：
const MyScene = dynamic(() => import("@/components/office/scene/MyScene"), { ssr: false });

// 然后在 JSX 中使用：
<MyScene
  onAdapterReady={handleAdapterReady}
  onAgentClick={handleAgentClick}
/>
```

`page.tsx` 中的 `useSceneBridge` 会自动把状态同步到适配器。

## 自动处理的行为

以下工作由 `useSceneBridge` 完成：

- 挂载时加入已经存在的成员。
- 订阅 Zustand 状态变化。
- 成员加入或离开时调用 `addAgent` / `removeAgent`。
- 使用正确的状态和气泡类型调用 `updateAgent`。
- 新消息、日志输出和团队聊天出现时调用 `showSpeechBubble`。
- 用户在侧栏选择成员时调用 `selectAgent`。

## 编辑模式

家具摆放和地板绘制等地图编辑能力属于像素场景，位于 `PixelOfficeScene`。非像素场景无需实现编辑器：当 `officeStateRef.current` 为 null 时会自动隐藏。

## 文件结构

```
scene/
  SceneAdapter.ts         ← 接口：AgentInfo、BubbleType、SceneAdapter、SceneComponentProps
  useSceneBridge.ts       ← 状态到适配器的同步钩子，由 page.tsx 使用
  PixelSceneAdapter.ts    ← 封装 OfficeState 的参考实现
  PixelOfficeScene.tsx    ← 参考实现：像素画布
  README.md               ← 英文说明
```
