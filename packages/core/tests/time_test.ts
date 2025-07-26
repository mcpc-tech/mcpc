import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.201.0/testing/asserts.ts";
import { now } from "../src/utils/common/time.ts";

Deno.test("Time utilities - now() returns a dayjs object", () => {
  const result = now();

  assertExists(result);
  assertEquals(typeof result.format, "function");
  assertEquals(typeof result.unix, "function");
});

Deno.test("Time utilities - now() returns Shanghai timezone", () => {
  const result = now();
  const timezone = result.format("Z");

  // Shanghai timezone should be +08:00
  assertEquals(timezone, "+08:00");
});

Deno.test("Time utilities - now() returns valid date", () => {
  const result = now();
  const timestamp = result.unix();

  // Should be a reasonable timestamp (after 2020 and before 2030)
  const year2020 = 1577836800; // 2020-01-01 00:00:00 UTC
  const year2030 = 1893456000; // 2030-01-01 00:00:00 UTC

  assertEquals(timestamp > year2020, true);
  assertEquals(timestamp < year2030, true);
});

Deno.test("Time utilities - now() format functions work", () => {
  const result = now();

  const isoString = result.format();
  assertExists(isoString);
  assertEquals(typeof isoString, "string");

  const customFormat = result.format("YYYY-MM-DD HH:mm:ss");
  assertExists(customFormat);
  assertEquals(typeof customFormat, "string");
  assertEquals(customFormat.length, 19); // YYYY-MM-DD HH:mm:ss format
});
