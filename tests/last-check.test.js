// Run with: node --test tests/last-check.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const lc = require("../assets/last-check.js");

const T = Date.parse("2026-11-03T00:06:17Z");
const min = (n) => n * 60 * 1000;

test("parseLastCheck reads updated_at of the newest successful run", () => {
  const payload = { workflow_runs: [{ updated_at: "2026-11-03T00:06:17Z" }] };
  assert.equal(lc.parseLastCheck(payload), "2026-11-03T00:06:17Z");
});

test("parseLastCheck returns null when there is no usable run", () => {
  assert.equal(lc.parseLastCheck(null), null);
  assert.equal(lc.parseLastCheck({}), null);
  assert.equal(lc.parseLastCheck({ workflow_runs: [] }), null);
  assert.equal(lc.parseLastCheck({ workflow_runs: [{}] }), null);
  assert.equal(lc.parseLastCheck({ workflow_runs: [{ updated_at: "not a date" }] }), null);
  assert.equal(lc.parseLastCheck({ message: "API rate limit exceeded" }), null);
});

test("formatUtc prints a fixed UTC form", () => {
  assert.equal(lc.formatUtc("2026-11-03T00:06:17Z"), "2026-11-03 00:06 UTC");
});

test("describe: a recent check is ok and says how long ago", () => {
  const iso = "2026-11-03T00:06:17Z";
  const r = lc.describe(iso, T + min(3));
  assert.equal(r.state, "ok");
  assert.match(r.text, /3 minutes ago/);
  assert.match(r.text, /2026-11-03 00:06 UTC/);
});

test("describe: wording for under a minute and exactly one minute", () => {
  const iso = "2026-11-03T00:06:17Z";
  assert.match(lc.describe(iso, T + 20 * 1000).text, /less than a minute ago/);
  assert.match(lc.describe(iso, T + min(1)).text, /1 minute ago/);
});

test("describe: a clock slightly behind the server is not shown as negative", () => {
  const r = lc.describe("2026-11-03T00:06:17Z", T - min(2));
  assert.equal(r.state, "ok");
  assert.match(r.text, /less than a minute ago/);
});

test("describe: exactly at the limit is still ok, one minute past is stale", () => {
  const iso = "2026-11-03T00:06:17Z";
  assert.equal(lc.describe(iso, T + min(lc.STALE_MINUTES)).state, "ok");
  assert.equal(lc.describe(iso, T + min(lc.STALE_MINUTES + 1)).state, "stale");
});

test("describe: stale says checks stopped and statuses may be out of date", () => {
  const r = lc.describe("2026-11-03T00:06:17Z", T + min(150));
  assert.equal(r.state, "stale");
  assert.match(r.text, /2 hours ago/);
  assert.match(r.text, /may be out of date/);
  assert.match(r.text, /2026-11-03 00:06 UTC/);
});

test("describe: days for very old checks", () => {
  const r = lc.describe("2026-11-03T00:06:17Z", T + min(60 * 24 * 3 + 5));
  assert.match(r.text, /3 days ago/);
});

test("describe: unknown time is an honest sentence", () => {
  const r = lc.describe(null, T);
  assert.equal(r.state, "unknown");
  assert.match(r.text, /could not be read/);
});

test("no wording claims a live view or a fixed interval", () => {
  const texts = [
    lc.describe("2026-11-03T00:06:17Z", T + min(2)).text,
    lc.describe("2026-11-03T00:06:17Z", T + min(500)).text,
    lc.describe(null, T).text,
  ];
  for (const t of texts) {
    assert.doesNotMatch(t, /live/i);
    assert.doesNotMatch(t, /now/i);
    assert.doesNotMatch(t, /every \d+ minutes/i);
  }
});

test("load: success gives the time, failures give unknown", async () => {
  const ok = await lc.load(async () => ({
    ok: true,
    json: async () => ({ workflow_runs: [{ updated_at: "2026-11-03T00:06:17Z" }] }),
  }));
  assert.equal(ok, "2026-11-03T00:06:17Z");

  const rateLimited = await lc.load(async () => ({ ok: false, status: 403, json: async () => ({}) }));
  assert.equal(rateLimited, null);

  const offline = await lc.load(async () => {
    throw new Error("network down");
  });
  assert.equal(offline, null);

  const badJson = await lc.load(async () => ({
    ok: true,
    json: async () => {
      throw new Error("bad json");
    },
  }));
  assert.equal(badJson, null);
});

test("the request targets only this repo's Uptime CI workflow and successful runs", () => {
  assert.match(lc.API_URL, /^https:\/\/api\.github\.com\/repos\/airestinc-a11y\/status\/actions\/workflows\/uptime\.yml\/runs\?/);
  assert.match(lc.API_URL, /status=success/);
  assert.match(lc.API_URL, /per_page=1/);
});
