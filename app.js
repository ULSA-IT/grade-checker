(function initializeApp(root) {
  "use strict";

  const domain = root.UlsaGpaDomain;
  const importer = root.UlsaGpaImport;
  const state = {
    payload: null,
    model: null,
    selections: {},
    filter: "all",
    customPlan: { futureScores: {}, improvements: {} },
    customResultDirty: false,
    activePlannerTab: "automatic",
    automaticResultDirty: false,
  };

  const elements = {};

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatNumber(value, digits = 2) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
  }

  function formatScore10(value) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(1).replace(".", ",") : "—";
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "Không rõ thời điểm"
      : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function setImportStatus(message, error = false) {
    elements.importStatus.hidden = false;
    elements.importStatus.classList.toggle("is-error", error);
    elements.importStatus.textContent = message;
  }

  function clearHandoffHash() {
    if (root.location.hash.startsWith("#handoff=")) {
      root.history.replaceState(null, "", `${root.location.pathname}${root.location.search}`);
    }
  }

  function currentSummaryValue(name, fallback) {
    const portalValue = Number(state.payload?.summary?.[name]);
    return Number.isFinite(portalValue) ? portalValue : fallback;
  }

  function loadPayload(payload) {
    domain.validatePayload(payload);
    state.payload = payload;
    state.model = domain.buildModel(payload);
    state.selections = domain.createDefaultSelections(state.model);
    state.filter = "all";
    state.customPlan = { futureScores: {}, improvements: {} };
    state.customResultDirty = false;
    state.activePlannerTab = "automatic";
    state.automaticResultDirty = false;
    clearHandoffHash();
    renderDashboard();
  }

  function renderDashboard() {
    const model = state.model;
    const derived = model.derivedMetrics;
    const cumulative = currentSummaryValue("cumulativeGpa4", derived.cumulative.gpa);
    const academic = currentSummaryValue("academicGpa4", derived.academic.gpa);
    const credits = currentSummaryValue("accumulatedCredits", derived.cumulative.credits);
    const failedCount = model.completed.filter(domain.isFailedCourse).length;

    elements.landingPanel.hidden = true;
    elements.dashboard.hidden = false;
    elements.programName.textContent = state.payload.source?.programName || "Chương trình đào tạo hiện tại";
    elements.dataMeta.textContent = `Dữ liệu lúc ${formatDate(state.payload.fetchedAt)} · Không lưu trên máy chủ`;
    elements.cumulativeGpa.textContent = formatNumber(cumulative);
    elements.plannerCurrentGpa.textContent = formatNumber(cumulative);
    elements.academicGpa.textContent = formatNumber(academic);
    elements.accumulatedCredits.textContent = formatNumber(credits, 0);
    elements.failedCourseCount.textContent = String(failedCount);
    elements.gradeDetailCount.textContent = `${model.completed.length} kết quả học phần`;

    const modeMessages = [];
    if (model.limitedMode) {
      modeMessages.push("Bạn đang dùng Excel 6 cột cũ. Công cụ chỉ tính GPA và học cải thiện; không thể kiểm tra môn bắt buộc hoặc nhóm tự chọn.");
    }
    if (model.unsupportedRegulation) {
      modeMessages.push(`Khóa D${model.cohort ?? "16 trở về trước"} chưa được hỗ trợ đầy đủ. Kịch bản chỉ dùng để tham khảo và chưa áp dụng quy tắc riêng của khóa này.`);
    } else if (model.regulationSupportUnknown) {
      modeMessages.push("Hai trang dữ liệu không cho biết khóa tuyển sinh. Phiên bản này áp dụng quy tắc D17 trở đi; sinh viên D16 trở về trước chỉ nên dùng kết quả để tham khảo.");
    }
    elements.modeNotice.hidden = modeMessages.length === 0;
    elements.modeNotice.textContent = modeMessages.join(" ");
    const mismatch = model.summaryMismatch.academic || model.summaryMismatch.cumulative;
    elements.metricWarning.hidden = !mismatch;
    if (mismatch) {
      elements.metricWarning.textContent = "Điểm tính lại lệch hơn 0,01 so với chỉ số ULSA. Thẻ tổng quan giữ số chính thức; kịch bản dùng dữ liệu từng học phần và cần được xem như mô phỏng.";
    }

    const defaultTarget = Math.min(4, Math.max(Number(cumulative) || 0, 2) + 0.1);
    elements.targetGpa.value = defaultTarget.toFixed(2);
    elements.coursePlanningPanel.hidden = model.limitedMode || model.pending.length === 0;
    elements.coursePlanningPanel.open = true;
    elements.scenarioSection.hidden = true;
    elements.scenarioSection.className = "scenario-section";
    elements.automaticPlanState.className = "planner-mode-state";
    elements.automaticPlanState.textContent = "Sẵn sàng tạo phương án theo mục tiêu hiện tại.";
    elements.customPlanResult.hidden = true;
    elements.customPlanResult.replaceChildren();
    elements.customPlanResult.className = "custom-plan-result";
    elements.customPlanError.hidden = true;
    elements.customPlanState.className = "custom-plan-state";
    elements.customPlanState.textContent = "Điểm để trống sẽ do hệ thống tính.";
    renderRequirements();
    renderPendingCourses();
    renderPlannerSelectionSummary();
    renderCustomPlanner();
    renderCompletedCourses();
    setActivePlannerTab("automatic");
    root.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderRequirements() {
    const analysis = domain.analyzeRequirements(state.model, state.selections);
    elements.requirementSummary.replaceChildren();
    elements.groupList.replaceChildren();

    if (analysis.limitedMode) {
      elements.programStatus.textContent = "Thiếu dữ liệu CTĐT";
      elements.programStatus.classList.remove("is-success");
      elements.programStatus.removeAttribute("title");
      const notice = element("div", "requirement-line");
      const copy = element("div");
      copy.append(element("strong", "", "Không thể kiểm tra điều kiện học phần"));
      copy.append(element("small", "", "Hãy dùng nút Phân tích GPA của extension hoặc workbook v2."));
      notice.append(copy);
      elements.requirementSummary.append(notice);
      return;
    }

    const missingRequiredFromPlan = analysis.missingRequiredWithPlan.length;
    const missingElectivesFromPlan = analysis.groups.reduce(
      (total, group) => total + group.remainingWithPlan,
      0,
    );
    const planComplete = analysis.academicallyCompleteWithPlan;
    let statusText;
    let explanationText;
    if (analysis.academicallyCompleteNow) {
      statusText = "Đã tích lũy đủ môn";
      explanationText = "Theo dữ liệu hiện tại, bạn đã tích lũy đủ môn bắt buộc và số môn tối thiểu của từng nhóm tự chọn.";
    } else if (planComplete) {
      statusText = "Đã chọn đủ môn cần học";
      explanationText = "Các môn đang chọn đã phủ đủ yêu cầu học phần. Bạn vẫn cần học đạt chúng; đây chưa phải kết luận đủ điều kiện tốt nghiệp.";
    } else {
      const missingTotal = missingRequiredFromPlan + missingElectivesFromPlan;
      statusText = missingElectivesFromPlan > 0 && missingRequiredFromPlan === 0
        ? `Cần chọn ${missingElectivesFromPlan} môn tự chọn`
        : `Cần chọn thêm ${missingTotal} môn`;
      const reasons = [];
      if (missingRequiredFromPlan > 0) reasons.push(`${missingRequiredFromPlan} môn bắt buộc chưa có trong danh sách lập kế hoạch`);
      if (missingElectivesFromPlan > 0) reasons.push(`${missingElectivesFromPlan} môn tự chọn để đủ mức tối thiểu của các nhóm`);
      explanationText = `Kế hoạch hiện chưa đủ CTĐT: cần bổ sung ${reasons.join(" và ")}.`;
    }
    elements.programStatus.textContent = statusText;
    elements.programStatus.classList.toggle("is-success", planComplete);
    elements.programStatus.title = explanationText;

    elements.requirementSummary.append(element("p", "plan-explanation", explanationText));

    const requirementLine = element("div", "requirement-line");
    const requirementCopy = element("div");
    requirementCopy.append(element("strong", "", "Môn bắt buộc chưa tích lũy"));
    requirementCopy.append(element(
      "small",
      "",
      analysis.missingRequired.length
        ? "Được chọn sẵn trong kế hoạch và không thể bỏ."
        : "Bạn đã tích lũy toàn bộ môn bắt buộc trong dữ liệu hiện tại.",
    ));
    requirementLine.append(requirementCopy, element("span", "requirement-count", String(analysis.missingRequired.length)));
    elements.requirementSummary.append(requirementLine);

    analysis.groups.forEach((group) => {
      const card = element("article", "group-card");
      const header = element("div", "group-card-header");
      header.append(
        element("strong", "", `Nhóm tự chọn ${group.id}`),
        element("span", "course-tag", `${group.completedCount}/${group.requiredCount}`),
      );
      const status = group.overBy > 0
        ? `Đã học dư ${group.overBy} môn; phần dư không bù nhóm khác.`
        : group.remainingWithPlan > 0
          ? `Cần chọn thêm ${group.remainingWithPlan} môn trong kế hoạch.`
          : group.plannedCount > 0
            ? `Kế hoạch đã chọn thêm ${group.plannedCount} môn.`
            : "Đã đáp ứng số môn tối thiểu.";
      const progress = element("div", "group-progress");
      const bar = element("span");
      const projected = Math.min(group.requiredCount, group.completedCount + group.plannedCount);
      bar.style.width = `${group.requiredCount ? (projected / group.requiredCount) * 100 : 100}%`;
      progress.append(bar);
      card.append(header, element("small", "", status), progress);
      elements.groupList.append(card);
    });
  }

  function classificationFor(course) {
    if (course.status === "failed") return { text: "F/F+ · cần học lại", className: "course-tag is-failed" };
    if (course.required) return { text: "Bắt buộc", className: "course-tag is-required" };
    if (course.electiveGroupId) return { text: `Tự chọn · nhóm ${course.electiveGroupId}`, className: "course-tag" };
    return { text: "Tự chọn", className: "course-tag" };
  }

  function courseMatchesFilter(course) {
    if (state.filter === "all") return true;
    if (state.filter === "required") return course.required;
    if (state.filter === "elective") return !course.required;
    if (state.filter === "failed") return course.status === "failed";
    return true;
  }

  function createSwitch(checked, disabled, labelText, field, key) {
    const label = element("label", "switch");
    label.title = labelText;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.disabled = disabled;
    input.dataset.field = field;
    input.dataset.key = key;
    input.setAttribute("aria-label", labelText);
    label.append(input, element("span"));
    return label;
  }

  function renderPlannerSelectionSummary() {
    if (!state.model) return;
    if (state.model.limitedMode) {
      elements.plannerSelectionSummary.textContent = "Chỉ dùng môn học cải thiện";
      elements.courseSelectionSummary.textContent = "Không có dữ liệu môn mới";
      return;
    }
    const merged = domain.mergeSelections(state.model, state.selections);
    const selected = state.model.pending.filter((course) => merged[course.key]?.selected);
    const gpaCredits = selected
      .filter((course) => merged[course.key]?.countsGpa)
      .reduce((sum, course) => sum + Number(course.credits || 0), 0);
    const summary = selected.length
      ? `${selected.length} môn · ${formatNumber(gpaCredits, 0)} TC tính GPA`
      : "Chưa chọn môn mới";
    elements.plannerSelectionSummary.textContent = summary;
    elements.courseSelectionSummary.textContent = summary;
  }

  function setActivePlannerTab(tabId, options = {}) {
    const activeTab = tabId === "custom" ? "custom" : "automatic";
    state.activePlannerTab = activeTab;
    elements.plannerTabs.querySelectorAll("[data-planner-tab]").forEach((button) => {
      const active = button.dataset.plannerTab === activeTab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && options.focus) button.focus();
    });
    elements.automaticPlanPanel.hidden = activeTab !== "automatic";
    elements.customPlanPanel.hidden = activeTab !== "custom";
  }

  function collapseCoursePlanning() {
    if (!elements.coursePlanningPanel.hidden) elements.coursePlanningPanel.open = false;
  }

  function renderPendingCourses() {
    elements.pendingCourseRows.replaceChildren();
    if (!state.model || state.model.limitedMode) return;
    const merged = domain.mergeSelections(state.model, state.selections);
    state.model.pending.filter(courseMatchesFilter).forEach((course) => {
      const selection = merged[course.key];
      const row = document.createElement("tr");
      row.append(element("td"));
      row.cells[0].append(createSwitch(
        selection.selected,
        selection.locked,
        selection.locked ? `${course.name} là môn bắt buộc` : `Chọn học ${course.name}`,
        "selected",
        course.key,
      ));

      const nameCell = element("td", "course-name");
      nameCell.append(
        element("strong", "", course.name),
        element("small", "", [course.courseCode, course.knowledgeBlock].filter(Boolean).join(" · ")),
      );
      row.append(nameCell);
      const classification = classificationFor(course);
      const classificationCell = element("td");
      classificationCell.append(element("span", classification.className, classification.text));
      row.append(classificationCell, element("td", "", String(course.credits)));
      const gpaCell = element("td");
      gpaCell.append(createSwitch(
        selection.countsGpa,
        !selection.selected,
        `${course.name} có tính vào TBC`,
        "countsGpa",
        course.key,
      ));
      row.append(gpaCell);
      elements.pendingCourseRows.append(row);
    });
  }

  function customCourseType(course, improvement = false) {
    if (improvement) return { text: "Học cải thiện", className: "course-tag is-improvement" };
    if (course.status === "failed") return { text: "Học lại F/F+", className: "course-tag is-failed" };
    return { text: "Môn mới", className: "course-tag" };
  }

  function setScoreFeedback(input) {
    const feedback = input.closest(".score-editor")?.querySelector(".score-conversion");
    if (!feedback) return true;
    input.setCustomValidity("");
    input.removeAttribute("aria-invalid");
    if (!input.value) {
      feedback.className = "score-conversion";
      feedback.textContent = "Để hệ thống tính";
      return true;
    }
    try {
      const grade = domain.score10ToGrade(input.value);
      if (input.dataset.scoreType === "improvement" &&
        grade.points <= Number(input.dataset.currentPoints)) {
        throw new domain.DomainError(
          "IMPROVEMENT_NOT_HIGHER",
          `${formatScore10(input.value)} vẫn là ${grade.letter}; GPA sẽ không tăng.`,
        );
      }
      feedback.className = "score-conversion is-valid";
      feedback.textContent = `${formatScore10(grade.score10)} → ${grade.letter} → ${formatNumber(grade.points, 1)}`;
      return true;
    } catch (error) {
      const message = error?.message || "Điểm dự kiến không hợp lệ.";
      input.setCustomValidity(message);
      input.setAttribute("aria-invalid", "true");
      feedback.className = "score-conversion is-error";
      feedback.textContent = message;
      return false;
    }
  }

  function createScoreEditor(course, type, value, disabled = false) {
    const editor = element("label", "score-editor");
    editor.append(element("span", "score-label", "Điểm dự kiến /10"));
    const input = document.createElement("input");
    input.type = "number";
    input.min = "4";
    input.max = "10";
    input.step = "0.1";
    input.inputMode = "decimal";
    input.placeholder = "Để trống";
    input.disabled = disabled;
    input.dataset.customScore = "true";
    input.dataset.scoreType = type;
    input.dataset.key = course.key;
    if (type === "improvement") input.dataset.currentPoints = String(course.grade4);
    input.setAttribute("aria-label", `Điểm dự kiến hệ 10 cho ${course.name}`);
    if (value !== null && value !== undefined && String(value) !== "") input.value = String(value);
    const feedback = element("small", "score-conversion", "Để hệ thống tính");
    editor.append(input, feedback);
    setScoreFeedback(input);
    return editor;
  }

  function createCustomCourseRow(course, options = {}) {
    const { improvement = false, selected = true, countsGpa = true } = options;
    const row = element(
      "article",
      `custom-course-item${improvement ? " is-improvement" : ""}${selected ? "" : " is-disabled"}`,
    );
    if (improvement) {
      const checkLabel = element("label", "custom-course-check");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selected;
      checkbox.dataset.improvementToggle = "true";
      checkbox.dataset.key = course.key;
      checkbox.setAttribute("aria-label", `Chọn học cải thiện ${course.name}`);
      checkLabel.append(checkbox, element("span", "check-mark", "✓"));
      row.append(checkLabel);
    }

    const copy = element("div", "custom-course-copy");
    const heading = element("div", "custom-course-name");
    heading.append(element("strong", "", course.name));
    const type = customCourseType(course, improvement);
    heading.append(element("span", type.className, type.text));
    const currentGrade = improvement
      ? `Hiện tại: ${course.letterGrade || formatNumber(course.grade4, 1)} (${formatNumber(course.grade4, 1)})`
      : [course.courseCode, `${course.credits} TC`].filter(Boolean).join(" · ");
    copy.append(heading, element("small", "", currentGrade));
    row.append(copy);

    if (!countsGpa) {
      row.append(element("span", "pass-only", "Cần đạt"));
      return row;
    }
    const value = improvement
      ? state.customPlan.improvements[course.key]?.score10
      : state.customPlan.futureScores[course.key];
    row.append(createScoreEditor(course, improvement ? "improvement" : "future", value, !selected));
    return row;
  }

  function renderCustomPlanner() {
    if (!state.model) return;
    const wasOpen = elements.improvementPicker.open;
    const merged = domain.mergeSelections(state.model, state.selections);
    const futureCourses = state.model.pending.filter((course) => merged[course.key]?.selected);
    const candidates = domain.getImprovementCandidates(state.model);
    const selectedImprovementCount = candidates.filter(
      (course) => state.customPlan.improvements[course.key]?.selected,
    ).length;

    elements.customFutureCount.textContent = `${futureCourses.length} môn`;
    elements.customImprovementCount.textContent = `${selectedImprovementCount} đã chọn`;
    elements.customFutureCourses.replaceChildren();
    elements.customImprovementCourses.replaceChildren();

    if (!futureCourses.length) {
      const empty = element("div", "custom-empty");
      empty.append(
        element("strong", "", "Chưa chọn môn sẽ học"),
        element("small", "", state.model.limitedMode
          ? "Excel cũ không có danh sách môn chưa tích lũy; bạn vẫn có thể chọn môn học cải thiện bên dưới."
          : "Chọn môn tự chọn ở bảng phía trên hoặc dùng các môn bắt buộc đã được chọn sẵn."),
      );
      elements.customFutureCourses.append(empty);
    } else {
      futureCourses.forEach((course) => {
        elements.customFutureCourses.append(createCustomCourseRow(course, {
          countsGpa: merged[course.key]?.countsGpa,
        }));
      });
    }

    if (!candidates.length) {
      const empty = element("div", "custom-empty");
      empty.append(
        element("strong", "", "Không có môn phù hợp để cải thiện"),
        element("small", "", "Danh sách chỉ nhận môn đã đạt, có tính TBC và chưa đạt A+."),
      );
      elements.customImprovementCourses.append(empty);
    } else {
      candidates.forEach((course) => {
        const selected = Boolean(state.customPlan.improvements[course.key]?.selected);
        elements.customImprovementCourses.append(createCustomCourseRow(course, {
          improvement: true,
          selected,
        }));
      });
    }
    elements.improvementPicker.open = wasOpen;
  }

  function markCustomPlanStale() {
    state.customResultDirty = true;
    elements.customPlanError.hidden = true;
    if (!elements.customPlanResult.hidden) {
      elements.customPlanResult.classList.add("is-stale");
      elements.customPlanState.className = "custom-plan-state is-warning";
      elements.customPlanState.textContent = "Kế hoạch đã thay đổi — hãy tính lại để cập nhật kết quả.";
    }
  }

  function createCustomAssignmentList(title, assignments, fixed) {
    const section = element("section", "custom-result-group");
    section.append(element("h4", "", title));
    const list = element("ul", "custom-result-list");
    assignments.forEach((assignment) => {
      const item = element("li");
      const copy = element("div");
      copy.append(
        element("strong", "", assignment.name),
        element("small", "", `${assignmentLabel(assignment)} · ${assignment.credits} TC`),
      );
      const score = fixed
        ? `${formatScore10(assignment.score10)} → ${assignment.targetGrade} → ${formatNumber(assignment.targetPoints, 1)}`
        : `Từ ${formatScore10(assignment.minimumScore10)} → ${assignment.targetGrade}`;
      item.append(copy, element("span", "custom-score-result", score));
      list.append(item);
    });
    section.append(list);
    return section;
  }

  function renderCustomResult(result) {
    elements.customPlanResult.replaceChildren();
    elements.customPlanResult.hidden = false;
    elements.customPlanResult.className = "custom-plan-result";
    elements.customPlanError.hidden = true;
    state.customResultDirty = false;
    collapseCoursePlanning();

    if (!result.feasible) {
      const banner = element("div", "custom-result-banner is-error");
      const copy = element("div");
      copy.append(
        element("span", "", "CHƯA THỂ ĐẠT MỤC TIÊU"),
        element("h3", "", `GPA tối đa: ${formatNumber(result.maximumGpa)}`),
        element("p", "", result.reason || "Kế hoạch hiện tại chưa đủ để đạt GPA mục tiêu."),
      );
      banner.append(copy);
      elements.customPlanResult.append(banner);
      if (result.fixedAssignments?.length) {
        elements.customPlanResult.append(createCustomAssignmentList(
          "Điểm đang khóa",
          result.fixedAssignments,
          true,
        ));
      }
      elements.customPlanState.className = "custom-plan-state is-error";
      elements.customPlanState.textContent = "Hãy điều chỉnh điểm khóa hoặc chọn thêm môn rồi tính lại.";
      return;
    }

    const summary = element("div", "custom-result-summary");
    [
      ["GPA dự kiến", formatNumber(result.projectedGpa)],
      ["Tín chỉ sau kế hoạch", formatNumber(result.projectedCredits, 0)],
      ["TB phần hệ thống tính", result.remainingAverage4 === null
        ? "Không có ô trống"
        : `${formatNumber(result.remainingAverage4)} hệ 4`],
    ].forEach(([label, value]) => {
      const card = element("div");
      card.append(element("span", "", label), element("strong", "", value));
      summary.append(card);
    });
    elements.customPlanResult.append(summary);

    if (result.fixedAssignments.length) {
      elements.customPlanResult.append(createCustomAssignmentList(
        "Điểm bạn đã khóa",
        result.fixedAssignments,
        true,
      ));
    }
    if (result.suggestedAssignments.length) {
      elements.customPlanResult.append(createCustomAssignmentList(
        "Mức tối thiểu hệ thống tính",
        result.suggestedAssignments,
        false,
      ));
    }
    if (result.nonGpaCourses.length) {
      const nonGpa = element("section", "custom-result-group");
      nonGpa.append(element("h4", "", "Môn không tính TBC"));
      const list = element("ul", "custom-result-list");
      result.nonGpaCourses.forEach((course) => {
        const item = element("li");
        const copy = element("div");
        copy.append(
          element("strong", "", course.name),
          element("small", "", `${course.credits} TC · không làm thay đổi GPA`),
        );
        item.append(copy, element("span", "pass-only", "Cần đạt"));
        list.append(item);
      });
      nonGpa.append(list);
      elements.customPlanResult.append(nonGpa);
    }
    if (!result.assignments.length && !result.nonGpaCourses.length) {
      elements.customPlanResult.append(element(
        "div",
        "custom-result-banner is-success",
        "Bạn đã đạt GPA mục tiêu với dữ liệu hiện tại.",
      ));
    }
    elements.customPlanState.className = "custom-plan-state is-success";
    elements.customPlanState.textContent = `Đã tính độc lập theo GPA mục tiêu ${formatNumber(result.target)}.`;
    elements.customPlanResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderCompletedCourses() {
    elements.completedCourseRows.replaceChildren();
    state.model.completed.forEach((course) => {
      const row = document.createElement("tr");
      const status = course.excludedFromGpa
        ? "Không tính TBC"
        : domain.isFailedCourse(course)
          ? "Chưa tích lũy"
          : "Đã đạt";
      [
        course.courseCode || "—",
        course.name,
        String(course.credits),
        formatNumber(course.grade4, 1),
        course.letterGrade || "—",
        status,
      ].forEach((value) => row.append(element("td", "", value)));
      elements.completedCourseRows.append(row);
    });
  }

  function assignmentLabel(assignment) {
    if (assignment.type === "improvement") return `Học cải thiện từ ${assignment.fromGrade || formatNumber(assignment.fromPoints, 1)}`;
    if (assignment.type === "retake-failed") return "Học lại môn F/F+";
    return "Học phần mới";
  }

  function renderScenarios(scenarios) {
    elements.scenarioGrid.replaceChildren();
    scenarios.forEach((scenario) => {
      const card = element("article", `scenario-card${scenario.id === "balanced" ? " is-featured" : ""}`);
      const head = element("div", "scenario-head");
      head.append(
        element("h3", "", scenario.title),
        element("span", "scenario-badge", scenario.id === "balanced" ? "Khuyến nghị" : scenario.id === "reserve" ? "Có biên an toàn" : "Nhanh nhất"),
      );
      card.append(head, element("p", "", scenario.description));
      const result = scenario.result;
      if (!result.feasible) {
        const maximum = Number.isFinite(result.maximumGpa) ? formatNumber(result.maximumGpa) : "không xác định";
        card.append(element(
          "div",
          "scenario-empty",
          `Không thể đạt mục tiêu với giới hạn của kịch bản này. GPA tối đa ước tính: ${maximum}.`,
        ));
        elements.scenarioGrid.append(card);
        return;
      }

      const projected = element("div", "projected-gpa");
      const value = element("div");
      value.append(element("span", "", "GPA dự kiến"), element("strong", "", formatNumber(result.projectedGpa)));
      const detail = result.stressedGpa !== null
        ? `Khi giảm một bậc: ${formatNumber(result.stressedGpa)}`
        : `${result.projectedCredits} tín chỉ sau kế hoạch`;
      projected.append(value, element("small", "", detail));
      card.append(projected);

      const list = element("ul", "assignment-list");
      result.nonGpaCourses.forEach((course) => {
        const item = element("li", "assignment-item");
        const copy = element("div");
        copy.append(element("strong", "", course.name), element("small", "", "Không tính TBC · cần đạt"));
        item.append(copy, element("span", "target-grade", "Đạt"));
        list.append(item);
      });
      result.assignments.forEach((assignment) => {
        const item = element("li", "assignment-item");
        const copy = element("div");
        copy.append(
          element("strong", "", assignment.name),
          element("small", "", `${assignmentLabel(assignment)} · ${assignment.credits} TC`),
        );
        item.append(copy, element("span", "target-grade", assignment.targetGrade));
        list.append(item);
      });
      if (!list.children.length) {
        list.append(element("li", "assignment-item", "Mục tiêu đã đạt với dữ liệu hiện tại."));
      }
      card.append(list);
      elements.scenarioGrid.append(card);
    });
    state.automaticResultDirty = false;
    elements.scenarioSection.hidden = false;
    elements.scenarioSection.className = "scenario-section";
    elements.automaticPlanState.className = "planner-mode-state is-success";
    elements.automaticPlanState.textContent = `Đã tính theo GPA mục tiêu ${formatNumber(elements.targetGpa.value)}.`;
    collapseCoursePlanning();
    elements.scenarioSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function markScenariosStale() {
    state.automaticResultDirty = true;
    if (!elements.scenarioSection.hidden) {
      elements.scenarioSection.classList.add("is-stale");
      elements.automaticPlanState.className = "planner-mode-state is-warning";
      elements.automaticPlanState.textContent = "Mục tiêu hoặc danh sách môn đã đổi — hãy tạo lại 3 kịch bản.";
    }
  }

  async function importFile(file) {
    setImportStatus("Đang kiểm tra workbook và chuẩn hóa dữ liệu…");
    try {
      const payload = await importer.readWorkbookFile(file);
      loadPayload(payload);
    } catch (error) {
      setImportStatus(error?.message || "Không thể đọc file Excel.", true);
    }
  }

  function resetData() {
    state.payload = null;
    state.model = null;
    state.selections = {};
    state.customPlan = { futureScores: {}, improvements: {} };
    state.customResultDirty = false;
    state.activePlannerTab = "automatic";
    state.automaticResultDirty = false;
    elements.fileUpload.value = "";
    elements.dashboard.hidden = true;
    elements.landingPanel.hidden = false;
    elements.importStatus.hidden = true;
    clearHandoffHash();
    root.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bindEvents() {
    elements.fileUpload.addEventListener("change", (event) => importFile(event.target.files?.[0]));
    elements.dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("is-dragging");
    });
    elements.dropZone.addEventListener("dragleave", () => elements.dropZone.classList.remove("is-dragging"));
    elements.dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("is-dragging");
      importFile(event.dataTransfer?.files?.[0]);
    });
    elements.replaceDataButton.addEventListener("click", resetData);

    elements.pendingCourseRows.addEventListener("change", (event) => {
      const input = event.target.closest("input[data-field][data-key]");
      if (!input) return;
      const current = state.selections[input.dataset.key] || {};
      current[input.dataset.field] = input.checked;
      state.selections[input.dataset.key] = current;
      renderPendingCourses();
      renderRequirements();
      renderPlannerSelectionSummary();
      renderCustomPlanner();
      markScenariosStale();
      markCustomPlanStale();
    });

    document.querySelectorAll(".filter-button").forEach((button) => {
      button.addEventListener("click", () => {
        state.filter = button.dataset.filter;
        document.querySelectorAll(".filter-button").forEach((candidate) =>
          candidate.classList.toggle("is-active", candidate === button),
        );
        renderPendingCourses();
      });
    });

    elements.plannerTabs.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-planner-tab]");
      if (!tab) return;
      setActivePlannerTab(tab.dataset.plannerTab);
    });
    elements.plannerTabs.addEventListener("keydown", (event) => {
      const tabs = Array.from(elements.plannerTabs.querySelectorAll("[data-planner-tab]"));
      const currentIndex = tabs.indexOf(event.target.closest("[data-planner-tab]"));
      if (currentIndex < 0) return;
      let nextIndex = currentIndex;
      if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
      else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabs.length - 1;
      else return;
      event.preventDefault();
      setActivePlannerTab(tabs[nextIndex].dataset.plannerTab, { focus: true });
    });

    elements.plannerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (state.activePlannerTab === "custom") {
        elements.customPlannerForm.requestSubmit();
        return;
      }
      try {
        const scenarios = domain.generateScenarios(state.model, state.selections, elements.targetGpa.value);
        renderScenarios(scenarios);
      } catch (error) {
        elements.targetGpa.setCustomValidity(error?.message || "GPA mục tiêu không hợp lệ.");
        elements.targetGpa.reportValidity();
      }
    });
    elements.targetGpa.addEventListener("input", () => {
      elements.targetGpa.setCustomValidity("");
      markScenariosStale();
      markCustomPlanStale();
    });
    elements.targetGpa.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (state.activePlannerTab === "custom") elements.customPlannerForm.requestSubmit();
      else elements.plannerForm.requestSubmit();
    });

    elements.customPlannerForm.addEventListener("input", (event) => {
      const input = event.target.closest("input[data-custom-score][data-key]");
      if (!input) return;
      const value = input.value === "" ? null : Number(input.value);
      if (input.dataset.scoreType === "future") {
        state.customPlan.futureScores[input.dataset.key] = value;
      } else {
        const current = state.customPlan.improvements[input.dataset.key] || { selected: true, score10: null };
        current.score10 = value;
        state.customPlan.improvements[input.dataset.key] = current;
      }
      setScoreFeedback(input);
      markCustomPlanStale();
    });

    elements.customPlannerForm.addEventListener("change", (event) => {
      const input = event.target.closest("input[data-improvement-toggle][data-key]");
      if (!input) return;
      const current = state.customPlan.improvements[input.dataset.key] || { score10: null };
      current.selected = input.checked;
      state.customPlan.improvements[input.dataset.key] = current;
      renderCustomPlanner();
      markCustomPlanStale();
    });

    elements.customPlannerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const invalidInput = Array.from(
        elements.customPlannerForm.querySelectorAll("input[data-custom-score]:not(:disabled)"),
      ).find((input) => !setScoreFeedback(input));
      if (invalidInput) {
        invalidInput.reportValidity();
        return;
      }
      try {
        const result = domain.generateCustomPlan(
          state.model,
          state.selections,
          elements.targetGpa.value,
          state.customPlan,
        );
        renderCustomResult(result);
      } catch (error) {
        elements.customPlanError.hidden = false;
        elements.customPlanError.textContent = error?.message || "Không thể tính kế hoạch tùy chỉnh.";
      }
    });

    root.addEventListener("message", (event) => {
      if (event.source !== root || event.origin !== root.location.origin || event.data?.source !== "ULSA_GPA_EXTENSION") return;
      if (event.data.type === "ULSA_GPA_DATA") {
        try {
          loadPayload(event.data.payload);
          root.postMessage({ source: "ULSA_GPA_WEB", type: "ULSA_GPA_IMPORT_ACK" }, root.location.origin);
        } catch (error) {
          setImportStatus(error?.message || "Dữ liệu extension không hợp lệ.", true);
        }
      }
      if (event.data.type === "ULSA_GPA_IMPORT_ERROR") {
        setImportStatus(event.data.message || "Không thể nhận dữ liệu từ extension.", true);
      }
    });
  }

  function captureElements() {
    [
      "landingPanel", "dashboard", "dropZone", "fileUpload", "importStatus", "programName", "dataMeta",
      "replaceDataButton", "modeNotice", "metricWarning", "cumulativeGpa", "academicGpa",
      "accumulatedCredits", "failedCourseCount", "programStatus", "requirementSummary", "groupList",
      "plannerWorkspace", "plannerCurrentGpa", "plannerForm", "targetGpa", "plannerSelectionSummary",
      "plannerTabs", "automaticTab", "customTab", "coursePlanningPanel", "courseSelectionSummary",
      "pendingCourseRows", "automaticPlanPanel", "automaticPlanState", "scenarioSection", "scenarioGrid",
      "customPlanPanel", "customPlannerForm", "customFutureCount",
      "customFutureCourses", "improvementPicker", "customImprovementCount", "customImprovementCourses",
      "customPlanError", "customPlanState", "customPlanResult", "gradeDetailCount", "completedCourseRows",
    ].forEach((id) => { elements[id] = document.getElementById(id); });
  }

  function initialize() {
    captureElements();
    bindEvents();
    if (root.location.hash.startsWith("#handoff=")) {
      setImportStatus("Đang nhận dữ liệu dùng một lần từ extension…");
    }
    root.postMessage({ source: "ULSA_GPA_WEB", type: "ULSA_GPA_WEB_READY" }, root.location.origin);
  }

  root.ULSA_GPA_APP = { loadPayload };
  document.addEventListener("DOMContentLoaded", initialize);
})(globalThis);
