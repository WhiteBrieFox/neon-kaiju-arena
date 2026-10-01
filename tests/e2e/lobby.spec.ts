import { expect, test } from "@playwright/test";

test("two players can create, join and start a match", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await host.getByPlaceholder("输入昵称").fill("Alpha");
  await host.getByRole("button", { name: "建立战斗链路" }).click();
  await expect(host.getByText("房间代码")).toBeVisible();

  const roomCode = (await host.locator(".room-code-block strong").textContent())!.trim();
  await guest.goto(`/?room=${roomCode}`);
  await guest.getByPlaceholder("输入昵称").fill("Beta");
  await guest.getByRole("button", { name: "铁拳猿" }).click();
  await guest.getByRole("button", { name: "进入战场" }).click();

  await expect(host.getByText("Beta")).toBeVisible();
  await host.getByRole("button", { name: "启动对局" }).click();

  await expect(host.locator(".turn-banner strong")).toContainText("的回合");
  await expect(guest.locator(".turn-banner strong")).toContainText("的回合");

  await hostContext.close();
  await guestContext.close();
});
