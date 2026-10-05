import { expect, test } from "@playwright/test";

test("two players can create, join and start a match", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await host.getByRole("button", { name: "随机生成昵称" }).click();
  await expect(host.getByPlaceholder("输入昵称")).not.toHaveValue("");
  await host.getByPlaceholder("输入昵称").fill("Alpha");
  await host.getByRole("button", { name: "建立作战房间" }).click();
  await expect(host.getByText("房间代码")).toBeVisible();
  await host.getByRole("button", { name: "伏特爪" }).click();
  await host.getByRole("button", { name: "准备就绪" }).click();

  const roomCode = (await host.locator(".room-code-block strong").textContent())!.trim();
  await guest.goto(`/?room=${roomCode}`);
  await guest.getByPlaceholder("输入昵称").fill("Beta");
  await guest.getByRole("button", { name: "进入作战房间" }).click();
  await guest.getByRole("button", { name: "铁拳猿" }).click();
  await guest.getByRole("button", { name: "准备就绪" }).click();

  await expect(host.getByText("Beta", { exact: true })).toBeVisible();
  await host.getByRole("button", { name: "开始游戏" }).click();

  await expect(host.locator(".turn-banner strong")).toContainText("的回合");
  await expect(guest.locator(".turn-banner strong")).toContainText("的回合");

  await hostContext.close();
  await guestContext.close();
});

test("a host can start a match against a bot", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "规则" }).click();
  await expect(page.getByRole("heading", { name: "作战规则" })).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByPlaceholder("输入昵称").fill("Solo");
  await page.getByRole("button", { name: "建立作战房间" }).click();
  await page.getByRole("button", { name: "伏特爪" }).click();
  await page.getByRole("button", { name: "准备就绪" }).click();
  await page.getByRole("button", { name: "添加人机" }).click();

  await expect(page.getByText("AI", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始游戏" })).toBeEnabled();
  await page.getByRole("button", { name: "开始游戏" }).click();

  await expect(page.locator(".turn-banner strong")).toContainText("的回合");
  await expect(page.locator(".player-panel")).toHaveCount(2);
  await expect(page.locator(".player-panel.is-active")).toHaveCount(1);
  await expect(page.locator(".stat-hp").first()).toContainText("/");
  await page.getByRole("button", { name: "查看Solo的能力" }).click();
  await expect(page.getByRole("heading", { name: "进化技能" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "保留卡牌" })).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "查看全部战况记录" }).click();
  await expect(page.getByRole("heading", { name: "全部战况记录" })).toBeVisible();
  await expect(page.locator(".log-history-list button")).toHaveCount(5);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.locator(".log-list button").first().click();
  await expect(page.getByText("COMBAT RECORD")).toBeVisible();
  await expect(page.locator(".log-detail-meta").getByText("第 1 轮", { exact: true })).toBeVisible();
});

test("a player can leave the lobby and return to the welcome screen", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await host.getByPlaceholder("输入昵称").fill("Host");
  await host.getByRole("button", { name: "建立作战房间" }).click();
  const roomCode = (await host.locator(".room-code-block strong").textContent())!.trim();

  await guest.goto(`/?room=${roomCode}`);
  await guest.getByPlaceholder("输入昵称").fill("Guest");
  await guest.getByRole("button", { name: "进入作战房间" }).click();
  await expect(host.getByText("Guest", { exact: true })).toBeVisible();

  await guest.getByRole("button", { name: "退出房间" }).click();
  await expect(guest.getByRole("button", { name: "建立作战房间" })).toBeVisible();
  await expect(host.getByText("Guest", { exact: true })).toHaveCount(0);

  await hostContext.close();
  await guestContext.close();
});
