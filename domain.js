(function exposeUlsaGpaDomain(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.UlsaGpaDomain = api;
})(globalThis, function createUlsaGpaDomain() {
  "use strict";

  const GRADE_SCALE = [
    { letter: "D", points: 1, minScore10: 4, maxScore10: 4.6 },
    { letter: "D+", points: 1.5, minScore10: 4.7, maxScore10: 5.4 },
    { letter: "C", points: 2, minScore10: 5.5, maxScore10: 6.1 },
    { letter: "C+", points: 2.5, minScore10: 6.2, maxScore10: 6.9 },
    { letter: "B", points: 3, minScore10: 7, maxScore10: 7.6 },
    { letter: "B+", points: 3.5, minScore10: 7.7, maxScore10: 8.4 },
    { letter: "A", points: 3.7, minScore10: 8.5, maxScore10: 9.1 },
    { letter: "A+", points: 4, minScore10: 9.2, maxScore10: 10 },
  ];
  const NON_GPA_BLOCK_PATTERNS = [
    "giao duc the chat",
    "giao duc quoc phong",
    "quoc phong an ninh",
    "chuan dau ra",
  ];
  const PASSING_STATUS_LABELS = new Set(["p", "pass", "dat"]);
  const SCORE_SCALE = 10;

  class DomainError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "DomainError";
      this.code = code;
    }
  }

  function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function normalizeSearch(value) {
    return normalizeText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase();
  }

  function normalizeCourseCode(value) {
    return normalizeText(value).normalize("NFC").replace(/\s+/g, "").toUpperCase();
  }

  function courseKey(course, index = 0) {
    const code = normalizeCourseCode(course?.courseCode);
    if (code) return code;
    return `NAME:${normalizeSearch(course?.name)}:${Number(course?.credits) || 0}:${index}`;
  }

  function isFailedCourse(course) {
    return /^F\+?$/i.test(normalizeText(course?.letterGrade));
  }

  function isPassedCourse(course) {
    if (PASSING_STATUS_LABELS.has(normalizeSearch(course?.letterGrade))) return true;
    return !isFailedCourse(course) && Number.isFinite(Number(course?.grade4)) && Number(course.grade4) >= 1;
  }

  function isLikelyNonGpa(course) {
    const block = normalizeSearch(course?.knowledgeBlock);
    return NON_GPA_BLOCK_PATTERNS.some((pattern) => block.includes(pattern));
  }

  function score10ToGrade(value) {
    const normalized = typeof value === "string" ? value.replace(",", ".").trim() : value;
    const score10 = Number(normalized);
    if (!Number.isFinite(score10) || score10 < 4 || score10 > 10) {
      throw new DomainError("INVALID_CUSTOM_SCORE", "Điểm dự kiến phải nằm trong khoảng 4,0 đến 10,0.");
    }
    if ((typeof normalized === "string" && !/^\d+(?:\.\d{0,2})?$/.test(normalized)) ||
      Math.abs(score10 * 100 - Math.round(score10 * 100)) > 1e-8) {
      throw new DomainError("INVALID_CUSTOM_SCORE", "Điểm dự kiến chỉ được có tối đa hai chữ số thập phân.");
    }
    // Compare thresholds directly: 8.49 stays B+, rather than rounding up to A.
    const grade = [...GRADE_SCALE].reverse().find((item) => score10 + 1e-9 >= item.minScore10);
    return { ...grade, score10 };
  }

  function parseTargetGpa(value, minimum = 0) {
    const normalized = typeof value === "string" ? value.replace(",", ".").trim() : value;
    const target = Number(normalized);
    if (!Number.isFinite(target) || target < 0 || target > 4) {
      throw new DomainError("INVALID_TARGET", "GPA mục tiêu phải nằm trong khoảng 0 đến 4.");
    }
    if ((typeof normalized === "string" && !/^\d+(?:\.\d{0,2})?$/.test(normalized)) ||
      Math.abs(target * 100 - Math.round(target * 100)) > 1e-8) {
      throw new DomainError("INVALID_TARGET", "GPA mục tiêu chỉ được có tối đa hai chữ số thập phân.");
    }
    const minimumTarget = Number(minimum);
    if (Number.isFinite(minimumTarget) && target + 1e-9 < minimumTarget) {
      throw new DomainError(
        "TARGET_BELOW_CURRENT",
        `GPA mục tiêu không thể thấp hơn GPA hiện tại (${minimumTarget.toFixed(2)}).`,
      );
    }
    return target;
  }

  function currentCumulativeGpa(model) {
    const rawPortalValue = model?.payload?.summary?.cumulativeGpa4;
    const portalValue = rawPortalValue === null || rawPortalValue === undefined || rawPortalValue === ""
      ? NaN
      : Number(typeof rawPortalValue === "string" ? rawPortalValue.replace(",", ".") : rawPortalValue);
    if (Number.isFinite(portalValue)) return portalValue;
    const derivedValue = Number(model?.derivedMetrics?.cumulative?.gpa);
    return Number.isFinite(derivedValue) ? derivedValue : 0;
  }

  function validatePayload(payload) {
    if (payload?.schemaVersion !== 1) {
      throw new DomainError("SCHEMA_INVALID", "Phiên bản dữ liệu không được hỗ trợ.");
    }
    for (const field of ["completedCourses", "pendingCourses", "curriculumCourses", "electiveGroups"]) {
      if (!Array.isArray(payload[field])) {
        throw new DomainError("SCHEMA_INVALID", `Thiếu danh sách ${field}.`);
      }
    }
    return true;
  }

  function weightedMetrics(courses) {
    const academic = courses.filter((course) =>
      !course.excludedFromGpa && Number.isFinite(Number(course.credits)) &&
      Number.isFinite(Number(course.grade4)),
    );
    const cumulative = academic.filter(isPassedCourse);
    const summarize = (rows) => {
      const credits = rows.reduce((sum, course) => sum + Number(course.credits), 0);
      const points = rows.reduce(
        (sum, course) => sum + Number(course.credits) * Number(course.grade4),
        0,
      );
      return { credits, points, gpa: credits ? points / credits : null };
    };
    return { academic: summarize(academic), cumulative: summarize(cumulative) };
  }

  function createCurriculumIndex(curriculumCourses) {
    const byCode = new Map();
    const byNameAndCredits = new Map();
    curriculumCourses.forEach((course) => {
      const code = normalizeCourseCode(course.courseCode);
      if (code) byCode.set(code, course);
      const fallbackKey = `${normalizeSearch(course.name)}|${Number(course.credits) || 0}`;
      const list = byNameAndCredits.get(fallbackKey) || [];
      list.push(course);
      byNameAndCredits.set(fallbackKey, list);
    });
    return { byCode, byNameAndCredits };
  }

  function matchCurriculum(course, index) {
    const code = normalizeCourseCode(course.courseCode);
    if (code && index.byCode.has(code)) return index.byCode.get(code);
    const fallbackKey = `${normalizeSearch(course.name)}|${Number(course.credits) || 0}`;
    const matches = index.byNameAndCredits.get(fallbackKey) || [];
    return matches.length === 1 ? matches[0] : null;
  }

  function buildModel(payload) {
    validatePayload(payload);
    const curriculum = payload.curriculumCourses.map((course, index) => ({
      ...course,
      key: courseKey(course, index),
    }));
    const curriculumIndex = createCurriculumIndex(curriculum);
    const completed = payload.completedCourses.map((course, index) => ({
      ...course,
      curriculum: matchCurriculum(course, curriculumIndex),
    })).map((course, index) => ({
      ...course,
      key: course.curriculum?.key || courseKey(course, index),
    }));
    const passedCodes = new Set(completed.filter(isPassedCourse).map((course) => course.key));
    const failedByCode = new Map(
      completed.filter((course) => isFailedCourse(course) && !passedCodes.has(course.key))
        .map((course) => [course.key, course]),
    );
    const pending = payload.pendingCourses.map((course, index) => {
      const curriculum = matchCurriculum(course, curriculumIndex);
      const key = curriculum?.key || courseKey(course, index);
      return {
        ...course,
        key,
        curriculum,
        required: Boolean(curriculum?.required || course.required),
        elective: Boolean(curriculum?.elective || course.elective),
        electiveGroupId: normalizeText(curriculum?.electiveGroupId),
        knowledgeBlock: curriculum?.knowledgeBlock || course.knowledgeBlock || "",
        failedRecord: failedByCode.get(key) || null,
        status: failedByCode.has(key) ? "failed" : "pending",
      };
    });
    const derivedMetrics = weightedMetrics(completed);
    const portalSummary = payload.summary || {};
    const rawCohort = payload.source?.cohort;
    const hasCohort = rawCohort !== null && rawCohort !== undefined && normalizeText(rawCohort) !== "";
    const cohortValue = hasCohort ? Number(rawCohort) : null;
    const cohort = Number.isInteger(cohortValue) && cohortValue > 0 ? cohortValue : null;
    const unsupportedRegulation = payload.source?.regulationSupported === false ||
      (cohort !== null && cohort <= 16);
    const supportedRegulation = payload.source?.regulationSupported === true ||
      (cohort !== null && cohort >= 17);
    const summaryMismatch = {
      academic: Number.isFinite(portalSummary.academicGpa4) && derivedMetrics.academic.gpa !== null
        ? Math.abs(portalSummary.academicGpa4 - derivedMetrics.academic.gpa) > 0.011
        : false,
      cumulative: Number.isFinite(portalSummary.cumulativeGpa4) && derivedMetrics.cumulative.gpa !== null
        ? Math.abs(portalSummary.cumulativeGpa4 - derivedMetrics.cumulative.gpa) > 0.011
        : false,
    };

    return {
      payload,
      completed,
      pending,
      curriculum,
      electiveGroups: payload.electiveGroups,
      passedCodes,
      failedByCode,
      derivedMetrics,
      summaryMismatch,
      limitedMode: payload.source?.mode === "legacy",
      cohort,
      unsupportedRegulation,
      regulationSupportUnknown: !unsupportedRegulation && !supportedRegulation,
    };
  }

  function createDefaultSelections(model) {
    return Object.fromEntries(model.pending.map((course) => {
      const countsGpa = course.failedRecord
        ? !course.failedRecord.excludedFromGpa
        : !isLikelyNonGpa(course);
      return [course.key, {
        selected: Boolean(course.required),
        countsGpa,
        locked: Boolean(course.required),
      }];
    }));
  }

  function mergeSelections(model, selections = {}) {
    const defaults = createDefaultSelections(model);
    return Object.fromEntries(model.pending.map((course) => {
      const current = { ...defaults[course.key], ...(selections[course.key] || {}) };
      if (course.required) {
        current.selected = true;
        current.locked = true;
      }
      return [course.key, current];
    }));
  }

  function analyzeRequirements(model, selections = {}) {
    if (model.limitedMode) {
      return {
        limitedMode: true,
        missingRequired: [],
        groups: [],
        academicallyCompleteNow: null,
        academicallyCompleteWithPlan: null,
      };
    }

    const merged = mergeSelections(model, selections);
    const missingRequired = model.curriculum
      .filter((course) => course.required && !model.passedCodes.has(course.key));
    const groups = model.electiveGroups.map((rule) => {
      const id = normalizeText(rule.id);
      const groupCourses = model.curriculum.filter((course) => normalizeText(course.electiveGroupId) === id);
      const completedKeys = new Set(groupCourses.filter((course) => model.passedCodes.has(course.key)).map((c) => c.key));
      const selectedKeys = new Set(model.pending
        .filter((course) => normalizeText(course.electiveGroupId) === id && merged[course.key]?.selected)
        .map((course) => course.key));
      completedKeys.forEach((key) => selectedKeys.delete(key));
      const requiredCount = Number(rule.requiredCourseCount) || 0;
      const completedCount = completedKeys.size;
      const plannedCount = selectedKeys.size;
      return {
        id,
        offeredCount: Number(rule.offeredCourseCount) || groupCourses.length,
        requiredCount,
        completedCount,
        plannedCount,
        remainingNow: Math.max(0, requiredCount - completedCount),
        remainingWithPlan: Math.max(0, requiredCount - completedCount - plannedCount),
        overBy: Math.max(0, completedCount - requiredCount),
      };
    });

    const missingRequiredWithPlan = missingRequired.filter((course) => !merged[course.key]?.selected);
    return {
      limitedMode: false,
      missingRequired,
      missingRequiredWithPlan,
      groups,
      academicallyCompleteNow: missingRequired.length === 0 && groups.every((group) => group.remainingNow === 0),
      academicallyCompleteWithPlan: missingRequiredWithPlan.length === 0 &&
        groups.every((group) => group.remainingWithPlan === 0),
    };
  }

  function getGradeOptions(capPoints, minimumPoints = 1) {
    return GRADE_SCALE.filter((grade) => grade.points <= capPoints && grade.points >= minimumPoints);
  }

  function previousGrade(points) {
    const lower = GRADE_SCALE.filter((grade) => grade.points < points);
    return lower.length ? lower[lower.length - 1] : null;
  }

  function preparePlannerContext(model, selections) {
    const merged = mergeSelections(model, selections);
    const cumulativeCourses = model.completed.filter(
      (course) => isPassedCourse(course) && !course.excludedFromGpa && Number.isFinite(Number(course.grade4)),
    );
    const currentCredits = cumulativeCourses.reduce((sum, course) => sum + Number(course.credits), 0);
    const currentPoints = cumulativeCourses.reduce(
      (sum, course) => sum + Number(course.credits) * Number(course.grade4),
      0,
    );
    const selectedPending = model.pending.filter((course) => merged[course.key]?.selected);
    const futureGpaCourses = selectedPending.filter((course) => merged[course.key]?.countsGpa);
    const futureNonGpaCourses = selectedPending.filter((course) => !merged[course.key]?.countsGpa);
    const denominator = currentCredits + futureGpaCourses.reduce(
      (sum, course) => sum + Number(course.credits),
      0,
    );
    const improvements = cumulativeCourses.filter((course) => Number(course.grade4) < 4);
    return {
      merged,
      cumulativeCourses,
      currentCredits,
      currentPoints,
      futureGpaCourses,
      futureNonGpaCourses,
      improvements,
      denominator,
    };
  }

  function getImprovementCandidates(model) {
    const byKey = new Map();
    model.completed.forEach((course) => {
      if (!isPassedCourse(course) || course.excludedFromGpa ||
        !Number.isFinite(Number(course.grade4)) || Number(course.grade4) >= 4) return;
      const current = byKey.get(course.key);
      const currentGrade4 = Number(current?.grade4);
      const nextGrade4 = Number(course.grade4);
      const currentGrade10 = Number(current?.grade10);
      const nextGrade10 = Number(course.grade10);
      if (!current || nextGrade4 > currentGrade4 ||
        (nextGrade4 === currentGrade4 && nextGrade10 > currentGrade10)) {
        byKey.set(course.key, course);
      }
    });
    return Array.from(byKey.values());
  }

  function hasCustomScore(value) {
    return value !== null && value !== undefined && String(value).trim() !== "";
  }

  function createCustomAssignment(variable, target, fixedScore10 = null) {
    const improvement = variable.type === "improvement";
    const credits = Number(variable.course.credits);
    return {
      type: variable.type,
      courseKey: variable.course.key,
      courseCode: variable.course.courseCode,
      name: variable.course.name,
      credits,
      fromPoints: improvement ? Number(variable.course.grade4) : null,
      fromGrade: improvement ? variable.course.letterGrade : null,
      targetGrade: target.letter,
      targetPoints: target.points,
      score10: fixedScore10,
      minimumScore10: fixedScore10 === null ? target.minScore10 : null,
      fixed: fixedScore10 !== null,
      impactPoints: improvement
        ? (target.points - Number(variable.course.grade4)) * credits
        : target.points * credits,
    };
  }

  function customStateTuple(state) {
    const spread = state.assignmentCount > 1 ? state.maxGradeIndex - state.minGradeIndex : 0;
    return [state.maxGradeIndex, spread, state.score10Effort, state.addedUnits];
  }

  function generateCustomPlan(model, selections, requestedTarget, customPlan = {}) {
    const target = parseTargetGpa(requestedTarget, currentCumulativeGpa(model));

    const context = preparePlannerContext(model, selections);
    if (!context.denominator) {
      return {
        feasible: false,
        code: "NO_GPA_COURSES",
        target,
        maximumGpa: null,
        assignments: [],
        fixedAssignments: [],
        suggestedAssignments: [],
        nonGpaCourses: context.futureNonGpaCourses,
      };
    }

    const futureScores = customPlan.futureScores || {};
    const improvementConfig = customPlan.improvements || {};
    const improvementCandidates = getImprovementCandidates(model);
    const selectedImprovements = improvementCandidates.filter(
      (course) => Boolean(improvementConfig[course.key]?.selected),
    );
    const fixedAssignments = [];
    const variables = [];
    let fixedImpactPoints = 0;

    context.futureGpaCourses.forEach((course) => {
      const variable = { type: course.failedRecord ? "retake-failed" : "new-course", course };
      const fixedValue = futureScores[course.key];
      if (hasCustomScore(fixedValue)) {
        const targetGrade = score10ToGrade(fixedValue);
        const assignment = createCustomAssignment(variable, targetGrade, targetGrade.score10);
        fixedAssignments.push(assignment);
        fixedImpactPoints += assignment.impactPoints;
        return;
      }
      variables.push({
        ...variable,
        options: GRADE_SCALE.map((grade, gradeIndex) => ({
          target: grade,
          gradeIndex,
          scoreUnits: Math.round(grade.points * Number(course.credits) * SCORE_SCALE),
          score10Effort: Math.round(grade.minScore10 * Number(course.credits) * SCORE_SCALE),
        })),
      });
    });

    selectedImprovements.forEach((course) => {
      const variable = { type: "improvement", course };
      const fixedValue = improvementConfig[course.key]?.score10;
      if (hasCustomScore(fixedValue)) {
        const targetGrade = score10ToGrade(fixedValue);
        if (targetGrade.points <= Number(course.grade4)) {
          throw new DomainError(
            "IMPROVEMENT_NOT_HIGHER",
            `${course.name}: ${String(fixedValue).replace(".", ",")} vẫn quy đổi thành ${targetGrade.letter} (${targetGrade.points.toFixed(1)}), nên GPA không tăng.`,
          );
        }
        const assignment = createCustomAssignment(variable, targetGrade, targetGrade.score10);
        fixedAssignments.push(assignment);
        fixedImpactPoints += assignment.impactPoints;
        return;
      }
      const options = GRADE_SCALE.map((grade, gradeIndex) => ({ grade, gradeIndex }))
        .filter(({ grade }) => grade.points > Number(course.grade4))
        .map(({ grade, gradeIndex }) => ({
          target: grade,
          gradeIndex,
          scoreUnits: Math.round(
            (grade.points - Number(course.grade4)) * Number(course.credits) * SCORE_SCALE,
          ),
          score10Effort: Math.round(grade.minScore10 * Number(course.credits) * SCORE_SCALE),
        }));
      if (options.length) variables.push({ ...variable, options });
    });

    const baseUnits = Math.round((context.currentPoints + fixedImpactPoints) * SCORE_SCALE);
    const requiredUnits = Math.ceil(target * context.denominator * SCORE_SCALE - baseUnits - 1e-9);
    let states = new Map([[0, {
      addedUnits: 0,
      maxGradeIndex: 0,
      minGradeIndex: Number.POSITIVE_INFINITY,
      assignmentCount: 0,
      score10Effort: 0,
      assignments: [],
    }]]);

    variables.forEach((variable) => {
      const next = new Map();
      states.forEach((state) => {
        variable.options.forEach((option) => {
          const addedUnits = state.addedUnits + option.scoreUnits;
          const candidate = {
            addedUnits,
            maxGradeIndex: Math.max(state.maxGradeIndex, option.gradeIndex),
            minGradeIndex: Math.min(state.minGradeIndex, option.gradeIndex),
            assignmentCount: state.assignmentCount + 1,
            score10Effort: state.score10Effort + option.score10Effort,
            assignments: [
              ...state.assignments,
              createCustomAssignment(variable, option.target),
            ],
          };
          const current = next.get(addedUnits);
          if (!current || compareTuple(customStateTuple(candidate), customStateTuple(current)) < 0) {
            next.set(addedUnits, candidate);
          }
        });
      });
      states = next;
    });

    const allStates = Array.from(states.values());
    const maximumState = allStates.slice().sort((left, right) => right.addedUnits - left.addedUnits)[0];
    const maximumGpa = (baseUnits + (maximumState?.addedUnits || 0)) /
      (context.denominator * SCORE_SCALE);
    const candidates = allStates.filter((state) => state.addedUnits >= Math.max(0, requiredUnits));
    const selectedImpactCount = context.futureGpaCourses.length + selectedImprovements.length;

    if (!candidates.length) {
      const maximumWithoutLocks = (
        context.currentPoints +
        context.futureGpaCourses.reduce((sum, course) => sum + Number(course.credits) * 4, 0) +
        selectedImprovements.reduce(
          (sum, course) => sum + (4 - Number(course.grade4)) * Number(course.credits),
          0,
        )
      ) / context.denominator;
      const merged = context.merged;
      const hasMoreCourses = model.pending.some(
        (course) => !merged[course.key]?.selected && merged[course.key]?.countsGpa,
      ) ||
        improvementCandidates.some((course) => !improvementConfig[course.key]?.selected);
      let code = "TARGET_UNREACHABLE";
      let reason = "Ngay cả khi mọi ô còn trống đạt A+, các môn đã chọn vẫn chưa đủ để chạm mục tiêu.";
      if (!selectedImpactCount) {
        code = "NO_CUSTOM_COURSES";
        reason = "Chưa có môn tính GPA hoặc môn học cải thiện nào trong kế hoạch.";
      } else if (fixedAssignments.length && maximumWithoutLocks + 1e-9 >= target) {
        code = "LOCKED_SCORES_TOO_LOW";
        reason = "Một hoặc nhiều điểm đã khóa quá thấp; nếu để hệ thống tính lại các ô đó thì mục tiêu vẫn có thể đạt.";
      } else if (hasMoreCourses) {
        code = "MORE_COURSES_NEEDED";
        reason = "Các môn hiện chọn chưa tạo đủ dư địa; hãy chọn thêm môn mới hoặc môn học cải thiện.";
      } else {
        code = "NO_MORE_IMPROVEMENTS";
        reason = "Không còn môn phù hợp để cải thiện và mức tối đa của kế hoạch vẫn thấp hơn mục tiêu.";
      }
      return {
        feasible: false,
        code,
        reason,
        target,
        maximumGpa,
        assignments: fixedAssignments,
        fixedAssignments,
        suggestedAssignments: [],
        selectedFutureCount: context.futureGpaCourses.length,
        nonGpaCourses: context.futureNonGpaCourses,
        projectedCredits: context.denominator,
      };
    }

    candidates.sort((left, right) => {
      const primary = compareTuple(customStateTuple(left), customStateTuple(right));
      if (primary !== 0) return primary;
      return (left.addedUnits - Math.max(0, requiredUnits)) -
        (right.addedUnits - Math.max(0, requiredUnits));
    });
    const best = candidates[0];
    const projectedGpa = (baseUnits + best.addedUnits) / (context.denominator * SCORE_SCALE);
    const suggestedCredits = best.assignments.reduce((sum, item) => sum + item.credits, 0);
    const remainingAverage4 = suggestedCredits
      ? best.assignments.reduce((sum, item) => sum + item.targetPoints * item.credits, 0) /
        suggestedCredits
      : null;

    return {
      feasible: true,
      code: "CUSTOM_PLAN_READY",
      target,
      projectedGpa,
      maximumGpa,
      projectedCredits: context.denominator,
      assignments: [...fixedAssignments, ...best.assignments],
      fixedAssignments,
      suggestedAssignments: best.assignments,
      remainingAverage4,
      selectedFutureCount: context.futureGpaCourses.length,
      nonGpaCourses: context.futureNonGpaCourses,
    };
  }

  function compareTuple(left, right) {
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const difference = (left[index] ?? 0) - (right[index] ?? 0);
      if (Math.abs(difference) > 1e-9) return difference;
    }
    return 0;
  }

  function stateTuple(state, mode) {
    if (mode === "minimal") {
      return [state.retakeCount, state.effort, state.maxTargetPoints, state.worstDropUnits];
    }
    if (mode === "reserve") {
      return [state.worstDropUnits, state.maxTargetPoints, state.retakeCount, state.effort];
    }
    return [state.maxTargetPoints, state.retakeCount, state.effort, state.worstDropUnits];
  }

  function makeVariables(context, capPoints, minimumFuturePoints) {
    const futureOptions = getGradeOptions(capPoints, minimumFuturePoints);
    const futureVariables = context.futureGpaCourses.map((course) => ({
      type: course.failedRecord ? "retake-failed" : "new-course",
      course,
      options: futureOptions.map((grade, index) => ({
        target: grade,
        scoreUnits: Math.round(grade.points * Number(course.credits) * SCORE_SCALE),
        retakeIncrement: 0,
        effort: index,
        dropUnits: Math.round(
          (grade.points - (previousGrade(grade.points)?.points ?? grade.points)) *
          Number(course.credits) * SCORE_SCALE,
        ),
      })),
    }));
    const improvementVariables = context.improvements.map((course) => {
      const currentPoints = Number(course.grade4);
      const options = [{
        target: null,
        scoreUnits: 0,
        retakeIncrement: 0,
        effort: 0,
        dropUnits: 0,
      }];
      getGradeOptions(capPoints).filter((grade) => grade.points > currentPoints).forEach((grade) => {
        const lowerPoints = Math.max(currentPoints, previousGrade(grade.points)?.points ?? currentPoints);
        options.push({
          target: grade,
          scoreUnits: Math.round((grade.points - currentPoints) * Number(course.credits) * SCORE_SCALE),
          retakeIncrement: 1,
          effort: Math.round((grade.points - currentPoints) * 10),
          dropUnits: Math.round((grade.points - lowerPoints) * Number(course.credits) * SCORE_SCALE),
        });
      });
      return { type: "improvement", course, options };
    }).filter((variable) => variable.options.length > 1);
    return [...futureVariables, ...improvementVariables];
  }

  function optimizeScenario(model, selections, requestedTarget, configuration) {
    const target = parseTargetGpa(requestedTarget, currentCumulativeGpa(model));

    const context = preparePlannerContext(model, selections);
    if (!context.denominator) {
      return { feasible: false, code: "NO_GPA_COURSES", maximumGpa: null, assignments: [] };
    }
    const goal = Math.min(4, configuration.reserve ? target + 0.05 : target);
    const minimumFuturePoints = configuration.reserve ? 1.5 : 1;
    const variables = makeVariables(context, configuration.capPoints, minimumFuturePoints);
    const baseUnits = Math.round(context.currentPoints * SCORE_SCALE);
    const requiredUnits = Math.ceil(goal * context.denominator * SCORE_SCALE - baseUnits - 1e-9);
    let states = new Map([[0, {
      addedUnits: 0,
      retakeCount: 0,
      effort: 0,
      maxTargetPoints: 0,
      worstDropUnits: 0,
      assignments: [],
    }]]);

    variables.forEach((variable) => {
      const next = new Map();
      states.forEach((state) => {
        variable.options.forEach((option) => {
          const addedUnits = state.addedUnits + option.scoreUnits;
          const candidate = {
            addedUnits,
            retakeCount: state.retakeCount + option.retakeIncrement,
            effort: state.effort + option.effort,
            maxTargetPoints: Math.max(state.maxTargetPoints, option.target?.points || 0),
            worstDropUnits: Math.max(state.worstDropUnits, option.dropUnits),
            assignments: option.target
              ? [...state.assignments, {
                type: variable.type,
                courseKey: variable.course.key,
                courseCode: variable.course.courseCode,
                name: variable.course.name,
                credits: Number(variable.course.credits),
                fromPoints: variable.type === "improvement" ? Number(variable.course.grade4) : null,
                fromGrade: variable.type === "improvement" ? variable.course.letterGrade : null,
                targetGrade: option.target.letter,
                targetPoints: option.target.points,
                impactPoints: option.scoreUnits / SCORE_SCALE,
              }]
              : state.assignments,
          };
          const current = next.get(addedUnits);
          if (!current || compareTuple(
            stateTuple(candidate, configuration.mode),
            stateTuple(current, configuration.mode),
          ) < 0) {
            next.set(addedUnits, candidate);
          }
        });
      });
      states = next;
    });

    const candidates = Array.from(states.values()).filter((state) => {
      if (state.addedUnits < Math.max(0, requiredUnits)) return false;
      if (!configuration.reserve) return true;
      const stressedGpa = (baseUnits + state.addedUnits - state.worstDropUnits) /
        (context.denominator * SCORE_SCALE);
      return stressedGpa + 1e-9 >= target;
    });

    const maximumState = Array.from(states.values()).sort((a, b) => b.addedUnits - a.addedUnits)[0];
    const maximumGpa = maximumState
      ? (baseUnits + maximumState.addedUnits) / (context.denominator * SCORE_SCALE)
      : context.currentPoints / context.denominator;
    if (!candidates.length) {
      return {
        feasible: false,
        code: "TARGET_UNREACHABLE",
        target,
        goal,
        maximumGpa,
        assignments: [],
        selectedFutureCount: context.futureGpaCourses.length,
        nonGpaCourses: context.futureNonGpaCourses,
      };
    }

    candidates.sort((left, right) => {
      const primary = compareTuple(
        stateTuple(left, configuration.mode),
        stateTuple(right, configuration.mode),
      );
      if (primary !== 0) return primary;
      const leftOvershoot = left.addedUnits - Math.max(0, requiredUnits);
      const rightOvershoot = right.addedUnits - Math.max(0, requiredUnits);
      return leftOvershoot - rightOvershoot;
    });
    const best = candidates[0];
    const projectedGpa = (baseUnits + best.addedUnits) / (context.denominator * SCORE_SCALE);
    const stressedGpa = configuration.reserve
      ? (baseUnits + best.addedUnits - best.worstDropUnits) / (context.denominator * SCORE_SCALE)
      : null;

    return {
      feasible: true,
      target,
      goal,
      projectedGpa,
      stressedGpa,
      maximumGpa,
      assignments: best.assignments,
      retakeCount: best.retakeCount,
      selectedFutureCount: context.futureGpaCourses.length,
      nonGpaCourses: context.futureNonGpaCourses,
      projectedCredits: context.denominator,
    };
  }

  function generateScenarios(model, selections, target) {
    return [
      {
        id: "minimal",
        title: "Ít môn",
        description: "Cho phép tới A+ và ưu tiên ít môn học cải thiện nhất.",
        result: optimizeScenario(model, selections, target, {
          mode: "minimal",
          capPoints: 4,
          reserve: false,
        }),
      },
      {
        id: "balanced",
        title: "Cân bằng",
        description: "Giới hạn ở A và hạ mức điểm khó nhất trước khi giảm số môn.",
        result: optimizeScenario(model, selections, target, {
          mode: "balanced",
          capPoints: 3.7,
          reserve: false,
        }),
      },
      {
        id: "reserve",
        title: "Dự phòng",
        description: "Nhắm cao hơn 0,05 và chịu được một môn ảnh hưởng lớn nhất giảm một bậc.",
        result: optimizeScenario(model, selections, target, {
          mode: "reserve",
          capPoints: 3.7,
          reserve: true,
        }),
      },
    ];
  }

  return {
    DomainError,
    GRADE_SCALE,
    normalizeText,
    normalizeSearch,
    normalizeCourseCode,
    courseKey,
    isFailedCourse,
    isPassedCourse,
    isLikelyNonGpa,
    score10ToGrade,
    parseTargetGpa,
    validatePayload,
    weightedMetrics,
    buildModel,
    createDefaultSelections,
    mergeSelections,
    analyzeRequirements,
    preparePlannerContext,
    getImprovementCandidates,
    optimizeScenario,
    generateScenarios,
    generateCustomPlan,
  };
});
