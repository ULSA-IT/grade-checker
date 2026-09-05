const test = require("node:test");
const assert = require("node:assert/strict");
const { attach, isAllowedDraft } = require("../score-input.js");

// Model native editing: beforeinput may cancel an edit, then input fires after
// the value changes. A form listener must not see a rejected fallback edit.
class ScoreInput extends EventTarget {
  constructor(value = "") {
    super();
    this.value = value;
    this.setSelectionRange(value.length, value.length);
    attach(this);
    this.acceptedEdits = 0;
    this.addEventListener("input", () => { this.acceptedEdits += 1; });
  }

  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }

  insert(text, options = {}) {
    const { cancelable = true, ...inputOptions } = options;
    const before = new Event("beforeinput", { cancelable });
    Object.assign(before, { inputType: "insertText", data: text, ...inputOptions });
    if (!this.dispatchEvent(before)) return false;
    const start = this.selectionStart;
    this.value = this.value.slice(0, start) + text + this.value.slice(this.selectionEnd);
    this.setSelectionRange(start + text.length, start + text.length);
    this.dispatchEvent(new Event("input"));
    return true;
  }
}

test("cho phép ô trống và bước nhập dở, chỉ nhận số tối đa 10 và hai chữ số thập phân", () => {
  ["", ".", ",", "1", "10", "10.", "10,00", "8.55", "8,55", ".5"].forEach((value) => {
    assert.equal(isAllowedDraft(value), true, value);
  });
  ["11", "10.01", "10.234", "8.555", "8,555", "10.000", "-4", "+4", "8e0", "8a", "8,5.1"].forEach((value) => {
    assert.equal(isAllowedDraft(value), false, value);
  });
});

test("gõ 10 từng ký tự được, ký tự làm vượt 10 bị chặn", () => {
  const input = new ScoreInput();
  for (const char of "10.00") assert.equal(input.insert(char), true);
  assert.equal(input.value, "10.00");
  assert.equal(input.insert("1"), false);
  assert.equal(input.value, "10.00");
  input.setSelectionRange(0, input.value.length);
  assert.equal(input.insert("11"), false);
  assert.equal(input.value, "10.00");
});

test("chặn chữ số thập phân thứ ba khi gõ; vẫn sửa được vùng đang chọn", () => {
  const input = new ScoreInput("8,55");
  assert.equal(input.insert("6"), false);
  input.setSelectionRange(3, 4);
  assert.equal(input.insert("9"), true);
  assert.equal(input.value, "8,59");
  assert.equal(input.acceptedEdits, 1);
});

test("dán điểm hợp lệ được, dán điểm quá lớn/quá hai số lẻ bị chặn và giữ điểm cũ", () => {
  const input = new ScoreInput();
  assert.equal(input.insert("8.55", { inputType: "insertFromPaste" }), true);
  input.setSelectionRange(0, 4);
  for (const value of ["10.234", "11", "8.555", "abc"]) {
    assert.equal(input.insert(value, {
      inputType: "insertFromPaste", data: null,
      dataTransfer: { getData: () => value },
    }), false);
    assert.equal(input.value, "8.55");
  }
  assert.equal(input.insert("9,25", { inputType: "insertFromPaste" }), true);
  assert.equal(input.value, "9,25");
});

test("fallback khôi phục giá trị và con trỏ với autofill, IME hoặc sự kiện không hủy được", () => {
  const input = new ScoreInput("8.55");
  for (const options of [
    { cancelable: false }, { isComposing: true }, { inputType: "insertFromPaste", data: null },
  ]) {
    input.setSelectionRange(0, 4);
    input.insert("10.234", options);
    assert.equal(input.value, "8.55");
    assert.equal(input.selectionStart, 0);
    assert.equal(input.selectionEnd, 4);
    assert.equal(input.acceptedEdits, 0);
  }
});

test("fallback không có beforeinput vẫn chặn giá trị sai; xóa và nhập lại được", () => {
  const input = new ScoreInput("8.55");
  input.value = "99";
  input.dispatchEvent(new Event("input"));
  assert.equal(input.value, "8.55");
  assert.equal(input.acceptedEdits, 0);
  input.value = "";
  input.setSelectionRange(0, 0);
  input.dispatchEvent(new Event("input"));
  assert.equal(input.insert("9,25"), true);
  assert.equal(input.value, "9,25");
});

test("có thể dùng cùng bộ chặn cho GPA hệ 4", () => {
  assert.equal(isAllowedDraft("4", { max: 4, decimals: 2 }), true);
  assert.equal(isAllowedDraft("3,95", { max: 4, decimals: 2 }), true);
  assert.equal(isAllowedDraft("4.01", { max: 4, decimals: 2 }), false);
  assert.equal(isAllowedDraft("3.999", { max: 4, decimals: 2 }), false);

  // Attach a standalone mock with GPA-specific options to verify rejected
  // edits never become visible.
  const gpaInput = new EventTarget();
  gpaInput.value = "3.50";
  gpaInput.selectionStart = 0;
  gpaInput.selectionEnd = 4;
  gpaInput.setSelectionRange = (start, end) => {
    gpaInput.selectionStart = start;
    gpaInput.selectionEnd = end;
  };
  attach(gpaInput, { max: 4, decimals: 2 });
  const before = new Event("beforeinput", { cancelable: true });
  Object.assign(before, { inputType: "insertFromPaste", data: "4.01" });
  assert.equal(gpaInput.dispatchEvent(before), false);
  assert.equal(gpaInput.value, "3.50");
});
