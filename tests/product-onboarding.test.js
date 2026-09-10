const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const domain = require("../domain.js");
const demo = require("../demo-data.js");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("landing có bản dùng thử và dashboard có đầy đủ điểm neo onboarding", () => {
  const html = read("index.html");
  for (const id of [
    "demoButton", "demoBanner", "headerHelpButton", "onboardingHelper", "onboardingChecklist",
    "onboardingWelcome", "productTour", "tourProgress", "replayTourButton",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /Xem thử với dữ liệu mẫu/);
  assert.match(html, /Bật <b>Học<\/b>/);
  assert.match(html, /Kiểm tra <b>Tính GPA<\/b>/);
  assert.match(html, /product-onboarding\.css/);
  assert.match(html, /demo-data\.js/);
  assert.match(html, /product-onboarding\.js/);
});

test("dữ liệu demo D17 hợp lệ, nhất quán và có đủ tình huống hướng dẫn", () => {
  const payload = demo.createPayload();
  domain.validatePayload(payload);
  const model = domain.buildModel(payload);
  const selections = domain.createDefaultSelections(model);
  const requirements = domain.analyzeRequirements(model, selections);
  assert.equal(payload.source.cohort, 17);
  assert.equal(model.unsupportedRegulation, false);
  assert.equal(model.regulationSupportUnknown, false);
  assert.ok(model.completed.some(domain.isFailedCourse));
  assert.ok(model.completed.some((course) => course.excludedFromGpa));
  assert.ok(model.pending.some((course) => course.required));
  assert.ok(model.pending.some((course) => !course.required));
  assert.ok(requirements.groups.some((group) => group.overBy > 0));
  assert.ok(requirements.groups.some((group) => group.remainingWithPlan > 0));
  assert.ok(Math.abs(model.derivedMetrics.cumulative.gpa - payload.summary.cumulativeGpa4) < 0.001);
  assert.ok(Math.abs(model.derivedMetrics.academic.gpa - payload.summary.academicGpa4) < 0.01);
});

test("localStorage chỉ lưu ba cờ giao diện, không lưu dữ liệu học tập", () => {
  const onboarding = read("product-onboarding.js");
  const app = read("app.js");
  assert.match(onboarding, /const STORAGE_KEY = "cham-gpa:onboarding:v1"/);
  assert.equal((onboarding.match(/localStorage\.setItem/g) || []).length, 1);
  const storedObject = onboarding.match(/localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(\{([\s\S]*?)\}\)\)/)?.[1];
  assert.ok(storedObject);
  for (const field of ["promptSeen", "tourCompleted", "customTipSeen"]) assert.match(storedObject, new RegExp(field));
  assert.doesNotMatch(storedObject, /payload|course|targetGpa|score|name/i);
  assert.doesNotMatch(app + read("demo-data.js"), /localStorage|sessionStorage/);
});

test("ứng dụng phát lifecycle event không chứa payload và giữ loadPayload tương thích", () => {
  const app = read("app.js");
  for (const eventName of ["data-ready", "planner-progress", "plan-generated", "data-reset"]) {
    assert.match(app, new RegExp(`emitAppEvent\\("${eventName}"`));
  }
  assert.match(app, /function loadPayload\(payload, options = \{\}\)/);
  assert.match(app, /root\.ULSA_GPA_APP = \{ loadPayload \}/);
  assert.doesNotMatch(
    app.match(/emitAppEvent\("data-ready", \{([\s\S]*?)\}\);/)?.[1] || "",
    /payload|completedCourses|pendingCourses|curriculumCourses|courseName|student|gpaValue/i,
  );
});

test("brief video có đủ luồng sản phẩm và ràng buộc an toàn", () => {
  const brief = read("docs/video-tutorial.md");
  for (const phrase of [
    "1920×1080", "Kết nối bảng điểm", "Chọn môn sẽ học", "Gợi ý tự động",
    "Kế hoạch của tôi", "không phải sản phẩm chính thức", ".srt",
  ]) {
    assert.match(brief.toLowerCase(), new RegExp(phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
