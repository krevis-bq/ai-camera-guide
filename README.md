# AI Camera Guide

基于 Expo / React Native 的实时取景辅助应用：在预览上叠加构图指引与参数建议，拍照后可按分析结果裁切并套用风格化 LUT（Skia），并支持将成片保存到相册。

## 功能概览

- **实时取景**：前后摄、变焦、曝光补偿、补光灯；点击画面选择对焦点。
- **场景分析**：识别意图（人像 / 风光 / 街拍 / 美食），给出构图点、评分与中文拍摄提示。
- **分析来源**：
  - **开发模式**：若未设置 `EXPO_PUBLIC_VISION_API_URL`，默认请求本机代理（iOS 模拟器 `127.0.0.1:3001`，Android 模拟器 `10.0.2.2:3001`）；也可把该变量指向局域网内的电脑以配合真机调试。
  - **视觉服务**：`server/` 使用 LangChain 架构，视觉能力由 MCP（Model Context Protocol）提供，通过 `@z_ai/mcp-server` 调用智谱视觉模型。
  - **生产构建**：未配置 `EXPO_PUBLIC_VISION_API_URL` 时，客户端会走直连智谱视觉 API 的路径；请通过 `EXPO_PUBLIC_ZHIPU_API_KEY` 注入密钥，**切勿**把密钥写进代码或提交到 Git。
  - 视觉请求失败时，界面会回退到本地启发式分析（`guideEngine`）。
- **拍照后流程**：按分析裁切 → 可选 LUT 渲染 → 成片预览（FILM / RAW 切换）→ 保存到相册。

## 技术栈

| 层级 | 技术 |
|------|------|
| 客户端 | Expo ~55、React 19、React Native 0.83、`expo-camera`、`@shopify/react-native-skia` |
| 视觉服务 | Express 5、TypeScript、`tsx`、LangChain v1、MCP |
| MCP 服务 | `@z_ai/mcp-server`（智谱视觉） |

## 目录结构

```
ai-camera-guide/
├── client/                    # React Native/Expo 前端
│   ├── App.tsx               # 主界面：相机、叠加层、成片回顾
│   ├── src/
│   │   ├── components/       # GuideOverlay、RecommendationPanel
│   │   ├── services/         # 视觉请求、本地分析、后处理、滤镜
│   │   └── types/            # 相机与分析相关类型
│   ├── app.json
│   └── package.json
│
├── server/                   # LangChain 视觉服务
│   ├── src/
│   │   ├── index.ts          # HTTP 入口：POST /vision/analyze、GET /health
│   │   ├── chain/
│   │   │   └── visionChain.ts  # LangChain chain + MCP 集成
│   │   └── schemas/
│   │       └── camera.ts      # Zod schemas
│   ├── .env
│   └── package.json
│
└── README.md
```

## 环境要求

- Node.js（建议 LTS）
- iOS：Xcode 与 CocoaPods（真机/模拟器原生构建时）
- Android：Android Studio 与 SDK（同上）
- 使用原生模块（相机、Skia 等）时，需 **Expo Dev Client** 或 `expo prebuild` 后的原生工程，而非仅 Expo Go（以你本地 `expo-doctor` 为准）。

## 快速启动

### 1. 安装依赖

```bash
cd server && npm install
```

### 2. 配置环境变量

**服务端** (`server/.env`)：
```env
OPENAI_API_KEY=b0792c28ba6a470f90bbb9f08bd00e78.csFQWmlr665jd9Y3
OPENAI_BASE_URL=https://open.bigmodel.cn/api/coding/paas/v4
OPENAI_VISION_MODEL=glm-5
PORT=3001
```

**客户端** (`client/.env`)：
```env
EXPO_PUBLIC_VISION_API_URL=http://127.0.0.1:3001
```

### 3. 启动服务

**终端 1 - 启动视觉服务（自动启动 MCP 服务）：**
```bash
cd server
npm run dev
```

视觉服务会在运行时通过 LangChain MCP 适配器自动启动 `@z_ai/mcp-server`。

**终端 2 - 启动客户端：**
```bash
cd client
npx expo start
```

## 服务说明

### MCP 服务

`@z_ai/mcp-server` 提供视觉理解能力，通过 stdio 与 LangChain 服务通信。

环境变量：
| 变量 | 说明 |
|------|------|
| `Z_AI_API_KEY` | 智谱 API Key（从 `OPENAI_API_KEY` 传入） |
| `Z_AI_MODE` | 模式，设为 `ZHIPU` |

MCP 服务在 `visionChain.ts` 中配置，随视觉服务启动自动运行。

### 视觉服务（LangChain Server）

使用 LangChain Expression Language (LCEL) 架构，通过 MCP 工具调用获取视觉分析结果。

端点：
- `GET /health` - 健康检查
- `POST /vision/analyze` - 视觉分析

请求格式：
```json
{
  "imageBase64": "...",
  "selectedPoint": { "x": 0.5, "y": 0.5 },
  "zoom": 0.5,
  "exposureBias": 0
}
```

### 客户端环境变量

| 变量 | 说明 |
|------|------|
| `EXPO_PUBLIC_VISION_API_URL` | 视觉服务地址，默认 `http://127.0.0.1:3001` |
| `EXPO_PUBLIC_ZHIPU_API_KEY` | 智谱 API Key（直连模式） |

- **iOS 模拟器**：可用 `127.0.0.1`
- **Android 模拟器**：未设置 URL 时，开发模式下客户端会尝试 `http://10.0.2.2:3001`
- **真机**：请将 `EXPO_PUBLIC_VISION_API_URL` 设为电脑的局域网 IP（例如 `http://192.168.1.10:3001`），并保证手机与电脑同一网络、防火墙放行端口。

## 部署说明

### 视觉服务部署

```bash
cd server
npm install
PORT=3001 npm start
```

### EAS 构建

仓库内含 `eas.json`，可按 profile（`development` / `preview` / `production`）使用 [EAS Build](https://docs.expo.dev/build/introduction/) 打包含原生依赖的客户端。具体账号与 `projectId` 见 `app.json` 中 `extra.eas`。

## 权限说明

应用需要相机与（保存时）相册写入权限；文案在 `app.json` 的插件与 iOS `infoPlist` 中配置。

## 许可证

未在仓库中声明默认许可证时，以项目所有者约定为准。
