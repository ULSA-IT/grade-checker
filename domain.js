(function exposeUlsaGpaDomain(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.UlsaGpaDomain = api;
})(globalThis, function createUlsaGpaDomain() {
  "use strict";

  const GRADE_SCALE = [
    { letter: "D", points: 1 },
    { letter: "D+", points: 1.5 },
    { letter: "C", points: 2 },
    { letter: "C+", points: 2.5 },
    { letter: "B", points: 3 },
    { letter: "B+", points: 3.5 },
    { letter: "A", points: 3.7 },
    { letter: "A+", points: 4 },
  ];
  const NON_GPA_BLOCK_PATTERNS = [
    "giao duc the chat",
    "giao duc quoc phong",
    "quoc phong an ninh",
    "chuan dau ra",
  ];
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
    return !isFailedCourse(course) && Number.isFinite(Number(course?.grade4)) && Number(course.grade4) >= 1;
  }

  function isLikelyNonGpa(course) {
    const block = normalizeSearch(course?.knowledgeBlock);
    return NON_GPA_BLOCK_PATTERNS.some((pattern) => block.includes(pattern));
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
    const cohortValue = Number(payload.source?.cohort);
    const cohort = Number.isInteger(cohortValue) ? cohortValue : null;
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
      (course) => isPassedCourse(course) && !course.excludedFromGpa,
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
    const target = Number(requestedTarget);
    if (!Number.isFinite(target) || target < 0 || target > 4) {
      throw new DomainError("INVALID_TARGET", "GPA mục tiêu phải nằm trong khoảng 0 đến 4.");
    }

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
    validatePayload,
    weightedMetrics,
    buildModel,
    createDefaultSelections,
    mergeSelections,
    analyzeRequirements,
    preparePlannerContext,
    optimizeScenario,
    generateScenarios,
  };
});
