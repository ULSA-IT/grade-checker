# Chạm GPA — Lập kế hoạch điểm số của bạn

Website dành cho sinh viên Trường Đại học Lao động – Xã hội (ULSA): chọn môn sẽ học, đặt điểm dự kiến và tìm kế hoạch đạt GPA mong muốn. Ứng dụng không yêu cầu tài khoản trường, không có backend và không gửi dữ liệu học tập ra khỏi trình duyệt.

Dự án cộng đồng của **ULSA IT**, không phải sản phẩm chính thức của Trường Đại học Lao động – Xã hội.

## Luồng khuyến nghị

1. Cài tiện ích **Chạm GPA** từ repo `GPA_Prediction_Extension`.
2. Đăng nhập [cổng sinh viên ULSA](https://sinhvien.ulsa.edu.vn/KetQuaHocTap.aspx).
3. Bấm extension và chọn **Phân tích GPA**.
4. Website tự mở, nhận dữ liệu dùng một lần và xóa bản bàn giao khỏi extension.

Nếu bridge không hoạt động, dùng extension xuất một file `diem_ca_nhan.xlsx` rồi nhập file đó tại website. File 6 cột từ extension cũ vẫn đọc được nhưng chỉ có chế độ GPA giới hạn.

## Chạy cục bộ

Website không cần build. Mở bằng một HTTP server tĩnh, ví dụ:

```powershell
python -m http.server 4173
```

Sau đó truy cập `http://localhost:4173`.

## Kiểm thử

```powershell
node --test tests
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

Logo SVG và favicon nằm trong `assets/`, được đóng gói cục bộ và dùng chung nhận diện với tiện ích Chạm GPA. Thay đổi câu chữ không đổi khóa dữ liệu, tên sheet/cột Excel hay cách tính GPA, nên file dự phòng cũ vẫn được hỗ trợ.
