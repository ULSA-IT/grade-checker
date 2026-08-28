const assert = require("node:assert/strict");
const test = require("node:test");
const domain = require("../domain.js");

function makePayload(overrides = {}) {
  return {
    schemaVersion: 1,
    fetchedAt: "2026-08-28T00:00:00.000Z",
    source: { mode: "extension", programName: "Chuyên ngành chính" },
    summary: {},
    completedCourses: [],
    pendingCourses: [],
    curriculumCourses: [],
    electiveGroups: [],
    ...overrides,
  };
}

function grade(courseCode, name, credits, grade4, letterGrade, extra = {}) {
  return {
    courseCode,
    name,
    credits,
    grade4,
    grade10: null,
    letterGrade,
    excludedFromGpa: false,
    ...extra,
  };
}

function curriculum(courseCode, name, credits, extra = {}) {
  return {
    courseCode,
    name,
    credits,
    required: false,
    elective: false,
    electiveGroupId: "",
    knowledgeBlock: "Kiến thức ngành",
    ...extra,
  };
}

function pending(courseCode, name, credits, extra = {}) {
  return {
    courseCode,
    name,
    credits,
    required: false,
    elective: true,
    knowledgeBlock: "Kiến thức ngành",
    ...extra,
  };
}

test("TBC học tập gồm F/F+ còn TBC tích lũy chỉ gồm môn đã đạt", () => {
  const courses = [
    grade("PASS", "Môn đã đạt", 3, 4, "A+"),
    grade("FAIL", "Môn F+", 2, 0.5, "F+"),
    grade("PE", "Giáo dục thể chất", 1, 4, "A+", { excludedFromGpa: true }),
  ];
  const metrics = domain.weightedMetrics(courses);

  assert.equal(metrics.academic.credits, 5);
  assert.equal(metrics.academic.gpa, 2.6);
  assert.equal(metrics.cumulative.credits, 3);
  assert.equal(metrics.cumulative.gpa, 4);
});

test("nhận diện F/F+ trong bảng điểm là môn học lại khi đồng thời chưa tích lũy", () => {
  const payload = makePayload({
    completedCourses: [grade("FAIL", "Môn trượt", 3, 0, "F")],
    pendingCourses: [pending("FAIL", "Môn trượt", 3, { required: true, elective: false })],
    curriculumCourses: [curriculum("FAIL", "Môn trượt", 3, { required: true })],
  });
  const model = domain.buildModel(payload);
  const selections = domain.createDefaultSelections(model);

  assert.equal(model.pending[0].status, "failed");
  assert.equal(model.pending[0].failedRecord.letterGrade, "F");
  assert.equal(selections.FAIL.selected, true);
  assert.equal(selections.FAIL.locked, true);
});

test("fallback tên + tín chỉ chỉ ghép vào môn CTĐT duy nhất", () => {
  const payload = makePayload({
    completedCourses: [grade("", "Kỹ nghệ phần mềm", 3, 3, "B")],
    pendingCourses: [pending("", "Kỹ nghệ phần mềm", 3, { required: true, elective: false })],
    curriculumCourses: [curriculum("SE301", "Kỹ nghệ phần mềm", 3, { required: true })],
  });
  const model = domain.buildModel(payload);
  const analysis = domain.analyzeRequirements(model, domain.createDefaultSelections(model));

  assert.equal(model.completed[0].key, "SE301");
  assert.equal(model.pending[0].key, "SE301");
  assert.equal(analysis.missingRequired.length, 0);
});

test("khóa D16 trở về trước được đánh dấu chưa hỗ trợ quy chế", () => {
  const model = domain.buildModel(makePayload({
    source: { mode: "extension", programName: "CTĐT D16", cohort: 16, regulationSupported: false },
  }));

  assert.equal(model.cohort, 16);
  assert.equal(model.unsupportedRegulation, true);
  assert.equal(domain.buildModel(makePayload()).regulationSupportUnknown, true);
});

test("nhóm tự chọn cảnh báo thiếu, đủ và học dư độc lập với môn bắt buộc", () => {
  const payload = makePayload({
    completedCourses: [
      grade("REQ", "Môn bắt buộc", 3, 3, "B"),
      grade("E1", "Tự chọn 1", 2, 3, "B"),
      grade("E2", "Tự chọn 2", 2, 3.5, "B+"),
    ],
    pendingCourses: [pending("G1", "Môn nhóm 2", 2)],
    curriculumCourses: [
      curriculum("REQ", "Môn bắt buộc", 3, { required: true }),
      curriculum("E1", "Tự chọn 1", 2, { elective: true, electiveGroupId: "1" }),
      curriculum("E2", "Tự chọn 2", 2, { elective: true, electiveGroupId: "1" }),
      curriculum("E3", "Tự chọn 3", 2, { elective: true, electiveGroupId: "1" }),
      curriculum("G1", "Môn nhóm 2", 2, { elective: true, electiveGroupId: "2" }),
    ],
    electiveGroups: [
      { id: "1", offeredCourseCount: 3, requiredCourseCount: 1 },
      { id: "2", offeredCourseCount: 1, requiredCourseCount: 1 },
    ],
  });
  const model = domain.buildModel(payload);
  const defaults = domain.createDefaultSelections(model);
  let analysis = domain.analyzeRequirements(model, defaults);

  assert.equal(analysis.groups[0].overBy, 1);
  assert.equal(analysis.groups[1].remainingWithPlan, 1);
  assert.equal(analysis.academicallyCompleteWithPlan, false);

  defaults.G1.selected = true;
  analysis = domain.analyzeRequirements(model, defaults);
  assert.equal(analysis.groups[1].remainingWithPlan, 0);
  assert.equal(analysis.academicallyCompleteWithPlan, true);
  assert.equal(model.derivedMetrics.cumulative.credits, 7, "môn học dư vẫn tính đủ tín chỉ/GPA");
});

test("môn bắt buộc luôn khóa chọn, môn tự chọn do người dùng quyết định", () => {
  const payload = makePayload({
    pendingCourses: [
      pending("REQ", "Bắt buộc", 3, { required: true, elective: false }),
      pending("ELE", "Tự chọn", 2),
      pending("PE", "Thể chất", 1, { knowledgeBlock: "Giáo dục thể chất" }),
    ],
    curriculumCourses: [
      curriculum("REQ", "Bắt buộc", 3, { required: true }),
      curriculum("ELE", "Tự chọn", 2, { elective: true }),
      curriculum("PE", "Thể chất", 1, { elective: true, knowledgeBlock: "Giáo dục thể chất" }),
    ],
  });
  const selections = domain.createDefaultSelections(domain.buildModel(payload));

  assert.deepEqual(selections.REQ, { selected: true, countsGpa: true, locked: true });
  assert.deepEqual(selections.ELE, { selected: false, countsGpa: true, locked: false });
  assert.deepEqual(selections.PE, { selected: false, countsGpa: false, locked: false });
});

test("ba kịch bản đều đạt mục tiêu và không đề xuất học cải thiện xuống điểm", () => {
  const payload = makePayload({
    completedCourses: [
      grade("LOW", "Môn điểm C", 3, 2, "C"),
      grade("HIGH", "Môn điểm A", 3, 3.7, "A"),
    ],
    pendingCourses: [pending("NEW", "Môn mới bắt buộc", 3, { required: true, elective: false })],
    curriculumCourses: [
      curriculum("LOW", "Môn điểm C", 3, { required: true }),
      curriculum("HIGH", "Môn điểm A", 3, { required: true }),
      curriculum("NEW", "Môn mới bắt buộc", 3, { required: true }),
    ],
  });
  const model = domain.buildModel(payload);
  const selections = domain.createDefaultSelections(model);
  const scenarios = domain.generateScenarios(model, selections, 3);

  scenarios.forEach((scenario) => {
    assert.equal(scenario.result.feasible, true, scenario.title);
    assert.ok(scenario.result.projectedGpa >= 3 - 1e-9, scenario.title);
    scenario.result.assignments.filter((item) => item.type === "improvement").forEach((item) => {
      assert.ok(item.targetPoints > item.fromPoints);
    });
  });
  assert.ok(scenarios[2].result.stressedGpa >= 3 - 1e-9);
});

test("kịch bản cân bằng báo không thể đạt khi mục tiêu vượt trần A", () => {
  const payload = makePayload({
    completedCourses: [grade("LOW", "Môn điểm thấp", 3, 1, "D")],
    curriculumCourses: [curriculum("LOW", "Môn điểm thấp", 3, { required: true })],
  });
  const model = domain.buildModel(payload);
  const result = domain.generateScenarios(model, {}, 3.9).find((scenario) => scenario.id === "balanced").result;

  assert.equal(result.feasible, false);
  assert.ok(result.maximumGpa <= 3.7 + 1e-9);
});

test("môn không tính TBC không làm thay đổi mẫu số GPA dự kiến", () => {
  const payload = makePayload({
    completedCourses: [grade("BASE", "Môn nền", 3, 3, "B")],
    pendingCourses: [pending("PE", "Thể chất", 2, { required: true, elective: false, knowledgeBlock: "Giáo dục thể chất" })],
    curriculumCourses: [
      curriculum("BASE", "Môn nền", 3, { required: true }),
      curriculum("PE", "Thể chất", 2, { required: true, knowledgeBlock: "Giáo dục thể chất" }),
    ],
  });
  const model = domain.buildModel(payload);
  const selections = domain.createDefaultSelections(model);
  const context = domain.preparePlannerContext(model, selections);

  assert.equal(context.denominator, 3);
  assert.equal(context.futureNonGpaCourses.length, 1);
});
