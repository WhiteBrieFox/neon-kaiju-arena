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
