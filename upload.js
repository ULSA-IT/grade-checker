const tableContainer = document.getElementById('tableContainer');
const summaryStats = document.getElementById('summaryStats');

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

        renderTable(jsonData);
        calculateSummaryStats(jsonData);
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
    console.log(grades);
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