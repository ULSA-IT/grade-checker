const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const extRoot = path.resolve(root, '../GPA_Prediction_Extension');
const qaRoot = path.join(root, '.qa');
fs.mkdirSync(qaRoot, { recursive: true });
const run = fs.mkdtempSync(path.join(qaRoot, 'run-'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const errors = [];
const watch = (page) => page.on('pageerror', error => errors.push(error.message));
const table = (id, rows) => `<table id="${id}">${rows.map(row=>`<tr>${row.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
const gradeHtml = `<html><body>${table('grdDiemDaTichLuy', [
  ['Học kỳ','Năm học','Mã học phần','Tên học phần','Số tín chỉ','Điểm hệ 10','Điểm chữ','Điểm hệ 4','Không tính TBC'],
  ['1','2025','LAW1','Môn học minh họa','3','8.5','A','3.7',''],
])}</body></html>`;
const curriculumHtml = `<html><body><input id="lblTenCTDT" value="Hệ: Đại học Khóa: 17 Chuyên Ngành: Ngành minh họa" />${table('GridViewCTDT', [
  ['Mã học phần','Tên học phần','Khối kiến thức','Kỳ thứ','Số tín chỉ','Số tiết','Điều kiện tiên quyết','Bắt buộc','Tự chọn','Nhóm','Ghi chú'],
  ['LAW1','Môn học minh họa','Chuyên ngành','1','3','45','','X','','',''],
  ['LAW2','Môn sẽ học minh họa','Chuyên ngành','2','3','45','','X','','',''],
])}</body></html>`;
const school = 'https://sinhvien.ulsa.edu.vn/KetQuaHocTap.aspx';
const web = 'https://ulsa-it.github.io/grade-checker/';
let loggedIn = true;
let schoolRequests = 0;
async function routes(context) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'ulsa-it.github.io' && url.pathname.startsWith('/grade-checker/')) {
      const relative = url.pathname.slice('/grade-checker/'.length) || 'index.html';
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'Not found' });
      return route.fulfill({ contentType: types[path.extname(file)] || 'text/plain', body: fs.readFileSync(file) });
    }
    if (url.hostname === 'sinhvien.ulsa.edu.vn') {
      schoolRequests++;
      const html = loggedIn ? url.pathname.includes('ChuongTrinh') ? curriculumHtml : gradeHtml
        : '<html><body><input id="txtusername"><input id="txtpassword" type="password"></body></html>';
      return route.fulfill({ contentType: 'text/html', body: html });
    }
    if (url.protocol === 'chrome-extension:') return route.continue();
    return route.abort();
  });
}
async function assertLayout(page) {
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), true, 'horizontal overflow');
  await page.waitForFunction(()=>Array.from(document.images).filter(img=>{const r=img.getBoundingClientRect();return r.width && r.top < innerHeight && r.bottom > 0;}).every(img=>img.complete && img.naturalWidth));
  const broken = await page.locator('img:visible').evaluateAll(images=>images.filter(img=>img.complete && !img.naturalWidth).map(img=>img.src));
  assert.deepEqual(broken, []);
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await routes(context);
    const page = await context.newPage(); watch(page);
    await page.goto(web);
    await page.getByText('Chưa kết nối được Chạm GPA', {exact:true}).waitFor();
    await page.screenshot({ path: path.join(run, 'landing-desktop.png') });
    await page.getByRole('link', {name:'Cài tiện ích Chạm GPA', exact:true}).click();
    await page.getByRole('heading', {name:'Cài Chạm GPA trong 5 bước.'}).waitFor();
    await page.screenshot({ path: path.join(run, 'install-desktop.png') });
    await page.getByRole('radio', {name:'Windows', exact:true}).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('radio', {name:'macOS', exact:true}).isChecked(), true);
    await page.locator('#step-2').scrollIntoViewIfNeeded();
    await assertLayout(page);
    await page.screenshot({ path: path.join(run, 'install-macos.png') });
    // Clipboard denied: test selectable-address fallback without touching user's clipboard.
    await page.evaluate(()=>Object.defineProperty(navigator, 'clipboard', { value: { writeText: async()=>{ throw Error('denied'); } }, configurable:true }));
    await page.getByRole('button', {name:'Sao chép', exact:true}).click();
    assert.match(await page.locator('#copyStatus').textContent(), /Địa chỉ đã được chọn/);
    assert.equal(await page.locator('#extensionsAddress').evaluate(el=>el.selectionEnd-el.selectionStart), 'chrome://extensions'.length);
    await page.goto(web + 'install.html#update');
    assert.equal(await page.locator('#update').evaluate(el=>el.open), true);
    await page.locator('#update > summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#update').evaluate(el=>el.open), false);
    await page.setViewportSize({ width:390,height:844 });
    await page.goto(web + 'install.html');
    await page.locator('#step-1').scrollIntoViewIfNeeded();
    await assertLayout(page);
    await page.screenshot({ path: path.join(run,'install-mobile.png') });
    await page.locator('#step-3').scrollIntoViewIfNeeded();
    await assertLayout(page);
    await page.screenshot({path:path.join(run,'install-mobile-copy.png')});

    // Product onboarding and demo mode use only local synthetic data.
    await page.setViewportSize({ width:1440,height:1000 });
    await page.goto(web);
    await page.evaluate(()=>localStorage.removeItem('cham-gpa:onboarding:v1'));
    await page.reload();
    await page.getByRole('button',{name:'Xem thử với dữ liệu mẫu',exact:true}).click();
    await page.locator('#dashboard').waitFor({state:'visible'});
    await page.locator('#demoBanner').waitFor({state:'visible'});
    await page.locator('#onboardingWelcome').waitFor({state:'visible'});
    await page.screenshot({path:path.join(run,'demo-welcome.png')});
    await page.getByRole('button',{name:'Bắt đầu hướng dẫn',exact:true}).click();
    assert.equal(await page.locator('#tourProgress').textContent(),'1/5');
    for (let step=2; step<=5; step++) {
      await page.getByRole('button',{name:'Tiếp theo',exact:true}).click();
      assert.equal(await page.locator('#tourProgress').textContent(),`${step}/5`);
      if (step === 3) await page.screenshot({path:path.join(run,'demo-tour-courses.png')});
    }
    await page.getByRole('button',{name:'Xem gợi ý tự động',exact:true}).click();
    await page.locator('#coursePlanningPanel').evaluate(element=>{ element.open=true; });
    const elective = page.locator('#pendingCourseRows input[data-field="selected"]:not(:disabled)').first();
    await elective.locator('..').click();
    await page.locator('#targetGpa').fill('3.00');
    await page.getByRole('button',{name:'Tạo 3 kịch bản',exact:true}).click();
    await page.locator('#scenarioSection').waitFor({state:'visible'});
    await page.locator('#onboardingChecklistToggle').click();
    assert.equal(await page.locator('[data-checklist-item="data"]').evaluate(element=>element.classList.contains('is-complete')),true);
    assert.equal(await page.locator('[data-checklist-item="courses"]').evaluate(element=>element.classList.contains('is-complete')),true);
    assert.equal(await page.locator('[data-checklist-item="target"]').evaluate(element=>element.classList.contains('is-complete')),true);
    assert.equal(await page.locator('[data-checklist-item="plan"]').evaluate(element=>element.classList.contains('is-complete')),true);
    const onboardingPrefs = await page.evaluate(()=>JSON.parse(localStorage.getItem('cham-gpa:onboarding:v1')));
    assert.deepEqual(Object.keys(onboardingPrefs).sort(),['customTipSeen','promptSeen','tourCompleted']);
    await page.locator('#closeChecklistButton').click();
    await page.locator('#customTab').click();
    await page.locator('#productTour').waitFor({state:'visible'});
    assert.equal(await page.locator('#tourProgress').textContent(),'1/2');
    await page.keyboard.press('Escape');
    await page.locator('#productTour').waitFor({state:'hidden'});
    await page.setViewportSize({width:390,height:844});
    await page.locator('#headerHelpButton').click();
    await assertLayout(page);
    await page.screenshot({path:path.join(run,'demo-checklist-mobile.png')});
    await page.locator('#replayTourButton').click();
    await page.locator('#productTour').waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('.tour-card').style.right === '12px');
    const mobileTourRect = await page.locator('.tour-card').evaluate(element=>{
      const rect=element.getBoundingClientRect();
      return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:innerWidth,height:innerHeight};
    });
    await page.screenshot({path:path.join(run,'demo-tour-mobile.png')});
    assert.equal(
      mobileTourRect.left>=0 && mobileTourRect.right<=mobileTourRect.width && mobileTourRect.top>=0 && mobileTourRect.bottom<=mobileTourRect.height,
      true,
      `mobile tour card stays in viewport: ${JSON.stringify(mobileTourRect)}`,
    );
    await page.keyboard.press('Escape');
    await context.close();
  } finally { await browser.close(); }
  console.log('Desktop/mobile, OS selector, keyboard, image loading and clipboard fallback: PASS');

  if (process.env.CHAM_SKIP_EXTENSION_QA === '1') {
    assert.deepEqual(errors,[]);
    console.log('Extension browser QA skipped by CHAM_SKIP_EXTENSION_QA=1');
    console.log('QA screenshots:',run);
    return;
  }

  const packageOut = path.join(run,'package');
  const pwsh = process.env.CHAM_PWSH || 'pwsh.exe';
  execFileSync(pwsh, ['-NoProfile','-File',path.join(extRoot,'scripts/package-release.ps1'),'-Tag','v2.1.0','-OutputDirectory',packageOut], {stdio:'pipe'});
  // Extract only the freshly generated, allowlisted archive into this dedicated QA directory.
  execFileSync(pwsh, ['-NoProfile','-Command', `Expand-Archive -LiteralPath '${packageOut.replaceAll("'", "''")}\\ChamGPA.zip' -DestinationPath '${packageOut.replaceAll("'", "''")}\\unpacked'`]);
  const extension = path.join(packageOut,'unpacked','ChamGPA');
  const extensionChannel = process.env.CHAM_QA_EXTENSION_CHANNEL || 'chromium';
  const context = await chromium.launchPersistentContext(path.join(run,'chrome-profile'), {
    channel:extensionChannel, headless:true, viewport:{width:1280,height:900},
    args:[`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    await routes(context);
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', {timeout:15000});
    assert.equal(await worker.evaluate(()=>chrome.runtime.getManifest().version), '2.1.0');
    const page = await context.newPage(); watch(page);
    const before = schoolRequests;
    await page.goto(web);
    await page.getByText('Đã kết nối Chạm GPA · v2.1.0', {exact:true}).waitFor();
    assert.equal(schoolRequests,before,'probe must not load school');
    const noSchool = context.waitForEvent('page');
    await page.getByRole('button',{name:'Kết nối bảng điểm',exact:true}).click();
    const portal = await noSchool; watch(portal);
    await portal.waitForLoadState();
    await page.getByText('Cần đăng nhập cổng sinh viên',{exact:true}).waitFor();
    await page.bringToFront();
    await page.getByRole('button',{name:'Tôi đã đăng nhập — Kết nối lại',exact:true}).click();
    await page.locator('#dashboard').waitFor({state:'visible',timeout:20000});
    await page.getByRole('button',{name:'Để tôi tự khám phá',exact:true}).click();
    assert.equal(await page.locator('#cumulativeGpa').textContent(), '3.70');
    assert.match(await page.locator('#programName').textContent(), /Khóa 17/);
    await page.waitForFunction(()=>document.querySelector('[data-extension-connection]').dataset.state === 'success');
    await new Promise(r=>setTimeout(r,200));
    assert.equal(Object.keys(await worker.evaluate(()=>chrome.storage.session.get(null))).length,0,'payload removed after ACK');
    assert.equal(context.pages().filter(p=>p.url().startsWith(web)).length,1,'same analyzer tab');
    await page.screenshot({path:path.join(run,'connected-dashboard.png')});
    // Simulate expired login and verify retry does not require a new analyzer tab.
    loggedIn = false;
    await page.getByRole('button',{name:'Đổi dữ liệu',exact:true}).click();
    await page.getByRole('button',{name:'Kết nối bảng điểm',exact:true}).click();
    await page.getByText('Cần đăng nhập cổng sinh viên',{exact:true}).waitFor();
    loggedIn = true;
    await page.bringToFront();
    await page.getByRole('button',{name:'Tôi đã đăng nhập — Kết nối lại',exact:true}).click();
    await page.locator('#dashboard').waitFor({state:'visible',timeout:20000});
    assert.equal(await page.locator('#cumulativeGpa').textContent(),'3.70');
    console.log('ZIP installed in isolated Chromium: detection, school tab/login retry, real collector, direct same-tab import, GPA and ACK deletion: PASS (synthetic portal data)');
  } finally { await context.close(); }
  assert.deepEqual(errors,[]);
  console.log('Browser JS errors: NONE');
  console.log('QA screenshots:',run);
})().catch(error=>{console.error(error);process.exitCode=1;});
