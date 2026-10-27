import { test } from "node:test";
import assert from "node:assert/strict";
import { AutoWAError, ValidationError } from "../dist/index.js";

test("AutoWAError.isAutoWAError is an exact instanceof check", () => {
  assert.equal(AutoWAError.isAutoWAError(new AutoWAError("x")), true);
  assert.equal(AutoWAError.isAutoWAError(new Error("x")), false);
  assert.equal(AutoWAError.isAutoWAError(new ValidationError("x")), false);
  assert.equal(AutoWAError.isAutoWAError(null), false);
  assert.equal(AutoWAError.isAutoWAError({ name: "AutoWAError" }), false);
});

test("ValidationError.isValidationError is an exact instanceof check", () => {
  assert.equal(ValidationError.isValidationError(new ValidationError("x")), true);
  assert.equal(ValidationError.isValidationError(new Error("x")), false);
  assert.equal(ValidationError.isValidationError(new AutoWAError("x")), false);
  assert.equal(ValidationError.isValidationError(undefined), false);
});

test("error names and messages", () => {
  const a = new AutoWAError("boom");
  const v = new ValidationError("bad");
  assert.equal(a.name, "AutoWAError");
  assert.equal(a.message, "boom");
  assert.ok(a instanceof Error);
  assert.equal(v.name, "ValidationError");
  assert.equal(v.message, "bad");
  assert.ok(v instanceof Error);
});
