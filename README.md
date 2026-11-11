# Speaking AI Pro — bản HTML local

Ứng dụng chấm bài nói tiếng Anh bằng Gemini, viết bằng HTML, CSS và JavaScript thuần. Không cần cài gói npm.

## Chạy

1. Mở PowerShell trong thư mục này.
2. Chạy `node server.js`.
3. Mở `http://127.0.0.1:4173` trên trình duyệt.
4. Bấm biểu tượng **⚙** để nhập Gemini API key, hoặc điền khóa vào `const API_KEY = ''` ở đầu `app.js`. Bấm **Kiểm tra API key** để thử khóa và model trước khi tải video.
5. Chọn tệp audio/video tối đa 40 MB rồi bấm **Bắt đầu chấm điểm**.

Khóa nhập trong giao diện mặc định chỉ nằm trong bộ nhớ của tab và mất khi tải lại trang (trừ khi bạn bật **Ghi nhớ khóa**). Nếu đặt trong `app.js`, khóa sẽ nằm trong mã nguồn local theo lựa chọn của bạn. Không chia sẻ thư mục đã chứa khóa.

Sau khi chấm, nhập tên học sinh và lớp, sửa nhận xét nếu cần, rồi sao chép hoặc bấm **Xuất PDF**. Trong hộp thoại in, chọn **Save as PDF / Lưu dưới dạng PDF**.

Mặc định ứng dụng dùng mức **Chi tiết**. Báo cáo nêu lý do chấm từng tiêu chí và, với mỗi lỗi có thể xác định từ bài nói, ghi phần bé đã nói/nghe thấy, cách sửa, giải thích và bài luyện ngắn. Giáo viên vẫn cần nghe lại để xác nhận các dẫn chứng và điểm số trước khi gửi cho phụ huynh.

Trong lúc chấm, giao diện hiển thị bước xử lý hiện tại. Khi hoàn tất sẽ có thông báo ngắn. Nhập đầy đủ **Học sinh** và **Lớp**, sau đó bấm **Lưu vào lịch sử**; báo cáo chỉ xuất hiện trong bảng sau bước này. Nút **Lịch sử chấm** mở bảng thời gian chấm, điểm và nhận xét; có thể lọc theo lớp và tìm tên học sinh không phân biệt chữ hoa, chữ thường. Chọn **Xem báo cáo** để mở lại. Nếu chỉnh sửa báo cáo đã lưu, bấm **Cập nhật lịch sử** để lưu thay đổi. Chọn **Xóa bài chấm** trong bảng và xác nhận để xóa toàn bộ bài chấm đã lưu; thao tác này không thể hoàn tác. Báo cáo cùng thông tin học sinh được lưu trong `localStorage` của trình duyệt hiện tại, không bao gồm tệp audio/video hay API key. Xóa dữ liệu trang trong trình duyệt sẽ xóa lịch sử này.

Ứng dụng gửi tệp và yêu cầu chấm điểm trực tiếp tới Gemini. Cần kết nối Internet và một API key Google AI Studio có quyền dùng model đã chọn. Mặc định là `gemini-3.6-flash` để ưu tiên chất lượng phân tích; có thể đổi trong cài đặt. Nếu model đã chọn trả HTTP 503, ứng dụng thử lại một lần, rồi chuyển sang model dự phòng (`gemini-3.5-flash-lite` hoặc `gemini-3.6-flash`). Tệp vẫn được giữ để thử lại nếu các lượt gọi đều lỗi. Lỗi HTTP 429 là giới hạn/hạn mức API và không được tự động thử lặp.

## Giao diện & tính năng mới

- **Hình nền:** laptop/màn hình rộng dùng `background.jpg`; thiết bị nhỏ (rộng ≤ 820 px, như điện thoại) dùng `hinh_nen_hello_kitty_10_19bd1baa96.jpg`. Muốn đổi ảnh, thay file cùng tên hoặc sửa hai dòng `url(...)` đầu `styles.css`.
- **Ghi âm trực tiếp** bằng micro (tối đa 10 phút, tự đổi sang WAV 16 kHz); cần mở trang qua `http://127.0.0.1:4173`.
- **Trò chơi tiếng Anh** (nút 🎮 trên đầu trang): Đố từ vựng, Nghe và chọn (đọc bằng giọng tiếng Anh của trình duyệt), Sắp xếp chữ cái, Lật thẻ ghép cặp. Gồm 44 từ theo 5 nhóm (động vật, trái cây, đồ ăn, đồ vật, thiên nhiên), có tính điểm, sao và kỷ lục lưu trên trình duyệt. Thêm từ mới ở mảng `WORD_BANK` đầu `games.js`.
- Lựa chọn giáo viên, cách gọi học sinh và độ chi tiết được nhớ cho lần sau.
- **Báo cáo trực quan:** số sao, xếp loại, biểu đồ radar 4 tiêu chí, đánh dấu cụm lỗi trong bản chép lời, so sánh với lần chấm trước của cùng học sinh.
- **Tin nhắn phụ huynh:** một nút tạo sẵn nội dung gửi qua Zalo/Messenger.
- **Lịch sử:** thống kê tổng quan, sắp xếp, biểu đồ tiến bộ theo từng học sinh (lọc đúng một học sinh), xuất CSV mở bằng Excel, sao lưu/khôi phục JSON.
- **Thang điểm** (nút trên thanh đầu trang) giải thích cách xếp loại; bật **Ghi nhớ khóa** trong Cài đặt nếu muốn lưu API key trên trình duyệt (mặc định tắt).

Phần xác thực giấy phép từ Google Apps Script của bản JSX không được đưa vào bản local này. Bản chấm điểm, sửa và xuất báo cáo hoạt động độc lập với hệ thống giấy phép đó.
