(function initializeApp(root) {
  "use strict";

  const domain = root.UlsaGpaDomain;
  const importer = root.UlsaGpaImport;
  const state = {
    payload: null,
    model: null,
    selections: {},
    filter: "all",
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
    renderRequirements();
    renderPendingCourses();
    renderCompletedCourses();
    elements.scenarioSection.hidden = true;
    root.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderRequirements() {
    const analysis = domain.analyzeRequirements(state.model, state.selections);
    elements.requirementSummary.replaceChildren();
    elements.groupList.replaceChildren();

    if (analysis.limitedMode) {
      elements.programStatus.textContent = "Thiếu dữ liệu CTĐT";
      elements.programStatus.classList.remove("is-success");
      const notice = element("div", "requirement-line");
      const copy = element("div");
      copy.append(element("strong", "", "Không thể kiểm tra điều kiện học phần"));
      copy.append(element("small", "", "Hãy dùng nút Phân tích GPA của extension hoặc workbook v2."));
      notice.append(copy);
      elements.requirementSummary.append(notice);
      return;
    }

    const complete = analysis.academicallyCompleteWithPlan;
    elements.programStatus.textContent = complete ? "Kế hoạch đã phủ đủ" : "Kế hoạch còn thiếu";
    elements.programStatus.classList.toggle("is-success", complete);

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
    elements.scenarioSection.hidden = false;
    elements.scenarioSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function markScenariosStale() {
    elements.scenarioSection.hidden = true;
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
      markScenariosStale();
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

    elements.plannerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        const scenarios = domain.generateScenarios(state.model, state.selections, elements.targetGpa.value);
        renderScenarios(scenarios);
      } catch (error) {
        elements.targetGpa.setCustomValidity(error?.message || "GPA mục tiêu không hợp lệ.");
        elements.targetGpa.reportValidity();
      }
    });
    elements.targetGpa.addEventListener("input", () => elements.targetGpa.setCustomValidity(""));

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
      "plannerForm", "targetGpa", "coursePlanningPanel", "pendingCourseRows", "scenarioSection",
      "scenarioGrid", "gradeDetailCount", "completedCourseRows",
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
