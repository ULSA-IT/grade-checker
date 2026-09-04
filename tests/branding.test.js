const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("web có logo và favicon đóng gói cục bộ cùng tên Chạm GPA", () => {
  const html = read("index.html");
  assert.match(html, /<title>Chạm GPA/);
  assert.match(html, /aria-label="Chạm GPA — Trang chủ"/);
  assert.match(html, /rel="icon"[^>]*href="assets\/cham-gpa.svg"/);
  assert.match(html, /rel="icon"[^>]*href="assets\/favicon32.png"/);
  assert.match(read("assets/cham-gpa.svg"), /viewBox="0 0 64 64"/);
  const png = fs.readFileSync(path.join(root, "assets/favicon32.png"));
  assert.equal(png.readUInt32BE(16), 32);
  assert.equal(png.readUInt32BE(20), 32);
  assert.equal(png[25], 6);
  assert.doesNotMatch(html + read("upload.html"), /ULSA GPA Planner/);
});

test("tên chỉ số chính thức chỉ nằm trong phần giải thích thu gọn", () => {
  const html = read("index.html");
  const guide = html.match(/<details class="metric-guide">[\s\S]*?<\/details>/)?.[0];
  assert.ok(guide);
  assert.match(guide, /<summary>Cách hiểu các chỉ số<\/summary>/);
  assert.match(guide, /TBC tích lũy hệ 4/);
  assert.match(guide, /TBC học tập hệ 4/);
  assert.doesNotMatch(html.replace(guide, "") + read("app.js"), /TBC|tích lũy|Xem dữ liệu điểm đã đọc/);
  for (const label of ["GPA hiện tại", "GPA tính cả môn chưa qua", "Tín chỉ đã đạt", "Bảng điểm của bạn", "Chọn môn sẽ học"]) {
    assert.ok(html.includes(label));
  }
});

test("footer có copyright, năm cập nhật và vẫn giữ thông tin quyền riêng tư", () => {
  const html = read("index.html");
  assert.match(html, /© <span id="copyrightYear">/);
  assert.match(html, /Không phải sản phẩm chính thức của Trường Đại học Lao động – Xã hội/);
  assert.match(html, /Dữ liệu học tập chỉ nằm trong tab này/);
  assert.match(read("app.js"), /getElementById\("copyrightYear"\).textContent = String\(new Date\(\).getFullYear\(\)\)/);
});
