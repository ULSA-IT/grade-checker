const tableContainer = document.getElementById('tableContainer');
const summaryStats = document.getElementById('summaryStats');
let currentGrades = [];

document.addEventListener('DOMContentLoaded', () => {
    const fileUpload = document.getElementById('fileUpload');
    fileUpload.addEventListener('change', handleFileUpload);
});

function handleFileUpload(e) {
    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = function (event) {
        const workbook = XLSX.read(event.target.result, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        currentGrades = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        renderTable(jsonData);
        calculateSummaryStats(jsonData);
        document.getElementById('improvementSection').style.display = 'block';
    };
    
    reader.readAsBinaryString(file);
}

function renderTable(data) {
    const table = document.createElement('table');
    table.className = 'w-full text-sm text-left text-gray-500 rounded-lg overflow-hidden';

    const thead = document.createElement('thead');
    thead.className = 'text-xs text-gray-700 uppercase bg-indigo-50';

    const headerRow = document.createElement('tr');
    data[0].forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        th.className = 'px-6 py-3';
        //add style to the header
        th.style.fontWeight = 'bold';
        th.style.textAlign = 'left';
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    data.slice(1).forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'bg-white border-b hover:bg-indigo-50 transition';
        row.forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell;
            td.className = 'px-6 py-4';
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableContainer.innerHTML = '';
    tableContainer.appendChild(table);
}

function calculateSummaryStats(data) {
    const grades = data.slice(1);
    const stats = grades.reduce((acc, [index, course, credits, grade10, grade4, letterGrade]) => {
        acc.totalCredits += credits || 0;
        acc.weightedSumGrade10 += (grade10 || 0) * (credits || 0);
        acc.weightedSumGrade4 += (grade4 || 0) * (credits || 0);
        return acc;
    }, { totalCredits: 0, weightedSumGrade10: 0, weightedSumGrade4: 0 });
    
    stats.averageGrade10 = (stats.weightedSumGrade10 / stats.totalCredits).toFixed(3);
    stats.averageGrade4 = (stats.weightedSumGrade4 / stats.totalCredits).toFixed(3);

    summaryStats.innerHTML = `
        <div class="bg-indigo-50 p-4 rounded-lg">
            <p class="text-sm text-gray-600">Total Credits</p>
            <p class="text-2xl font-bold text-indigo-600">${stats.totalCredits}</p>
        </div>
        <div class="bg-green-50 p-4 rounded-lg">
            <p class="text-sm text-gray-600">Avg Grade (10 Scale)</p>
            <p class="text-2xl font-bold text-green-600">${stats.averageGrade10}</p>
        </div>
        <div class="bg-blue-50 p-4 rounded-lg">
            <p class="text-sm text-gray-600">Avg Grade (4 Scale)</p>
            <p class="text-2xl font-bold text-blue-600">${stats.averageGrade4}</p>
        </div>
    `;
}

function calculateImprovements() {
    const targetGpa = parseFloat(document.getElementById('targetGpa').value);
    const maxSubjects = parseInt(document.getElementById('maxSubjects').value);

    const grades = currentGrades.slice(1);
    console.log(grades);
    const totalCredits = grades.reduce((sum, row) => sum + (parseFloat(row[2]) || 0), 0);
    const currentGpa = grades.reduce((sum, row) => {
        const credits = parseFloat(row[2]) || 0;
        const grade = parseFloat(row[4]) || 0; // Assuming grade4 is at index 4
        return sum + (credits * grade);
    }, 0) / totalCredits;

    // Sort subjects by potential improvement impact
    const potentialImprovements = grades
        .map(row => {
            const course = row[1];
            const credits = parseFloat(row[2]) || 0;
            const currentGrade = parseFloat(row[4]) || 0; // Assuming grade4 is at index 4
            const potentialImprovement = (4.0 - currentGrade) * credits;
            return {
                course,
                credits,
                currentGrade,
                improvement: potentialImprovement,
                newGpa: ((currentGpa * totalCredits) + potentialImprovement) / totalCredits
            };
        })
        .sort((a, b) => b.improvement - a.improvement);

    // Generate recommendations
    const recommendations = potentialImprovements
        .slice(0, maxSubjects)
        .filter(subject => subject.newGpa > currentGpa);

    const recommendationList = document.getElementById('recommendationList');
    recommendationList.innerHTML = recommendations
        .map(subject => `
            <li class="recommendation-item">
                <div><strong>${subject.course}</strong></div>
                <div>Credits: ${subject.credits}</div>
                <div>Current Grade: ${subject.currentGrade.toFixed(2)}</div>
                <div class="improvement-indicator">
                    Potential GPA after improvement: ${subject.newGpa.toFixed(2)}
                    (+${(subject.newGpa - currentGpa).toFixed(3)})
                </div>
            </li>
        `).join('');

    if (recommendations.length === 0) {
        recommendationList.innerHTML = `
            <li class="recommendation-item" style="border-left-color: var(--warning);">
                No subjects found that would significantly improve your GPA to reach ${targetGpa}
            </li>
        `;
    }
}