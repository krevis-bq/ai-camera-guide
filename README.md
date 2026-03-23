# AI Camera Guide

基于 Expo / React Native 的实时取景辅助应用：在预览上叠加构图指引与参数建议，拍照后可按分析结果裁切并套用风格化 LUT（Skia），并支持将成片保存到相册。

## 功能概览

- **实时取景**：前后摄、变焦、曝光补偿、补光灯；点击画面选择对焦点。
- **场景分析**：识别意图（人像 / 风光 / 街拍 / 美食），给出构图点、评分与中文拍摄提示。
- **分析来源**：
  - **开发模式**：若未设置 `EXPO_PUBLIC_VISION_API_URL`，默认请求本机代理（iOS 模拟器 `127.0.0.1:3001`，Android 模拟器 `10.0.2.2:3001`）；也可把该变量指向局域网内的电脑以配合真机调试。
  - **本地代理**：本仓库 `server/` 可将画面转发给 OpenAI 视觉或智谱 GLM-4V，返回结构化 JSON。
  - **生产构建**：未配置 `EXPO_PUBLIC_VISION_API_URL` 时，客户端会走直连智谱视觉 API 的路径；请通过 `EXPO_PUBLIC_ZHIPU_API_KEY` 注入密钥，**切勿**把密钥写进代码或提交到 Git。
  - 视觉请求失败时，界面会回退到本地启发式分析（`guideEngine`）。
- **拍照后流程**：按分析裁切 → 可选 LUT 渲染 → 成片预览（FILM / RAW 切换）→ 保存到相册。

## 技术栈

| 层级 | 技术 |
|------|------|
| 客户端 | Expo ~55、React 19、React Native 0.83、`expo-camera`、`@shopify/react-native-skia` |
| 服务端 | Express 5、TypeScript、`tsx`、OpenAI SDK、Zod |

## 目录结构

```
.
├── App.tsx                 # 主界面：相机、叠加层、成片回顾
├── src/
│   ├── components/         # GuideOverlay、RecommendationPanel
│   ├── services/           # 视觉请求、本地分析、后处理、滤镜
│   └── types/              # 相机与分析相关类型
└── server/
    └── src/index.ts        # POST /vision/analyze、GET /health
```

## 环境要求

- Node.js（建议 LTS）
- iOS：Xcode 与 CocoaPods（真机/模拟器原生构建时）
- Android：Android Studio 与 SDK（同上）
- 使用原生模块（相机、Skia 等）时，需 **Expo Dev Client** 或 `expo prebuild` 后的原生工程，而非仅 Expo Go（以你本地 `expo-doctor` 为准）。

## 客户端安装与运行

```bash
npm install
cp .env.example .env   # 按需修改 EXPO_PUBLIC_VISION_API_URL
npx expo start
```

常用脚本（见根目录 `package.json`）：

| 命令 | 说明 |
|------|------|
| `npm start` | 启动 Expo 开发服务器 |
| `npm run ios` / `npm run android` | 运行原生构建 |
| `npm run web` | Web 预览（相机能力受平台限制） |
| `npm run server` | 在子目录启动视觉代理（见下） |
| `npm run typecheck` | TypeScript 检查 |

## 视觉代理服务（可选）

本地服务将客户端上传的 JPEG Base64 转发给 **OpenAI 视觉** 或 **智谱 GLM-4V**，并返回与客户端一致的 JSON 结构。

```bash
cd server
npm install
cp .env.example .env
# 编辑 .env：OPENAI_API_KEY、PORT、OPENAI_VISION_MODEL 等
npm run dev
```

默认监听 `http://127.0.0.1:3001`。根目录 `.env` 中设置：

```env
EXPO_PUBLIC_VISION_API_URL=http://127.0.0.1:3001
```

- **iOS 模拟器**：可用 `127.0.0.1`。
- **Android 模拟器**：未设置 URL 时，开发模式下客户端会尝试 `http://10.0.2.2:3001`。
- **真机**：请将 `EXPO_PUBLIC_VISION_API_URL` 设为电脑的局域网 IP（例如 `http://192.168.1.10:3001`），并保证手机与电脑同一网络、防火墙放行端口。

### 服务端环境变量（`server/.env`）

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | 启动时必填（当前代码在进程启动时会检查） |
| `PORT` | 端口，默认 `3001` |
| `OPENAI_VISION_MODEL` | OpenAI 模型名，默认 `gpt-5.4-mini` |
| `VISION_API_PROVIDER` | `openai` 或 `zhipu`（默认 `zhipu`）；为 `zhipu` 时需配置 `ZHIPU_API_KEY` |
| `ZHIPU_API_KEY` | 智谱开放平台密钥（`VISION_API_PROVIDER=zhipu` 时使用） |

健康检查：`GET /health`。分析接口：`POST /vision/analyze`（JSON body：`imageBase64`、`selectedPoint`、`zoom`、`exposureBias`）。

## EAS 构建

仓库内含 `eas.json`，可按 profile（`development` / `preview` / `production`）使用 [EAS Build](https://docs.expo.dev/build/introduction/) 打包含原生依赖的客户端。具体账号与 `projectId` 见 `app.json` 中 `extra.eas`。

## 权限说明

应用需要相机与（保存时）相册写入权限；文案在 `app.json` 的插件与 iOS `infoPlist` 中配置。

## 许可证

未在仓库中声明默认许可证时，以项目所有者约定为准。
