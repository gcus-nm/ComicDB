const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
let cookie = "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  return { response, body };
}

const anonymous = await request("/api/books");
assert(anonymous.response.status === 401, "未認証APIが拒否されませんでした。");

const setup = await request("/api/setup", {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({
    username: "smoke-owner",
    password: "smoke-test-password",
  }),
});
assert(setup.response.status === 201, `初期設定に失敗しました: ${JSON.stringify(setup.body)}`);
assert(cookie.startsWith("comicdb_session="), "セッションCookieが設定されませんでした。");

const createdFandom = await request("/api/taxonomies", {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ type: "fandom", name: "作品A" }),
});
assert(
  createdFandom.response.status === 201 && createdFandom.body.id,
  `作品マスターの登録に失敗しました: ${JSON.stringify(createdFandom.body)}`,
);
for (const taxonomy of [
  { type: "character", name: "主人公", parentId: createdFandom.body.id },
  { type: "pairing", name: "主人公×相棒", parentId: createdFandom.body.id },
]) {
  const createdChild = await request("/api/taxonomies", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(taxonomy),
  });
  assert(
    createdChild.response.status === 201,
    `分類マスターの登録に失敗しました: ${JSON.stringify(createdChild.body)}`,
  );
}
const taxonomies = await request("/api/taxonomies");
assert(
  taxonomies.response.status === 200 && taxonomies.body.tags.length === 3,
  "分類マスターを取得できませんでした。",
);

const csrf = await request("/api/events", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "拒否対象", startsOn: "2026-08-15" }),
});
assert(csrf.response.status === 403, "Originのない更新が拒否されませんでした。");

const createdEvent = await request("/api/events", {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({
    name: "スモークイベント",
    startsOn: "2026-08-15",
    venue: "テスト会場",
  }),
});
assert(
  createdEvent.response.status === 201 && createdEvent.body.id,
  `イベント作成に失敗しました: ${JSON.stringify(createdEvent.body)}`,
);

const form = new FormData();
form.set("title", "夏の記憶");
form.set("circles", "星空書房");
form.set("creators", "山田");
form.set("fandoms", "作品A");
form.set("characters", "主人公");
form.set("tags", "新刊");
form.set("adultRating", "general");
form.set("readStatus", "unread");
form.set("eventId", createdEvent.body.id);
form.set("priceYen", "500");
form.set("quantity", "1");

const createdBook = await request("/api/books", {
  method: "POST",
  headers: { origin },
  body: form,
});
assert(
  createdBook.response.status === 201 && createdBook.body.id,
  `蔵書登録に失敗しました: ${JSON.stringify(createdBook.body)}`,
);

const duplicates = await request(
  `/api/books/duplicates?title=${encodeURIComponent("夏の記憶")}&circle=${encodeURIComponent("星空書房")}`,
);
assert(
  duplicates.response.status === 200 &&
    duplicates.body.candidates.some((book) => book.id === createdBook.body.id),
  "重複候補が見つかりませんでした。",
);

const acquisition = await request(`/api/books/${createdBook.body.id}/acquisitions`, {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({
    eventId: createdEvent.body.id,
    quantity: 2,
    priceYen: 500,
  }),
});
assert(
  acquisition.response.status === 201 && acquisition.body.ownedCount === 3,
  "追加購入が所持数へ反映されませんでした。",
);

for (const query of ["記憶", "星空", "山田", "作品A", "主人公", "新刊"]) {
  const search = await request(`/api/books?q=${encodeURIComponent(query)}`);
  assert(
    search.response.status === 200 &&
      search.body.books.some((book) => book.id === createdBook.body.id),
    `横断検索で「${query}」が見つかりませんでした。`,
  );
}

const snapshot = await request("/api/offline/snapshot");
assert(
  snapshot.response.status === 200 && snapshot.body.books.length === 1,
  "オフラインスナップショットを取得できませんでした。",
);

const csv = await request("/api/csv/export");
assert(
  csv.response.status === 200 &&
    typeof csv.body === "string" &&
    csv.body.includes("夏の記憶"),
  "CSV出力に登録データが含まれていません。",
);

const backup = await request("/api/backup", {
  method: "POST",
  headers: { origin },
});
assert(
  backup.response.status === 201 && backup.body.name?.endsWith(".zip"),
  `バックアップ作成に失敗しました: ${JSON.stringify(backup.body)}`,
);

const logout = await request("/api/logout", {
  method: "POST",
  headers: { origin },
});
assert(logout.response.status === 200, "ログアウトに失敗しました。");
const afterLogout = await request("/api/books");
assert(afterLogout.response.status === 401, "失効後のセッションが利用できました。");

console.log(
  JSON.stringify({
    ok: true,
    checks: [
      "auth",
      "taxonomy-master",
      "csrf",
      "event",
      "book",
      "duplicate",
      "acquisition",
      "search",
      "offline",
      "csv",
      "backup",
      "session-revocation",
    ],
  }),
);
