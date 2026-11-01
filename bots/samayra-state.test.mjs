import test from "node:test";
import assert from "node:assert/strict";
import { boundedSet, touchEntry } from "./samayra-state.mjs";

test("boundedSet evicts oldest entries and preserves newest", () => {
  const map = new Map();
  boundedSet(map, "a", 1, 2);
  boundedSet(map, "b", 2, 2);
  boundedSet(map, "c", 3, 2);
  assert.deepEqual([...map.keys()], ["b", "c"]);
});

test("boundedSet refreshes an existing key without growing the map", () => {
  const map = new Map([["a", 1], ["b", 2]]);
  boundedSet(map, "a", 3, 2);
  assert.deepEqual([...map.entries()], [["b", 2], ["a", 3]]);
});

test("touchEntry refreshes recency and returns stored value", () => {
  const map = new Map([["a", [1]], ["b", [2]]]);
  assert.deepEqual(touchEntry(map, "a"), [1]);
  assert.deepEqual([...map.keys()], ["b", "a"]);
});

test("touchEntry returns undefined for a missing key", () => {
  assert.equal(touchEntry(new Map(), "missing"), undefined);
});
