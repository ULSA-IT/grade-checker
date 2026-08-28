# ULSA GPA Planner

Website tĩnh phân tích bảng điểm và chương trình đào tạo ULSA. Ứng dụng không yêu cầu tài khoản trường, không có backend và không gửi dữ liệu học tập ra khỏi trình duyệt.

## Luồng khuyến nghị

1. Cài extension `ULSA GPA Planner` từ repo `GPA_Prediction_Extension`.
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

- GPA mục tiêu là TBC tích lũy hệ 4.
- TBC học tập gồm F/F+; TBC tích lũy chỉ gồm học phần đã đạt và có tính TBC.
- Học cải thiện dùng điểm cao hơn giữa điểm hiện tại và điểm dự kiến.
- Chỉ đánh giá điều kiện học phần trong chương trình đào tạo; không kết luận toàn bộ điều kiện tốt nghiệp.
- Phiên bản này áp dụng quy tắc từ D17 trở đi và chưa mô phỏng thi lại/đánh giá lại thành phần.

## Triển khai

Repo được thiết kế để host trực tiếp tại `https://ulsa-it.github.io/grade-checker/` bằng GitHub Pages từ thư mục gốc, không cần Vercel Function hay dịch vụ máy chủ.
