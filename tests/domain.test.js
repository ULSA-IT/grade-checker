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

test("điểm chữ P hoàn thành học phần nhưng không tham gia GPA", () => {
  const payload = makePayload({
    completedCourses: [grade("QP1", "Quân sự chung", 1, null, "P", { excludedFromGpa: true })],
    curriculumCourses: [curriculum("QP1", "Quân sự chung", 1, {
      required: true,
      knowledgeBlock: "Giáo dục quốc phòng - An ninh",
    })],
  });
  const model = domain.buildModel(payload);
  const requirements = domain.analyzeRequirements(model, {});

  assert.equal(domain.isPassedCourse(model.completed[0]), true);
  assert.equal(requirements.missingRequired.length, 0);
  assert.equal(model.derivedMetrics.academic.credits, 0);
  assert.equal(model.derivedMetrics.cumulative.credits, 0);
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
  const missingCohort = domain.buildModel(makePayload({
    source: { mode: "extension", programName: "Chuyên Ngành Chính", cohort: null, regulationSupported: null },
  }));
  assert.equal(missingCohort.cohort, null, "cohort null không được ép thành D0");
  assert.equal(missingCohort.unsupportedRegulation, false);
  assert.equal(missingCohort.regulationSupportUnknown, true);
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

test("quy đổi đúng toàn bộ biên điểm hệ 10 của ULSA", () => {
  [
    ["4,0", "D", 1],
    [4.7, "D+", 1.5],
    [5.5, "C", 2],
    [6.2, "C+", 2.5],
    [7, "B", 3],
    [7.7, "B+", 3.5],
    [8.5, "A", 3.7],
    [9.2, "A+", 4],
    [10, "A+", 4],
  ].forEach(([score10, letter, points]) => {
    assert.deepEqual(
      { letter: domain.score10ToGrade(score10).letter, points: domain.score10ToGrade(score10).points },
      { letter, points },
    );
  });
});

test("chặn điểm hệ 10 ngoài khoảng hoặc có quá một chữ số thập phân", () => {
  [3.9, 10.1, 8.55, "không phải điểm"].forEach((score) => {
    assert.throws(
      () => domain.score10ToGrade(score),
      (error) => error.code === "INVALID_CUSTOM_SCORE",
    );
  });
});

test("khóa hai môn ở A và tính mức B+ đồng đều cho hai môn còn lại", () => {
  const required = [1, 2, 3, 4].map((index) =>
    pending(`NEW${index}`, `Môn mới ${index}`, 3, { required: true, elective: false }));
  const model = domain.buildModel(makePayload({
    pendingCourses: required,
    curriculumCourses: required.map((course) => curriculum(
      course.courseCode,
      course.name,
      course.credits,
      { required: true },
    )),
  }));
  const result = domain.generateCustomPlan(
    model,
    domain.createDefaultSelections(model),
    3.5,
    { futureScores: { NEW1: 8.5, NEW2: 8.5 }, improvements: {} },
  );

  assert.equal(result.feasible, true);
  assert.equal(result.fixedAssignments.length, 2);
  assert.equal(result.suggestedAssignments.length, 2);
  assert.deepEqual(result.suggestedAssignments.map((item) => item.targetGrade), ["B+", "B+"]);
  assert.ok(result.projectedGpa >= 3.5);
  assert.equal(result.remainingAverage4, 3.5);
});

test("kế hoạch tùy chỉnh tính đúng trọng số tín chỉ", () => {
  const model = domain.buildModel(makePayload({
    pendingCourses: [
      pending("TWO", "Môn 2 tín chỉ", 2, { required: true, elective: false }),
      pending("FOUR", "Môn 4 tín chỉ", 4, { required: true, elective: false }),
    ],
    curriculumCourses: [
      curriculum("TWO", "Môn 2 tín chỉ", 2, { required: true }),
      curriculum("FOUR", "Môn 4 tín chỉ", 4, { required: true }),
    ],
  }));
  const result = domain.generateCustomPlan(
    model,
    domain.createDefaultSelections(model),
    3.2,
    { futureScores: { TWO: 8.5 }, improvements: {} },
  );

  assert.equal(result.feasible, true);
  assert.equal(result.suggestedAssignments[0].courseKey, "FOUR");
  assert.equal(result.suggestedAssignments[0].targetGrade, "B");
  assert.ok(Math.abs(result.projectedGpa - (2 * 3.7 + 4 * 3) / 6) < 1e-9);
});

test("học cải thiện phải tăng mức điểm chữ và chỉ cộng phần chênh lệch", () => {
  const model = domain.buildModel(makePayload({
    completedCourses: [grade("IMPROVE", "Môn đang B+", 3, 3.5, "B+")],
    curriculumCourses: [curriculum("IMPROVE", "Môn đang B+", 3, { required: true })],
  }));
  const config = { improvements: { IMPROVE: { selected: true, score10: 8.4 } } };

  assert.throws(
    () => domain.generateCustomPlan(model, {}, 3.6, config),
    (error) => error.code === "IMPROVEMENT_NOT_HIGHER" && /GPA không tăng/.test(error.message),
  );

  config.improvements.IMPROVE.score10 = 8.5;
  const result = domain.generateCustomPlan(model, {}, 3.6, config);
  assert.equal(result.feasible, true);
  assert.equal(result.projectedCredits, 3);
  assert.equal(result.projectedGpa, 3.7);
  assert.ok(Math.abs(result.fixedAssignments[0].impactPoints - 0.6) < 1e-9);
});

test("môn cải thiện để trống được tính ít nhất một bậc cao hơn", () => {
  const model = domain.buildModel(makePayload({
    completedCourses: [grade("IMPROVE", "Môn đang B", 3, 3, "B")],
  }));
  const result = domain.generateCustomPlan(
    model,
    {},
    3.5,
    { improvements: { IMPROVE: { selected: true, score10: null } } },
  );

  assert.equal(result.feasible, true);
  assert.equal(result.suggestedAssignments.length, 1);
  assert.equal(result.suggestedAssignments[0].targetGrade, "B+");
  assert.equal(result.suggestedAssignments[0].minimumScore10, 7.7);
});

test("kế hoạch riêng phân biệt học lại F/F+ với môn mới", () => {
  const model = domain.buildModel(makePayload({
    completedCourses: [grade("FAIL", "Môn từng trượt", 3, 0.5, "F+")],
    pendingCourses: [
      pending("FAIL", "Môn từng trượt", 3, { required: true, elective: false }),
      pending("NEW", "Môn chưa học", 3, { required: true, elective: false }),
    ],
    curriculumCourses: [
      curriculum("FAIL", "Môn từng trượt", 3, { required: true }),
      curriculum("NEW", "Môn chưa học", 3, { required: true }),
    ],
  }));
  const result = domain.generateCustomPlan(
    model,
    domain.createDefaultSelections(model),
    1,
    {},
  );

  assert.equal(result.feasible, true);
  assert.deepEqual(
    result.suggestedAssignments.map((item) => item.type),
    ["retake-failed", "new-course"],
  );
});

test("môn cải thiện trùng mã chỉ xuất hiện một lần và giữ kết quả cao nhất", () => {
  const model = domain.buildModel(makePayload({
    completedCourses: [
      grade("DUP", "Môn học nhiều lần", 3, 2, "C"),
      grade("DUP", "Môn học nhiều lần", 3, 3, "B"),
      grade("OTHER", "Môn khác", 2, 3.7, "A"),
    ],
  }));
  const candidates = domain.getImprovementCandidates(model);

  assert.equal(candidates.length, 2);
  assert.equal(candidates.find((course) => course.key === "DUP").grade4, 3);
});

test("môn không tính TBC trong kế hoạch riêng chỉ yêu cầu đạt", () => {
  const model = domain.buildModel(makePayload({
    completedCourses: [grade("BASE", "Môn nền", 3, 3, "B")],
    pendingCourses: [pending("PE", "Thể chất", 2, {
      required: true,
      elective: false,
      knowledgeBlock: "Giáo dục thể chất",
    })],
    curriculumCourses: [
      curriculum("BASE", "Môn nền", 3, { required: true }),
      curriculum("PE", "Thể chất", 2, { required: true, knowledgeBlock: "Giáo dục thể chất" }),
    ],
  }));
  const result = domain.generateCustomPlan(
    model,
    domain.createDefaultSelections(model),
    3,
    { futureScores: { PE: 9.2 } },
  );

  assert.equal(result.feasible, true);
  assert.equal(result.projectedGpa, 3);
  assert.equal(result.projectedCredits, 3);
  assert.equal(result.nonGpaCourses.length, 1);
  assert.equal(result.assignments.length, 0);
});

test("báo rõ điểm khóa quá thấp khiến mục tiêu không còn khả thi", () => {
  const model = domain.buildModel(makePayload({
    completedCourses: [grade("BASE", "Môn nền", 3, 3, "B")],
    pendingCourses: [
      pending("LOCK", "Môn khóa điểm", 3, { required: true, elective: false }),
      pending("OPEN", "Môn để trống", 3, { required: true, elective: false }),
    ],
    curriculumCourses: [
      curriculum("BASE", "Môn nền", 3, { required: true }),
      curriculum("LOCK", "Môn khóa điểm", 3, { required: true }),
      curriculum("OPEN", "Môn để trống", 3, { required: true }),
    ],
  }));
  const result = domain.generateCustomPlan(
    model,
    domain.createDefaultSelections(model),
    3.5,
    { futureScores: { LOCK: 4 }, improvements: {} },
  );

  assert.equal(result.feasible, false);
  assert.equal(result.code, "LOCKED_SCORES_TOO_LOW");
  assert.ok(result.maximumGpa < 3.5);
});
