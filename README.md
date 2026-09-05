# Chạm GPA — Lập kế hoạch điểm số của bạn

Website dành cho sinh viên Trường Đại học Lao động – Xã hội (ULSA): chọn môn sẽ học, đặt điểm dự kiến và tìm kế hoạch đạt GPA mong muốn. Ứng dụng không yêu cầu tài khoản trường, không có backend và không gửi dữ liệu học tập ra khỏi trình duyệt.

Dự án cộng đồng của **ULSA IT**, không phải sản phẩm chính thức của Trường Đại học Lao động – Xã hội.

## Luồng khuyến nghị

1. Bấm **Cài tiện ích Chạm GPA** và làm theo [hướng dẫn 5 bước](https://ulsa-it.github.io/grade-checker/install.html) dành cho Chrome Windows/macOS.
2. Tải lại website sau khi cài. Khi thấy **Đã kết nối Chạm GPA**, bấm **Kết nối bảng điểm**.
3. Nếu chưa đăng nhập, tiện ích mở [cổng sinh viên ULSA](https://sinhvien.ulsa.edu.vn/KetQuaHocTap.aspx). Đăng nhập ở đó rồi quay lại bấm **Tôi đã đăng nhập — Kết nối lại**.
4. Bảng điểm hiện trong chính tab này; bản bàn giao tạm bị xóa sau khi import thành công.

Không cần nhập mật khẩu vào Chạm GPA. Luồng popup cũ (**Phân tích GPA**) vẫn mở tab kế hoạch riêng và tiếp tục tương thích.

Nếu bridge không hoạt động, dùng extension xuất một file `diem_ca_nhan.xlsx` rồi nhập file đó tại website. File 6 cột từ extension cũ vẫn đọc được nhưng chỉ có chế độ GPA giới hạn.

## Chạy cục bộ

Website không cần build. Mở bằng một HTTP server tĩnh, ví dụ:

```powershell
python -m http.server 4173
```

Sau đó truy cập `http://localhost:4173`.

## Kiểm thử

```powershell
npm test
```

## Phạm vi nghiệp vụ

- **GPA hiện tại** là chỉ số dùng để đặt mục tiêu: chỉ gồm môn đã qua và được tính GPA, tương ứng với “TBC tích lũy hệ 4” trên cổng sinh viên.
- **GPA tính cả môn chưa qua** gồm điểm F/F+ của các môn được tính GPA, tương ứng với “TBC học tập hệ 4”. Mục **Cách hiểu các chỉ số** giải thích để đối chiếu với trường.
- **Tín chỉ đã đạt** là số tín chỉ được trường ghi nhận. **Bảng điểm của bạn** hiển thị chi tiết điểm từng môn.
- Học cải thiện dùng điểm cao hơn giữa điểm hiện tại và điểm dự kiến.
- Điểm dự kiến hệ 10 nhận dấu phẩy hoặc dấu chấm, tối đa hai chữ số thập phân. Ô nhập chặn giá trị trên 10; điểm dưới 4 vẫn được cảnh báo và không thể dùng để tính kế hoạch. Khi quy đổi, điểm được so trực tiếp với ngưỡng điểm chữ, không làm tròn lên (ví dụ 8,49 vẫn là B+, từ 8,50 mới là A).
- Chỉ kiểm tra các môn cần hoàn thành trong chương trình đào tạo; không kết luận toàn bộ điều kiện tốt nghiệp.
- Phiên bản này áp dụng quy tắc từ D17 trở đi và chưa mô phỏng thi lại/đánh giá lại thành phần.

## Triển khai

Repo được thiết kế để host trực tiếp tại `https://ulsa-it.github.io/grade-checker/` bằng GitHub Pages từ thư mục gốc, không cần Vercel Function hay dịch vụ máy chủ.

Trước khi deploy onboarding, publish bộ cài extension 2.1.0 đã kiểm tra và xác nhận link `/releases/latest/download/ChamGPA.zip` hoạt động. Website có liên kết dự phòng tới trang release. Không cần GitHub API hay analytics trong browser để tìm bản mới nhất.

## Onboarding và nhận diện tiện ích

- `install.html`: trang riêng có 5 bước, bộ chọn Windows/macOS, hình SVG đóng gói tại `assets/onboarding/`, hướng dẫn cập nhật và xử lý sự cố. Đây là hình minh họa, không phải ảnh chụp thật.
- `connection.js`: probe bằng request ID, hỏi phiên bản/capability; chỉ nút kết nối mới yêu cầu lấy điểm. Không nhận được phản hồi chỉ có nghĩa chưa kết nối được, không chứng minh tiện ích chưa được cài.
- Trạng thái hết phiên yêu cầu sinh viên đăng nhập ở cổng trường rồi quay lại; không tự theo dõi tài khoản hay đọc mật khẩu.
- Response quá hạn/sai request ID bị bỏ qua. Import Excel hủy yêu cầu đang chờ để dữ liệu đến muộn không ghi đè file sinh viên vừa chọn.
- `chrome://extensions` chỉ có nút sao chép vì không mở trực tiếp được bằng liên kết từ website. Khi clipboard bị từ chối, ô địa chỉ vẫn chọn và sao chép thủ công được.
- Điện thoại có thể import Excel nhưng cần máy tính để cài tiện ích. Chrome trên Windows/macOS là phạm vi hướng dẫn; không hứa hỗ trợ cài trên trình duyệt di động.
- Trạng thái onboarding, điểm và cấu hình kế hoạch không được ghi vào localStorage, database hoặc backend.

`npm run check` kiểm tra cú pháp mọi script ứng dụng, bao gồm onboarding và connection. Test browser bằng dữ liệu mẫu không thay thế nghiệm thu với tài khoản trường thật hoặc máy Mac thật. Bridge production chỉ cho origin/path GitHub Pages: preview localhost không nhận được extension là hành vi dự kiến, không nới quyền cho localhost để kiểm thử.

QA trình duyệt tùy chọn: `node scripts/qa-browser.cjs` khi môi trường phát triển đã có Playwright, Chrome, Chromium dành cho kiểm thử và PowerShell 7. Hai repo phải nằm cạnh nhau với tên hiện tại. Script mở hồ sơ thử riêng, chặn request ngoài các URL fixture, đóng gói/cài ZIP rồi kiểm tra nối bảng điểm giả lập; không dùng hồ sơ hoặc tài khoản Chrome cá nhân. Có thể cấu hình đường dẫn thư viện qua `NODE_PATH`, trình duyệt qua `PLAYWRIGHT_BROWSERS_PATH`, PowerShell qua `CHAM_PWSH`. Ảnh kết quả và hồ sơ thử nằm trong `.qa/`, không đưa lên GitHub.

Logo SVG và favicon nằm trong `assets/`, được đóng gói cục bộ và dùng chung nhận diện với tiện ích Chạm GPA. Thay đổi câu chữ không đổi khóa dữ liệu, tên sheet/cột Excel hay cách tính GPA, nên file dự phòng cũ vẫn được hỗ trợ.
