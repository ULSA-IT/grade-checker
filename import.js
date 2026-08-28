(function exposeUlsaGpaImport(root, factory) {
  const api = factory(root.UlsaGpaDomain);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./domain.js"));
  } else {
    root.UlsaGpaImport = api;
  }
})(globalThis, function createUlsaGpaImport(domain) {
  "use strict";

  const FULL_SHEETS = ["Điểm chi tiết", "Chưa tích lũy", "Chương trình", "Nhóm tự chọn", "Tổng quan"];

  function parseNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const normalized = String(value ?? "").replace(/\s/g, "").replace(",", ".");
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    return match ? Number.parseFloat(match[0]) : null;
  }

  function isMarked(value) {
    return ["x", "true", "1", "có", "co"].includes(domain.normalizeSearch(value));
  }

  function sheetRows(workbook, name, xlsx) {
    const worksheet = workbook.Sheets[name];
    if (!worksheet) return [];
    return xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: true });
  }

  function rowsToObjects(rows) {
    if (!rows.length) return [];
    const headers = rows[0].map((header) => domain.normalizeSearch(header));
    return rows.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim())).map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index]])),
    );
  }

  function valueOf(row, ...aliases) {
    for (const alias of aliases) {
      const value = row[domain.normalizeSearch(alias)];
      if (value !== undefined && value !== "") return value;
    }
    return "";
  }

  function parseDetailedGrades(rows) {
    return rowsToObjects(rows).map((row) => ({
      semester: String(valueOf(row, "Học kỳ") || "").trim(),
      academicYear: String(valueOf(row, "Năm học") || "").trim(),
      courseCode: domain.normalizeCourseCode(valueOf(row, "Mã học phần")),
      name: String(valueOf(row, "Tên học phần") || "").trim(),
      credits: parseNumber(valueOf(row, "Số tín chỉ")),
      grade10: parseNumber(valueOf(row, "Điểm hệ 10")),
      grade4: parseNumber(valueOf(row, "Điểm hệ 4")),
      letterGrade: String(valueOf(row, "Điểm chữ") || "").trim().toUpperCase(),
      excludedFromGpa: isMarked(valueOf(row, "Không tính TBC")),
      note: String(valueOf(row, "Ghi chú") || "").trim(),
    })).filter((course) => course.name && Number.isFinite(course.credits));
  }

  function parsePending(rows) {
    return rowsToObjects(rows).map((row) => ({
      knowledgeBlock: String(valueOf(row, "Khối kiến thức") || "").trim(),
      courseCode: domain.normalizeCourseCode(valueOf(row, "Mã học phần")),
      name: String(valueOf(row, "Tên học phần") || "").trim(),
      term: parseNumber(valueOf(row, "Kỳ thứ")),
      credits: parseNumber(valueOf(row, "Số tín chỉ")),
      totalPeriods: parseNumber(valueOf(row, "Tổng số tiết")),
      prerequisite: String(valueOf(row, "Điều kiện tiên quyết") || "").trim(),
      required: isMarked(valueOf(row, "Bắt buộc")),
      elective: isMarked(valueOf(row, "Tự chọn")),
    })).filter((course) => course.name && Number.isFinite(course.credits));
  }

  function parseCurriculum(rows) {
    return rowsToObjects(rows).map((row) => ({
      courseCode: domain.normalizeCourseCode(valueOf(row, "Mã học phần")),
      name: String(valueOf(row, "Tên học phần") || "").trim(),
      knowledgeBlock: String(valueOf(row, "Khối kiến thức") || "").trim(),
      term: parseNumber(valueOf(row, "Kỳ thứ")),
      credits: parseNumber(valueOf(row, "Số tín chỉ")),
      totalPeriods: parseNumber(valueOf(row, "Số tiết")),
      prerequisite: String(valueOf(row, "Điều kiện tiên quyết") || "").trim(),
      required: isMarked(valueOf(row, "Bắt buộc")),
      elective: isMarked(valueOf(row, "Tự chọn")),
      electiveGroupId: String(valueOf(row, "Nhóm") || "").trim(),
      note: String(valueOf(row, "Ghi chú") || "").trim(),
    })).filter((course) => course.name && Number.isFinite(course.credits));
  }

  function parseGroups(rows) {
    return rowsToObjects(rows).map((row) => ({
      id: String(valueOf(row, "Nhóm tự chọn") || "").trim(),
      offeredCourseCount: parseNumber(valueOf(row, "Tổng số môn tự chọn")),
      requiredCourseCount: parseNumber(valueOf(row, "Tổng số môn cần đăng ký học")),
    })).filter((group) => group.id && Number.isFinite(group.requiredCourseCount));
  }

  function parseOverview(rows) {
    const entries = new Map(rows.slice(1).map((row) => [domain.normalizeSearch(row[0]), row[1]]));
    const get = (label) => entries.get(domain.normalizeSearch(label));
    const cohort = parseNumber(get("Khóa tuyển sinh"));
    const regulationValue = get("Hỗ trợ quy chế");
    return {
      schemaVersion: parseNumber(get("Schema version")),
      fetchedAt: String(get("Thời điểm lấy dữ liệu") || new Date().toISOString()),
      programName: String(get("Chương trình") || "Dữ liệu ULSA"),
      cohort,
      regulationSupported: regulationValue === undefined || regulationValue === ""
        ? (Number.isInteger(cohort) ? cohort >= 17 : null)
        : isMarked(regulationValue),
      summary: {
        academicGpa4: parseNumber(get("TBC học tập hệ 4")),
        cumulativeGpa4: parseNumber(get("TBC tích lũy hệ 4")),
        academicGpa10: parseNumber(get("TBC học tập hệ 10")),
        accumulatedCredits: parseNumber(get("Số tín chỉ tích lũy")),
      },
    };
  }

  function fullWorkbookToPayload(workbook, xlsx) {
    const overview = parseOverview(sheetRows(workbook, "Tổng quan", xlsx));
    const payload = {
      schemaVersion: overview.schemaVersion || 1,
      fetchedAt: overview.fetchedAt,
      source: {
        mode: "workbook",
        portalHost: "sinhvien.ulsa.edu.vn",
        programName: overview.programName,
        cohort: overview.cohort,
        regulationSupported: overview.regulationSupported,
      },
      summary: overview.summary,
      completedCourses: parseDetailedGrades(sheetRows(workbook, "Điểm chi tiết", xlsx)),
      pendingCourses: parsePending(sheetRows(workbook, "Chưa tích lũy", xlsx)),
      curriculumCourses: parseCurriculum(sheetRows(workbook, "Chương trình", xlsx)),
      electiveGroups: parseGroups(sheetRows(workbook, "Nhóm tự chọn", xlsx)),
    };
    domain.validatePayload(payload);
    if (!payload.completedCourses.length || !payload.curriculumCourses.length) {
      throw new domain.DomainError("SCHEMA_INVALID", "Workbook thiếu dữ liệu điểm hoặc chương trình đào tạo.");
    }
    return payload;
  }

  function legacyWorkbookToPayload(workbook, xlsx) {
    const firstSheet = workbook.SheetNames[0];
    const rows = sheetRows(workbook, firstSheet, xlsx);
    const headers = (rows[0] || []).map(domain.normalizeSearch);
    const expected = ["stt", "ten", "tin chi", "diem he 10", "diem he 4", "diem chu"];
    if (!expected.every((header) => headers.includes(header))) {
      throw new domain.DomainError("SCHEMA_INVALID", "File không có đúng 6 cột điểm ULSA.");
    }
    const objects = rowsToObjects(rows);
    const completedCourses = objects.map((row, index) => ({
      semester: "",
      academicYear: "",
      courseCode: `LEGACY-${index + 1}`,
      name: String(valueOf(row, "Tên") || "").trim(),
      credits: parseNumber(valueOf(row, "Tín chỉ")),
      grade10: parseNumber(valueOf(row, "Điểm hệ 10")),
      grade4: parseNumber(valueOf(row, "Điểm hệ 4")),
      letterGrade: String(valueOf(row, "Điểm chữ") || "").trim().toUpperCase(),
      excludedFromGpa: false,
      note: "",
    })).filter((course) => course.name && Number.isFinite(course.credits) && Number.isFinite(course.grade4));
    if (!completedCourses.length) {
      throw new domain.DomainError("SCHEMA_INVALID", "File không chứa môn học hợp lệ.");
    }
    const metrics = domain.weightedMetrics(completedCourses);
    return {
      schemaVersion: 1,
      fetchedAt: new Date().toISOString(),
      source: { mode: "legacy", programName: "Excel 6 cột — chế độ giới hạn" },
      summary: {
        academicGpa4: metrics.academic.gpa,
        cumulativeGpa4: metrics.cumulative.gpa,
        academicGpa10: null,
        accumulatedCredits: metrics.cumulative.credits,
      },
      completedCourses,
      pendingCourses: [],
      curriculumCourses: [],
      electiveGroups: [],
    };
  }

  function workbookToPayload(workbook, xlsx = globalThis.XLSX) {
    if (!workbook?.SheetNames?.length || !xlsx) {
      throw new domain.DomainError("SCHEMA_INVALID", "Không thể đọc workbook Excel.");
    }
    const isFull = FULL_SHEETS.every((name) => workbook.SheetNames.includes(name));
    return isFull ? fullWorkbookToPayload(workbook, xlsx) : legacyWorkbookToPayload(workbook, xlsx);
  }

  async function readWorkbookFile(file, xlsx = globalThis.XLSX) {
    if (!file) throw new domain.DomainError("SCHEMA_INVALID", "Chưa chọn file Excel.");
    if (!xlsx) throw new domain.DomainError("XLSX_UNAVAILABLE", "Không thể tải thư viện đọc Excel.");
    const bytes = await file.arrayBuffer();
    const workbook = xlsx.read(bytes, { type: "array" });
    return workbookToPayload(workbook, xlsx);
  }

  return {
    FULL_SHEETS,
    parseNumber,
    workbookToPayload,
    readWorkbookFile,
  };
});
