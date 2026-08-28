const assert = require("node:assert/strict");
const test = require("node:test");
const XLSX = require("../xlsx.full.min.js");
const importer = require("../import.js");

function append(workbook, name, rows) {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
}

test("đọc được workbook v2 nhiều sheet", () => {
  const workbook = XLSX.utils.book_new();
  append(workbook, "Danh sách điểm", [
    ["STT", "Tên", "Tín chỉ", "Điểm hệ 10", "Điểm hệ 4", "Điểm chữ"],
    [1, "Môn mẫu", 3, 8, 3.5, "B+"],
  ]);
  append(workbook, "Điểm chi tiết", [
    ["Học kỳ", "Năm học", "Mã học phần", "Tên học phần", "Số tín chỉ", "Điểm hệ 10", "Điểm hệ 4", "Điểm chữ", "Không tính TBC", "Ghi chú"],
    [1, "2025-2026", "HP1", "Môn mẫu", 3, 8, 3.5, "B+", "", ""],
  ]);
  append(workbook, "Chưa tích lũy", [
    ["Khối kiến thức", "Mã học phần", "Tên học phần", "Kỳ thứ", "Số tín chỉ", "Tổng số tiết", "Điều kiện tiên quyết", "Bắt buộc", "Tự chọn"],
    ["Kiến thức ngành", "HP2", "Môn mới", 4, 2, 30, "", "X", ""],
  ]);
  append(workbook, "Chương trình", [
    ["Mã học phần", "Tên học phần", "Khối kiến thức", "Kỳ thứ", "Số tín chỉ", "Số tiết", "Điều kiện tiên quyết", "Bắt buộc", "Tự chọn", "Nhóm", "Ghi chú"],
    ["HP1", "Môn mẫu", "Kiến thức ngành", 1, 3, 45, "", "X", "", "", ""],
    ["HP2", "Môn mới", "Kiến thức ngành", 4, 2, 30, "", "X", "", "", ""],
  ]);
  append(workbook, "Nhóm tự chọn", [
    ["Nhóm tự chọn", "Tổng số môn tự chọn", "Tổng số môn cần đăng ký học"],
  ]);
  append(workbook, "Tổng quan", [
    ["Thuộc tính", "Giá trị"],
    ["Schema version", 1],
    ["Thời điểm lấy dữ liệu", "2026-08-28T00:00:00.000Z"],
    ["Chương trình", "Chuyên ngành chính"],
    ["Khóa tuyển sinh", 16],
    ["Hỗ trợ quy chế", "Không"],
    ["TBC học tập hệ 4", 3.5],
    ["TBC tích lũy hệ 4", 3.5],
    ["TBC học tập hệ 10", 8],
    ["Số tín chỉ tích lũy", 3],
  ]);

  const payload = importer.workbookToPayload(workbook, XLSX);
  assert.equal(payload.source.mode, "workbook");
  assert.equal(payload.source.cohort, 16);
  assert.equal(payload.source.regulationSupported, false);
  assert.equal(payload.completedCourses[0].courseCode, "HP1");
  assert.equal(payload.pendingCourses[0].required, true);
  assert.equal(payload.curriculumCourses.length, 2);
  assert.equal(payload.summary.cumulativeGpa4, 3.5);
});

test("đọc Excel 6 cột ở chế độ giới hạn", () => {
  const workbook = XLSX.utils.book_new();
  append(workbook, "Danh sách điểm", [
    ["STT", "Tên", "Tín chỉ", "Điểm hệ 10", "Điểm hệ 4", "Điểm chữ"],
    [1, "Môn A", 3, 8.5, 3.7, "A"],
    [2, "Môn F", 2, 1, 0, "F"],
  ]);

  const payload = importer.workbookToPayload(workbook, XLSX);
  assert.equal(payload.source.mode, "legacy");
  assert.equal(payload.completedCourses.length, 2);
  assert.equal(payload.summary.accumulatedCredits, 3);
  assert.ok(Math.abs(payload.summary.cumulativeGpa4 - 3.7) < 1e-9);
  assert.ok(Math.abs(payload.summary.academicGpa4 - 2.22) < 1e-9);
});

test("từ chối workbook sai schema", () => {
  const workbook = XLSX.utils.book_new();
  append(workbook, "Sheet1", [["Tên khác"], ["Không hợp lệ"]]);
  assert.throws(() => importer.workbookToPayload(workbook, XLSX), /6 cột/);
});
