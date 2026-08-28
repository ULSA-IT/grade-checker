(function exposeQaPayload(root) {
const payload = {
  schemaVersion: 1,
  fetchedAt: "2026-08-28T00:00:00.000Z",
  source: { mode: "extension", programName: "Công nghệ thông tin · Dữ liệu kiểm thử" },
  summary: { academicGpa4: 2.56, cumulativeGpa4: 3.2, academicGpa10: 7.4, accumulatedCredits: 15 },
  completedCourses: [
    { courseCode: "CS101", name: "Cấu trúc dữ liệu", credits: 3, grade10: 8.2, grade4: 3.5, letterGrade: "B+", excludedFromGpa: false },
    { courseCode: "CS102", name: "Lập trình hướng đối tượng", credits: 3, grade10: 7.1, grade4: 3, letterGrade: "B", excludedFromGpa: false },
    { courseCode: "CS103", name: "Cơ sở dữ liệu", credits: 3, grade10: 5.8, grade4: 2, letterGrade: "C", excludedFromGpa: false },
    { courseCode: "EL1", name: "Thiết kế web", credits: 3, grade10: 9.3, grade4: 4, letterGrade: "A+", excludedFromGpa: false },
    { courseCode: "EL2", name: "Điện toán đám mây", credits: 3, grade10: 8.6, grade4: 3.7, letterGrade: "A", excludedFromGpa: false },
    { courseCode: "FAIL1", name: "Mạng máy tính", credits: 3, grade10: 3.2, grade4: 0.5, letterGrade: "F+", excludedFromGpa: false },
    { courseCode: "PE1", name: "Giáo dục thể chất", credits: 1, grade10: 8.5, grade4: 3.7, letterGrade: "A", excludedFromGpa: true },
  ],
  pendingCourses: [
    { courseCode: "FAIL1", name: "Mạng máy tính", credits: 3, knowledgeBlock: "Kiến thức ngành", required: true, elective: false },
    { courseCode: "REQ2", name: "An toàn thông tin", credits: 3, knowledgeBlock: "Kiến thức ngành", required: true, elective: false },
    { courseCode: "EL3", name: "Linux và phần mềm mã nguồn mở", credits: 3, knowledgeBlock: "Kiến thức ngành", required: false, elective: true },
    { courseCode: "EL4", name: "Phân tích thiết kế hệ thống", credits: 3, knowledgeBlock: "Kiến thức ngành", required: false, elective: true },
    { courseCode: "PE2", name: "Thể dục tự chọn", credits: 1, knowledgeBlock: "Giáo dục thể chất", required: false, elective: true },
  ],
  curriculumCourses: [
    { courseCode: "CS101", name: "Cấu trúc dữ liệu", credits: 3, knowledgeBlock: "Kiến thức ngành", required: true, elective: false, electiveGroupId: "" },
    { courseCode: "CS102", name: "Lập trình hướng đối tượng", credits: 3, knowledgeBlock: "Kiến thức ngành", required: true, elective: false, electiveGroupId: "" },
    { courseCode: "CS103", name: "Cơ sở dữ liệu", credits: 3, knowledgeBlock: "Kiến thức ngành", required: true, elective: false, electiveGroupId: "" },
    { courseCode: "FAIL1", name: "Mạng máy tính", credits: 3, knowledgeBlock: "Kiến thức ngành", required: true, elective: false, electiveGroupId: "" },
    { courseCode: "REQ2", name: "An toàn thông tin", credits: 3, knowledgeBlock: "Kiến thức ngành", required: true, elective: false, electiveGroupId: "" },
    { courseCode: "EL1", name: "Thiết kế web", credits: 3, knowledgeBlock: "Kiến thức ngành", required: false, elective: true, electiveGroupId: "1" },
    { courseCode: "EL2", name: "Điện toán đám mây", credits: 3, knowledgeBlock: "Kiến thức ngành", required: false, elective: true, electiveGroupId: "1" },
    { courseCode: "EL3", name: "Linux và phần mềm mã nguồn mở", credits: 3, knowledgeBlock: "Kiến thức ngành", required: false, elective: true, electiveGroupId: "1" },
    { courseCode: "EL4", name: "Phân tích thiết kế hệ thống", credits: 3, knowledgeBlock: "Kiến thức ngành", required: false, elective: true, electiveGroupId: "2" },
    { courseCode: "PE1", name: "Giáo dục thể chất", credits: 1, knowledgeBlock: "Giáo dục thể chất", required: false, elective: true, electiveGroupId: "" },
    { courseCode: "PE2", name: "Thể dục tự chọn", credits: 1, knowledgeBlock: "Giáo dục thể chất", required: false, elective: true, electiveGroupId: "" },
  ],
  electiveGroups: [
    { id: "1", offeredCourseCount: 3, requiredCourseCount: 1 },
    { id: "2", offeredCourseCount: 1, requiredCourseCount: 1 },
  ],
};
if (typeof module !== "undefined" && module.exports) module.exports = payload;
root.ULSA_QA_PAYLOAD = payload;
})(globalThis);
