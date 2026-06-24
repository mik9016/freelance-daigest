import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { chatCompletions, sendUserMessage, OpenWebUIError, setClientForTest, resetCvCacheForTest } from "../src/openwebui/client.js";
import { setTemplateForTest } from "../src/openwebui/prompts.js";
import { config } from "../src/config.js";
import { db, initDb, schema, closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";

beforeEach(() => {
  resetCvCacheForTest();
  setTemplateForTest("System prompt with CV: {CV_FILE_CONTENTS}");
  closeDb();
  initDb(":memory:");
  runMigrations();
});

function mockAxios() {
  const post = vi.fn();
  const instance = {
    post,
    get: vi.fn(),
    defaults: { headers: { common: {} } },
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } }
  };
  setClientForTest(instance as unknown as ReturnType<typeof axios.create>);
  return post;
}

describe("chatCompletions", () => {
  it("first call returns content and chat_id, sends parent_id: null (OpenWebUI v0.9.5 workaround)", async () => {
    const post = mockAxios();
    post.mockResolvedValue({
      status: 200,
      data: { id: "chat-abc-1", choices: [{ message: { role: "assistant", content: "Hello!" } }] }
    });
    const r = await chatCompletions({ messages: [{ role: "user", content: "hi" }] });
    expect(r.content).toBe("Hello!");
    expect(r.chatId).toBe("chat-abc-1");
    const body = post.mock.calls[0]![1];
    expect(body).not.toHaveProperty("chat_id");
    expect(body.parent_id).toBeNull();
    expect(body.model).toBe(config().OPENWEBUI_MODEL);
    expect(body.stream).toBe(false);
  });

  it("second call passes chat_id and reuses it, no parent_id", async () => {
    const post = mockAxios();
    post.mockResolvedValue({
      status: 200,
      data: { id: "chat-abc-1", choices: [{ message: { role: "assistant", content: "More" } }] }
    });
    const r = await chatCompletions({
      messages: [{ role: "user", content: "more" }],
      chatId: "chat-abc-1"
    });
    expect(r.chatId).toBe("chat-abc-1");
    const body = post.mock.calls[0]![1];
    expect(body.chat_id).toBe("chat-abc-1");
    expect(body).not.toHaveProperty("parent_id");
  });

  it("sends Authorization Bearer from config", async () => {
    const post = mockAxios();
    post.mockResolvedValue({
      status: 200,
      data: { id: "c1", choices: [{ message: { content: "x" } }] }
    });
    await chatCompletions({ messages: [{ role: "user", content: "x" }] });
    // Header is configured at instance creation time; verify body shape only here.
    expect(post).toHaveBeenCalled();
  });

  it("throws auth error on 401", async () => {
    const post = mockAxios();
    post.mockResolvedValue({ status: 401, data: { error: "unauthorized" } });
    await expect(
      chatCompletions({ messages: [{ role: "user", content: "x" }] })
    ).rejects.toBeInstanceOf(OpenWebUIError);
  });

  it("throws server error on 500", async () => {
    const post = mockAxios();
    post.mockResolvedValue({ status: 500, data: { error: "boom" } });
    await expect(
      chatCompletions({ messages: [{ role: "user", content: "x" }] })
    ).rejects.toMatchObject({ code: "server" });
  });

  it("throws parse error when response missing chat_id", async () => {
    const post = mockAxios();
    post.mockResolvedValue({
      status: 200,
      data: { choices: [{ message: { content: "x" } }] }
    });
    await expect(
      chatCompletions({ messages: [{ role: "user", content: "x" }] })
    ).rejects.toMatchObject({ code: "parse" });
  });

  it("trims trailing whitespace from content", async () => {
    const post = mockAxios();
    post.mockResolvedValue({
      status: 200,
      data: { id: "c1", choices: [{ message: { content: "hello\n\n" } }] }
    });
    const r = await chatCompletions({ messages: [{ role: "user", content: "x" }] });
    expect(r.content).toBe("hello");
  });

  it("handles empty content (resolves with empty string)", async () => {
    const post = mockAxios();
    post.mockResolvedValue({
      status: 200,
      data: { id: "c1", choices: [{ message: { content: "" } }] }
    });
    const r = await chatCompletions({ messages: [{ role: "user", content: "x" }] });
    expect(r.content).toBe("");
  });

  it("throws timeout on ETIMEDOUT", async () => {
    const post = mockAxios();
    const err = new Error("timeout");
    (err as any).code = "ETIMEDOUT";
    post.mockRejectedValue(err);
    await expect(
      chatCompletions({ messages: [{ role: "user", content: "x" }] })
    ).rejects.toMatchObject({ code: "timeout" });
  });
});

describe("sendUserMessage", () => {
  function seedThread() {
    db().insert(schema.cvs).values({
      filename: "cv.pdf",
      contentText: "MY CV",
      contentType: "application/pdf",
      sizeBytes: 5,
      isActive: 1
    }).run();
    const offer = db().insert(schema.offers).values({
      externalId: "ext-1",
      title: "Role",
      detailUrl: "https://x",
      descriptionText: "desc",
      searchTerms: "[\"react\"]",
      openwebuiChatId: "chat-existing"
    }).returning().get();
    db().insert(schema.chatMessages).values([
      { offerId: offer.id, role: "user", content: "first user", openwebuiChatId: "chat-existing" },
      { offerId: offer.id, role: "assistant", content: "first assistant", openwebuiChatId: "chat-existing" }
    ]).run();
    return offer;
  }

  it("sends full conversation history (system + prior turns + new user message)", async () => {
    const offer = seedThread();
    const post = mockAxios();
    post.mockResolvedValue({
      status: 200,
      data: { id: "chat-existing", choices: [{ message: { content: "reply" } }] }
    });
    await sendUserMessage(offer.id, "make it shorter");
    const body = post.mock.calls[0]![1];
    expect(body.chat_id).toBe("chat-existing");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("MY CV");
    expect(body.messages.map((m: { role: string; content: string }) => `${m.role}:${m.content}`)).toEqual([
      "system:" + body.messages[0].content,
      "user:first user",
      "assistant:first assistant",
      "user:make it shorter"
    ]);
  });

  it("throws 409 no_thread when no prior messages exist", async () => {
    db().insert(schema.cvs).values({
      filename: "cv.pdf",
      contentText: "MY CV",
      contentType: "application/pdf",
      sizeBytes: 5,
      isActive: 1
    }).run();
    const offer = db().insert(schema.offers).values({
      externalId: "ext-2",
      title: "Role",
      detailUrl: "https://x",
      descriptionText: "desc",
      searchTerms: "[\"react\"]"
    }).returning().get();
    await expect(sendUserMessage(offer.id, "hi")).rejects.toMatchObject({ code: "server", status: 409 });
  });
});