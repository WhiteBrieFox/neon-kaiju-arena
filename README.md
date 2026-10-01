# 怪兽之夜

一款支持 2-6 人浏览器联机的本地部署骰子对战游戏。规则引擎运行在服务端，客户端只提交操作意图。

## 本地开发

环境要求：Node.js 18.18+，推荐 Node.js 20 或 24；pnpm 8+。

```bash
pnpm install
pnpm dev
```

打开：

- 本机：`http://localhost:5173`
- 同一局域网：启动日志中显示的 `http://局域网IP:5173`

房主创建房间后，把邀请链接或 5 位房间代码发给其他玩家即可。

## 生产模式

```bash
pnpm build
pnpm start
```

生产服务默认监听 `http://localhost:3001`，可通过 `PORT` 和 `HOST` 环境变量修改。

## Docker

```bash
docker build -t neon-kaiju-arena .
docker run --rm -p 3001:3001 neon-kaiju-arena
```

## 异地联机

本地服务默认只能被本机或局域网访问。异地游玩可选择：

- 让所有玩家加入同一个 Tailscale 网络，再分享 Tailscale IP。
- 使用 Cloudflare Tunnel 将 `http://localhost:3001` 暴露为临时 HTTPS 地址。

公网开放时务必保留 HTTPS/WSS，不要直接暴露未加密端口。

## 测试

```bash
pnpm test
pnpm test:e2e
pnpm build
```

- Vitest 覆盖骰子、东京、东京湾、撤离、淘汰、双人规则和胜负边界。
- Playwright 使用两个独立浏览器身份覆盖创建、加入与同步开局，并分别运行桌面和手机视口。

## 内容边界

本项目复刻基础版的核心玩法规则，但使用原创名称、角色、美术和改写后的卡牌内容。若要公开发布官方名称、原版卡面文案或美术，需要先取得相应授权。
