"use strict";

/**
 * The ask. The rules it has to obey are not stylistic:
 *
 * An unprompted permission dialog is how an origin gets permanently blocked by
 * Chrome, so the ask is never on load - only on a tap, and only where somebody
 * has just read a code.
 *
 * On iOS, web push requires the PWA to be installed first. A button that looks
 * live and does nothing is worse than a sentence explaining why.
 */

const test = require("node:test");
const assert = require("node:assert");
const P = require("../lib/pages.js");

test("the ask only ever happens on a tap", () => {
  const html = P.pushControl();
  const clickAt = html.indexOf('addEventListener("click"');
  const askAt = html.indexOf("Notification.requestPermission(");
  assert.ok(clickAt >= 0, "must register a click handler");
  assert.ok(askAt >= 0, "must call requestPermission somewhere");
  assert.ok(clickAt < askAt,
    "permission must be requested inside the click handler, never before it");
  const count = html.split("Notification.requestPermission(").length - 1;
  assert.strictEqual(count, 1, "requestPermission must be called exactly once");
});

test("a browser that cannot do this is shown nothing", () => {
  const html = P.pushControl();
  assert.match(html, /"PushManager" in window/);
  assert.match(html, /Notification\.permission==="denied"/);
});

test("an iPhone that has not installed the site is told why", () => {
  const html = P.pushControl();
  assert.match(html, /standalone/);
  assert.match(html, /home screen/i);
});

test("the control is on the hub and on a day page", () => {
  const day = { date: "2026-09-20", codes: { sporty: "QZ5TFX" }, legs: [] };
  assert.match(P.renderCodesHub([day], () => null), /id="pushAsk"/);
  assert.match(P.renderCodesDay(day, () => null), /id="pushAsk"/);
});

test("turning it off deletes the row and the subscription", () => {
  const html = P.pushControl();
  assert.match(html, /method:"DELETE"/);
  assert.match(html, /unsubscribe\(\)/);
});
