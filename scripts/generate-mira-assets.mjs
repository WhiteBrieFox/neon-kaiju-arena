import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const promptDocument = readFileSync(
  resolve(root, "docs/ai-art-prompts.md"),
  "utf8",
);

const allAssets = [
  ["01", "voltclaw-full.png", true],
  ["02", "iron-gorilla-full.png", true],
  ["03", "astral-cat-full.png", true],
  ["04", "unit-zero-full.png", true],
  ["05", "magma-crab-full.png", true],
  ["06", "rocket-penguin-full.png", true],
  ["07", "voltclaw-portrait.png", false],
  ["08", "iron-gorilla-portrait.png", false],
  ["09", "astral-cat-portrait.png", false],
  ["10", "unit-zero-portrait.png", false],
  ["11", "magma-crab-portrait.png", false],
  ["12", "rocket-penguin-portrait.png", false],
  ["13", "tokyo-arena-bg.png", false],
  ["14", "login-key-visual.png", false],
  ["15", "game-logo.png", true],
  ["16", "electric-vfx-sheet.png", true],
  ["17", "explosion-vfx-sheet.png", true],
  ["18", "impact-vfx-sheet.png", true],
  ["19", "lobby-action-create.png", false],
  ["20", "lobby-action-join.png", false],
];
const commandArguments = process.argv.slice(2);
const recoveryMode = commandArguments[0] === "recover";
const requestedSections = new Set(recoveryMode ? [] : commandArguments);
const assets = requestedSections.size
  ? allAssets.filter(([section]) => requestedSections.has(section))
  : allAssets;

function runAppleScript(source) {
  return execFileSync("osascript", ["-e", source], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  }).trim();
}

function browserJavaScript(source) {
  const encoded = Buffer.from(source).toString("base64");
  return runAppleScript(`
tell application "Google Chrome"
  repeat with wi from 1 to count windows
    repeat with ti from 1 to count tabs of window wi
      if URL of tab ti of window wi contains "mira.byteintl.net/chat/883804875795" then
        set active tab index of window wi to ti
        set index of window wi to 1
        return execute tab ti of window wi javascript "eval(decodeURIComponent(escape(atob('${encoded}'))))"
      end if
    end repeat
  end repeat
end tell
return "NO_MIRA_TAB"
`);
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

function extractPrompt(section) {
  const sectionStart = promptDocument.indexOf(`## ${section}.`);
  const promptStart = promptDocument.indexOf("```text\n", sectionStart);
  const promptEnd = promptDocument.indexOf("\n```", promptStart);
  if (sectionStart < 0 || promptStart < 0 || promptEnd < 0) {
    throw new Error(`Prompt section ${section} was not found.`);
  }
  return promptDocument.slice(promptStart + "```text\n".length, promptEnd).trim();
}

function getState() {
  return JSON.parse(
    browserJavaScript(`(() => {
      return JSON.stringify({
        running: Boolean(document.querySelector(".mira-prompt-stop-btn")),
        tail: (document.body.innerText || "").slice(-240),
      });
    })()`),
  );
}

async function getAttachment(roundIndex = null) {
  const requestedRound = roundIndex === null ? "null" : String(roundIndex);
  browserJavaScript(`(() => {
    window.__attachmentResult = { status: "loading" };
    fetch(
      "/mira/api/v1/chat/messages/round/last?session_id=883804875795&latest_round_count=30",
      { credentials: "include" },
    )
      .then((response) => response.json())
      .then((body) => {
        const requestedRound = ${requestedRound};
        const messages = body?.data?.messages || [];
        const candidates = messages
          .filter((message) =>
            message.attachments?.length &&
            (requestedRound === null || message.roundIndex === requestedRound),
          )
          .sort((left, right) => right.roundIndex - left.roundIndex);
        const message = candidates[0];
        const attachment = message?.attachments?.[0];
        window.__attachmentResult = attachment
          ? {
              status: "done",
              roundIndex: message.roundIndex,
              source: attachment.url,
              filename: attachment.file_name,
            }
          : { status: "missing" };
      })
      .catch((error) => {
        window.__attachmentResult = {
          status: "error",
          error: String(error),
        };
      });
    return "started";
  })()`);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(500);
    const result = JSON.parse(
      browserJavaScript(`JSON.stringify(window.__attachmentResult || {})`),
    );
    if (result.status === "done" || result.status === "missing") return result;
    if (result.status === "error") {
      throw new Error(`Could not load conversation data: ${result.error}`);
    }
  }
  throw new Error("Timed out loading conversation data.");
}

async function waitForEditor(timeout = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const ready = browserJavaScript(
      `Boolean(document.querySelector("[data-slate-editor=true]"))`,
    );
    if (ready === "true") return;
    await sleep(1000);
  }
  throw new Error("Mira editor did not become ready.");
}

async function submitPrompt(prompt) {
  await waitForEditor();
  const encodedPrompt = Buffer.from(prompt).toString("base64");
  const result = browserJavaScript(`(() => {
    const prompt = decodeURIComponent(escape(atob("${encodedPrompt}")));
    const editor = document.querySelector("[data-slate-editor=true]");
    const zeroWidth = editor?.querySelector("[data-slate-zero-width]");
    if (!editor) {
      return JSON.stringify({ ok: false, reason: "no-editor" });
    }
    if (!zeroWidth) {
      const matches = editor.innerText.trim().startsWith(prompt.slice(0, 100));
      return JSON.stringify({
        ok: matches,
        inserted: false,
        reason: matches ? "" : "editor-contains-different-text",
      });
    }

    const textNode = zeroWidth.firstChild;
    const range = document.createRange();
    range.setStart(textNode, textNode.data.length);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    editor.focus();
    editor.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: prompt,
    }));

    return JSON.stringify({ ok: true, inserted: true, length: prompt.length });
  })()`);
  const parsed = JSON.parse(result);
  if (!parsed.ok) {
    throw new Error(`Could not submit prompt: ${parsed.reason}`);
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(250);
    const sendState = browserJavaScript(`(() => {
      const button = document.querySelector(".mira-prompt-send-btn");
      if (!button) return "missing";
      if (button.disabled) return "disabled";
      button.click();
      return "clicked";
    })()`);
    if (sendState === "clicked") return;
  }
  throw new Error("Send button did not become enabled.");
}

async function waitForNewImage(previousSource, timeout = 240_000) {
  const startedAt = Date.now();
  let observedRunning = false;
  while (Date.now() - startedAt < timeout) {
    await sleep(8000);
    const state = getState();
    observedRunning ||= state.running;
    process.stdout.write(`  ${state.running ? "generating" : "waiting"}\n`);
    if (observedRunning && !state.running) {
      const attachment = await getAttachment();
      if (
        attachment.status === "done" &&
        attachment.source !== previousSource
      ) {
        return attachment;
      }
    }
  }
  throw new Error("Timed out waiting for a new generated image.");
}

async function fetchImage(source) {
  const encodedSource = Buffer.from(source).toString("base64");
  const started = browserJavaScript(`(() => {
    const source = decodeURIComponent(escape(atob("${encodedSource}")));
    window.__assetFetch = {
      status: "loading",
      data: "",
      type: "",
      size: 0,
      error: "",
    };
    fetch(source, { credentials: "include" })
      .then((response) => {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.blob();
      })
      .then((blob) => {
        window.__assetFetch.type = blob.type;
        window.__assetFetch.size = blob.size;
        const reader = new FileReader();
        reader.onload = () => {
          window.__assetFetch.data = reader.result.split(",")[1];
          window.__assetFetch.status = "done";
        };
        reader.onerror = () => {
          window.__assetFetch.status = "error";
          window.__assetFetch.error = "FileReader failed";
        };
        reader.readAsDataURL(blob);
      })
      .catch((error) => {
        window.__assetFetch.status = "error";
        window.__assetFetch.error = String(error);
      });
    return "STARTED";
  })()`);
  if (started !== "STARTED") {
    throw new Error("Could not start image fetch.");
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(1000);
    const status = JSON.parse(
      browserJavaScript(`JSON.stringify({
        status: window.__assetFetch?.status,
        type: window.__assetFetch?.type,
        size: window.__assetFetch?.size,
        error: window.__assetFetch?.error,
      })`),
    );
    if (status.status === "error") {
      throw new Error(`Image fetch failed: ${status.error}`);
    }
    if (status.status === "done") {
      const data = browserJavaScript(`window.__assetFetch.data`);
      return {
        buffer: Buffer.from(data, "base64"),
        type: status.type,
        size: status.size,
      };
    }
  }
  throw new Error("Timed out reading generated image.");
}

if (recoveryMode) {
  for (const specification of commandArguments.slice(1)) {
    const [roundText, filename] = specification.split(":");
    const attachment = await getAttachment(Number(roundText));
    if (attachment.status !== "done") {
      throw new Error(`No image found for round ${roundText}.`);
    }
    const image = await fetchImage(attachment.source);
    writeFileSync(resolve(root, "public", filename), image.buffer);
    process.stdout.write(
      `Recovered round ${roundText} -> public/${filename}, ${image.size} bytes\n`,
    );
  }
  process.exit(0);
}

for (const [section, filename, transparent] of assets) {
  const destination = resolve(root, "public", filename);
  const prompt = [
    "Generate exactly one image from the following art brief.",
    "Create the image directly without explaining or discussing the prompt.",
    transparent
      ? "Use a real transparent alpha background if the format supports it; never draw a checkerboard pattern."
      : "",
    extractPrompt(section),
  ]
    .filter(Boolean)
    .join("\n");

  const previousAttachment = await getAttachment();
  process.stdout.write(
    `Generating section ${section} -> public/${filename}\n`,
  );
  await submitPrompt(prompt);
  const generatedAttachment = await waitForNewImage(
    previousAttachment.source || "",
  );
  const image = await fetchImage(generatedAttachment.source);
  writeFileSync(destination, image.buffer);
  process.stdout.write(`  saved ${image.size} bytes\n`);
}
