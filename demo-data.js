(function exposeDemoData(root) {
  "use strict";

  function createPayload() {
    return {
      schemaVersion: 1,
      fetchedAt: new Date().toISOString(),
      source: {
        mode: "extension",
        programName: "Quản trị nhân lực · Khóa 17 · Dữ liệu minh họa",
        majorName: "Quản trị nhân lực",
        educationSystem: "Đại học chính quy",
        cohort: 17,
        regulationSupported: true,
      },
      summary: {
        academicGpa4: 2.41,
        cumulativeGpa4: 2.65,
        academicGpa10: 6.23,
        accumulatedCredits: 24,
      },
      completedCourses: [
        { courseCode: "HRM101", name: "Nhập môn Quản trị nhân lực", credits: 3, grade10: 7.2, grade4: 3, letterGrade: "B", excludedFromGpa: false },
        { courseCode: "LAW101", name: "Pháp luật đại cương", credits: 3, grade10: 6.6, grade4: 2.5, letterGrade: "C+", excludedFromGpa: false },
        { courseCode: "ECO101", name: "Kinh tế vi mô", credits: 3, grade10: 5.8, grade4: 2, letterGrade: "C", excludedFromGpa: false },
        { courseCode: "MGT101", name: "Quản trị học", credits: 3, grade10: 8, grade4: 3.5, letterGrade: "B+", excludedFromGpa: false },
        { courseCode: "HRM201", name: "Quan hệ lao động", credits: 3, grade10: 6, grade4: 2, letterGrade: "C", excludedFromGpa: false },
        { courseCode: "EL101", name: "Kỹ năng tuyển dụng", credits: 3, grade10: 8.8, grade4: 3.7, letterGrade: "A", excludedFromGpa: false },
        { courseCode: "EL102", name: "Truyền thông nội bộ", credits: 3, grade10: 5.1, grade4: 1.5, letterGrade: "D+", excludedFromGpa: false },
        { courseCode: "EL301", name: "Phân tích dữ liệu nhân sự", credits: 3, grade10: 7.4, grade4: 3, letterGrade: "B", excludedFromGpa: false },
        { courseCode: "HRM301", name: "Nguyên lý tiền lương", credits: 3, grade10: 3.2, grade4: 0.5, letterGrade: "F+", excludedFromGpa: false },
        { courseCode: "PE101", name: "Giáo dục thể chất 1", credits: 1, grade10: 8.6, grade4: 3.7, letterGrade: "A", excludedFromGpa: true },
      ],
      pendingCourses: [
        { courseCode: "HRM301", name: "Nguyên lý tiền lương", credits: 3, knowledgeBlock: "Kiến thức ngành", required: true, elective: false },
        { courseCode: "HRM302", name: "Hoạch định nguồn nhân lực", credits: 3, knowledgeBlock: "Kiến thức ngành", required: true, elective: false },
        { courseCode: "EL201", name: "Đánh giá thực hiện công việc", credits: 3, knowledgeBlock: "Kiến thức chuyên ngành", required: false, elective: true },
        { courseCode: "EL202", name: "Quản trị nhân tài", credits: 3, knowledgeBlock: "Kiến thức chuyên ngành", required: false, elective: true },
        { courseCode: "EL302", name: "Thiết kế trải nghiệm nhân viên", credits: 3, knowledgeBlock: "Kiến thức chuyên ngành", required: false, elective: true },
        { courseCode: "PE102", name: "Giáo dục thể chất 2", credits: 1, knowledgeBlock: "Giáo dục thể chất", required: false, elective: true },
      ],
      curriculumCourses: [
        { courseCode: "HRM101", name: "Nhập môn Quản trị nhân lực", credits: 3, knowledgeBlock: "Kiến thức ngành", required: true, elective: false, electiveGroupId: "" },
        { courseCode: "LAW101", name: "Pháp luật đại cương", credits: 3, knowledgeBlock: "Kiến thức cơ sở", required: true, elective: false, electiveGroupId: "" },
        { courseCode: "ECO101", name: "Kinh tế vi mô", credits: 3, knowledgeBlock: "Kiến thức cơ sở", required: true, elective: false, electiveGroupId: "" },
        { courseCode: "MGT101", name: "Quản trị học", credits: 3, knowledgeBlock: "Kiến thức cơ sở", required: true, elective: false, electiveGroupId: "" },
        { courseCode: "HRM201", name: "Quan hệ lao động", credits: 3, knowledgeBlock: "Kiến thức ngành", required: true, elective: false, electiveGroupId: "" },
        { courseCode: "HRM301", name: "Nguyên lý tiền lương", credits: 3, knowledgeBlock: "Kiến thức ngành", required: true, elective: false, electiveGroupId: "" },
        { courseCode: "HRM302", name: "Hoạch định nguồn nhân lực", credits: 3, knowledgeBlock: "Kiến thức ngành", required: true, elective: false, electiveGroupId: "" },
        { courseCode: "EL101", name: "Kỹ năng tuyển dụng", credits: 3, knowledgeBlock: "Kiến thức chuyên ngành", required: false, elective: true, electiveGroupId: "1" },
        { courseCode: "EL102", name: "Truyền thông nội bộ", credits: 3, knowledgeBlock: "Kiến thức chuyên ngành", required: false, elective: true, electiveGroupId: "1" },
        { courseCode: "EL201", name: "Đánh giá thực hiện công việc", credits: 3, knowledgeBlock: "Kiến thức chuyên ngành", required: false, elective: true, electiveGroupId: "2" },
        { courseCode: "EL202", name: "Quản trị nhân tài", credits: 3, knowledgeBlock: "Kiến thức chuyên ngành", required: false, elective: true, electiveGroupId: "2" },
        { courseCode: "EL301", name: "Phân tích dữ liệu nhân sự", credits: 3, knowledgeBlock: "Kiến thức chuyên ngành", required: false, elective: true, electiveGroupId: "3" },
        { courseCode: "EL302", name: "Thiết kế trải nghiệm nhân viên", credits: 3, knowledgeBlock: "Kiến thức chuyên ngành", required: false, elective: true, electiveGroupId: "3" },
        { courseCode: "PE101", name: "Giáo dục thể chất 1", credits: 1, knowledgeBlock: "Giáo dục thể chất", required: false, elective: true, electiveGroupId: "" },
        { courseCode: "PE102", name: "Giáo dục thể chất 2", credits: 1, knowledgeBlock: "Giáo dục thể chất", required: false, elective: true, electiveGroupId: "" },
      ],
      electiveGroups: [
        { id: "1", offeredCourseCount: 2, requiredCourseCount: 1 },
        { id: "2", offeredCourseCount: 2, requiredCourseCount: 1 },
        { id: "3", offeredCourseCount: 2, requiredCourseCount: 1 },
      ],
    };
  }

  const api = { createPayload };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ChamGpaDemo = api;
})(globalThis);
