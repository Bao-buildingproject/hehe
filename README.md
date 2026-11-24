# MY LIFE PLANNER – Smart Calendar & Habit Tracker

Ứng dụng lịch thông minh để lập kế hoạch, tích hoàn thành công việc và tự động tổng hợp hiệu suất hằng tuần. Giao diện tiếng Việt, có chế độ sáng/tối, dùng tốt trên máy tính, máy tính bảng và điện thoại.

![Lịch tuần](docs/screenshots/week.jpg)

| Theo dõi thói quen | Thống kê hiệu suất | Điện thoại |
|---|---|---|
| ![Thói quen](docs/screenshots/habits.jpg) | ![Thống kê](docs/screenshots/dashboard.jpg) | ![Điện thoại](docs/screenshots/mobile.jpg) |

## Tính năng

- **Lịch 4 chế độ xem**: Ngày (danh sách việc cần làm trong ngày), Tuần, Tháng, Năm. Ngày hiện tại được làm nổi bật, mỗi ngày có thanh tiến độ, có bộ lọc theo danh mục. Phím tắt: ← → để chuyển, `T` về hôm nay, `N` thêm việc, `D/W/M/Y` đổi chế độ xem.
- **Màu trạng thái**: xanh lá là hoàn thành, vàng là đang thực hiện, xám là chưa thực hiện, đỏ là quá hạn. Mỗi trạng thái luôn đi kèm biểu tượng và chữ, không chỉ dựa vào màu.
- **Thêm và sửa công việc**: tên, mô tả, ngày, giờ bắt đầu/kết thúc, danh mục (có sẵn hoặc tự tạo), ưu tiên, màu, mục tiêu số lần mỗi tuần.
- **Lặp lại**: không lặp, hằng ngày, các ngày cụ thể trong tuần, hằng tuần, hằng tháng (theo ngày hoặc theo thứ, ví dụ "Thứ Sáu cuối cùng"), chu kỳ tùy chỉnh (mỗi N ngày/tuần/tháng). Có ngày bắt đầu, ngày kết thúc và xem trước các lần tới.
- **Sửa công việc lặp lại**: chọn **"Chỉ lần này"** hoặc **"Lần này và các lần sau"**. Lịch sử hoàn thành trong quá khứ không bao giờ bị xóa khi sửa lịch tương lai.
- **Tích hoàn thành** ở mọi nơi (lịch, danh sách ngày, bảng thói quen). Có thể bỏ tích lại; mỗi lần thực hiện chỉ được đếm một lần. Hệ thống ghi lại ngày giờ hoàn thành.
- **Nhập nhanh bằng tiếng Việt**, không cần AI: *"Học CFA 2 tiếng vào 19h tối mai"*, *"Gym thứ 2, 4, 6 lúc 6h sáng"*, *"Đọc sách hằng ngày 21h-22h"*, *"Học CFA 5 lần/tuần thứ 2 đến thứ 6"*… Luôn hiện bản xem trước để bạn xác nhận hoặc chỉnh sửa chi tiết.
- **Theo dõi thói quen**: bảng tuần với các ô T2 → CN tích trực tiếp; "—" là ngày không có lịch và không tính là bỏ lỡ. Có tổng số lần và mục tiêu tuần.
- **Chuỗi ngày (streak)**: chuỗi hiện tại, dài nhất, tổng ngày hoàn thành, độ đều đặn tuần/tháng, số tuần liên tiếp đạt mục tiêu.
- **Bảng thống kê**: tiến độ hôm nay, tỷ lệ hoàn thành tuần, tỷ lệ đạt mục tiêu, ngày hiệu quả nhất, so sánh với tuần trước, biểu đồ cột theo ngày, biểu đồ đường 8 tuần, bản đồ nhiệt kiểu GitHub theo tháng, lịch sử theo tuần/tháng. Biểu đồ nào cũng có thể chuyển sang dạng bảng.
- **Quản lý công việc**: tìm kiếm (gõ có dấu hay không dấu đều được), lọc theo danh mục và loại, kéo thả để sắp xếp (dùng được cả bàn phím), tạm dừng/tiếp tục thói quen, xóa có xác nhận.
- **Thông báo**: nhắc trước giờ bắt đầu, báo việc chưa xong, nhắc cuối ngày, tổng kết tối Chủ Nhật. Bật/tắt từng loại. Có thể nhận cả khi đã đóng ứng dụng (Web Push).
- **Dữ liệu**: lưu trong PostgreSQL theo từng tài khoản. Xuất JSON/CSV, nhập (gộp hoặc thay thế), sao lưu và khôi phục trên máy chủ. Xóa dữ liệu quan trọng luôn hỏi xác nhận.
- **Tài khoản**: đăng ký, đăng nhập, đổi mật khẩu, xóa tài khoản. Mỗi tài khoản có dữ liệu riêng hoàn toàn.

Không có dữ liệu mẫu cố định: mọi công việc đều do bạn tự tạo.

## Quy tắc tính toán

| Quy tắc | Cách làm |
|---|---|
| Lần thực hiện | Mỗi lần được lên lịch là một *occurrence* riêng (một dòng trong bảng `task_occurrences`, khóa duy nhất theo công việc + ngày gốc). Tích/bỏ tích chỉ đổi trạng thái của dòng đó, nên không bao giờ đếm trùng. |
| Tuần | Thứ Hai → Chủ Nhật. Múi giờ mặc định là `Asia/Ho_Chi_Minh` (đổi được trong Cài đặt). |
| Tỷ lệ hoàn thành | Việc đã hoàn thành / tổng việc đã lên lịch × 100%. Việc **bị hủy** hoặc **bỏ qua** không tính vào tổng. |
| Quá hạn | Chưa hoàn thành và đã qua giờ kết thúc (hoặc đã hết ngày nếu không đặt giờ). Việc chưa đến hạn không bao giờ bị tính là quá hạn. |
| Đang thực hiện | Bạn tự đánh dấu, hoặc hôm nay đã tới giờ bắt đầu mà chưa qua giờ kết thúc. |
| Số lần và số ngày | "Số lần hoàn thành" đếm từng lần; "số ngày hoàn thành" đếm số ngày khác nhau có ít nhất một lần hoàn thành. |
| Mục tiêu tuần | Tỷ lệ đạt mục tiêu = tổng lần hoàn thành tính vào mục tiêu / tổng mục tiêu. Phần vượt mục tiêu của một thói quen không bù cho thói quen khác. Tuần nào có ít lần lên lịch hơn mục tiêu (mới tạo, tạm dừng, bỏ qua) thì mục tiêu giảm theo. |
| Chuỗi (streak) | Đếm số lần **có lịch** liên tiếp đã hoàn thành. Ngày nghỉ theo lịch, ngày tạm dừng và lần "bỏ qua" không làm đứt chuỗi. Việc hôm nay chưa xong chỉ bị tính khi hết ngày. Thói quen hằng ngày tính bằng "ngày", thói quen khác tính bằng "lần". |
| So sánh tuần | Tuần đang diễn ra so với **cùng các ngày** của tuần trước (T2 → hôm nay). Tuần đã kết thúc thì so cả tuần. |
| Sửa lịch lặp lại | "Lần này và các lần sau" đóng phiên bản cũ của lịch vào ngày trước đó và mở phiên bản mới. Các lần đã hoàn thành tới hôm nay luôn được giữ, kể cả khi lịch mới không còn ngày đó. |

Toàn bộ quy tắc nằm trong `src/lib/domain/` (TypeScript thuần, không phụ thuộc giao diện hay cơ sở dữ liệu). Trình duyệt và máy chủ dùng chung một bộ quy tắc này.

## Chạy trên máy của bạn

Cần cài sẵn **Node.js 22** (https://nodejs.org, bản LTS) và **Docker Desktop** (để có cơ sở dữ liệu PostgreSQL). Nếu đã có PostgreSQL thì không cần Docker.

1. Tải mã nguồn về máy:

   ```bash
   git clone https://github.com/Bao-buildingproject/hehe.git
   ```

   ```bash
   cd hehe
   ```

2. Cài thư viện:

   ```bash
   npm install
   ```

3. Bật cơ sở dữ liệu PostgreSQL (bằng Docker):

   ```bash
   docker compose up -d
   ```

4. Tạo file cấu hình. Giá trị mặc định đã khớp với Docker ở bước 3:

   ```bash
   cp .env.example .env.local
   ```

5. Tạo bảng trong cơ sở dữ liệu (lệnh tự đọc `.env.local`):

   ```bash
   npm run db:migrate
   ```

6. Chạy website:

   ```bash
   npm run dev
   ```

7. Mở trình duyệt vào **http://localhost:3000**, bấm "Đăng ký miễn phí" để tạo tài khoản và bắt đầu dùng.

Muốn chạy bản tối ưu như khi đưa lên mạng: `npm run build` rồi `npm start` (vẫn mở http://localhost:3000).

## Đưa lên mạng (miễn phí): Vercel + Neon

Bạn cần tài khoản [Vercel](https://vercel.com) (đăng nhập bằng GitHub). Cơ sở dữ liệu Neon được tạo ngay trong Vercel.

1. Vào https://vercel.com/new, đăng nhập bằng GitHub. Ở mục **Import Git Repository**, chọn repository `hehe` rồi bấm **Import**. Nếu không thấy repo, bấm **Adjust GitHub App Permissions** để cấp quyền cho repo này.
2. Giữ nguyên các thiết lập và bấm **Deploy**. Lần đầu sẽ **báo lỗi "Thiếu DATABASE_URL"**: đây là chuyện bình thường, vì chưa có cơ sở dữ liệu.
3. Mở project vừa tạo, vào tab **Storage**, bấm **Create Database**, chọn **Neon** rồi **Continue**. Ở mục khu vực (region) chọn **Singapore**, bấm **Create**, sau đó **Connect** với project (để mặc định cho mọi môi trường). Vercel sẽ tự thêm biến `DATABASE_URL`.
4. Vào tab **Deployments**, bấm **⋯** ở bản mới nhất, chọn **Redeploy**. Lần này lệnh build tự tạo bảng dữ liệu (migration) và sẽ thành công.
5. Bấm **Visit** (địa chỉ dạng `https://<tên-project>.vercel.app`), đăng ký tài khoản và bắt đầu dùng.

Máy chủ được cấu hình chạy ở Singapore (`vercel.json`), gần Việt Nam và cùng khu vực với cơ sở dữ liệu nên phản hồi nhanh.

Nếu dùng **Supabase** thay cho Neon: tạo project, vào **Connect → Transaction pooler**, sao chép chuỗi kết nối và dán vào biến `DATABASE_URL` trong **Vercel → Settings → Environment Variables**, rồi Redeploy.

> Gói Hobby (miễn phí) của Vercel dành cho mục đích cá nhân, phi thương mại. Neon và Supabase đều có gói miễn phí đủ cho một người dùng. Gói miễn phí của Supabase có thể tạm dừng project nếu lâu không dùng.

**Cập nhật về sau:** mỗi lần gộp code vào nhánh `main`, Vercel tự build và triển khai lại. Mỗi pull request có một link xem thử riêng. Nếu bản mới có lỗi, vào **Deployments**, chọn bản cũ rồi bấm **Instant Rollback**.

## Nhắc nhở khi đóng ứng dụng (tùy chọn)

Khi ứng dụng **đang mở** và bạn đã bật quyền thông báo, nhắc nhở hoạt động ngay mà không cần cấu hình gì thêm. Để nhận nhắc nhở cả khi **đã đóng** ứng dụng:

1. Tạo khóa VAPID:

   ```bash
   npx web-push generate-vapid-keys
   ```

2. Trên Vercel, thêm các biến môi trường: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (ví dụ `mailto:ban@example.com`) và `CRON_SECRET` (một chuỗi ngẫu nhiên dài). Sau đó Redeploy.
3. Cần một bộ hẹn giờ gọi `https://<tên-miền>/api/cron/reminders` khoảng 5 phút một lần, với header `Authorization: Bearer <CRON_SECRET>`. Chọn một trong hai cách:
   - **cron-job.org** (miễn phí, khuyên dùng): tạo cronjob với URL trên, method POST, thêm header như trên, lịch chạy "Every 5 minutes".
   - **GitHub Actions**: xem hướng dẫn ở đầu file `.github/workflows/reminders.yml`. GitHub có thể chạy trễ vài phút.
4. Trong ứng dụng, vào **Cài đặt → Thông báo**, bật "Nhắc cả khi đã đóng ứng dụng" trên từng thiết bị. Trên iPhone, cần "Thêm vào Màn hình chính" trước (yêu cầu iOS 16.4 trở lên).

Lưu ý: cron của gói Vercel Hobby chỉ chạy được một lần mỗi ngày, không đủ cho nhắc trước giờ bắt đầu.

## Kiến trúc

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4**, các thành phần UI kiểu shadcn/ui trên Radix, **Lucide** icons, **Motion** (Framer Motion), **Recharts**
- **PostgreSQL** + **Drizzle ORM** (migration SQL nằm trong `drizzle/`)
- **TanStack Query**: trình duyệt tải một lần toàn bộ dữ liệu của tài khoản, tính lịch và thống kê ngay trên máy (nên Dashboard cập nhật tức thì khi bạn tích), còn máy chủ lưu lại. Thay đổi được áp dụng ngay trên giao diện rồi gửi lên máy chủ theo đúng thứ tự.
- Không dùng FullCalendar: các chế độ xem được viết riêng để tích hoàn thành ngay trong ô, hiện thanh tiến độ từng ngày và dùng tốt trên điện thoại.

```
src/
  lib/domain/      Quy tắc thuần: ngày tháng, lặp lại, occurrence, thống kê, streak, nhập nhanh, nhắc nhở
  lib/validation.ts  Kiểm tra dữ liệu (zod) dùng chung client/server
  server/          Kết nối DB, xác thực, rate limit, các service nghiệp vụ
  app/api/         REST API (route handlers)
  app/(app)/       Các trang: calendar, habits, dashboard, tasks, settings
  components/      Giao diện
drizzle/           Migration SQL
tests/integration/ Test service với PostgreSQL thật
tests/e2e/         Test trình duyệt (Playwright)
```

### Bảng dữ liệu chính

- `users`, `sessions`: tài khoản và phiên đăng nhập.
- `categories`: danh mục của từng người dùng.
- `tasks`: danh tính công việc (thứ tự sắp xếp, trạng thái tạm dừng).
- `task_versions`: tên, mô tả, danh mục, ưu tiên, màu, giờ, quy tắc lặp (JSON), ngày bắt đầu/kết thúc, mục tiêu tuần, và khoảng hiệu lực (để sửa "lần này và các lần sau" mà không làm mất lịch sử).
- `task_occurrences`: trạng thái từng lần thực hiện (`pending`, `in_progress`, `completed`, `skipped`, `cancelled`), `completed_at`, ngày gốc/ngày thực tế, các chỉnh sửa riêng cho lần đó.
- `backups`, `push_subscriptions`, `notification_log`, `rate_limits`.

## Kiểm thử

```bash
npm test                 # 58 test quy tắc tính toán (không cần DB)
npm run lint
npm run typecheck
```

Test tích hợp **xóa sạch** cơ sở dữ liệu, nên chỉ chạy với DB có tên kết thúc bằng `_test`:

```bash
TEST_DATABASE_URL=postgres://planner:planner@localhost:5432/planner_test npm run test:integration
```

Test trình duyệt (cần build trước):

```bash
DATABASE_URL=postgres://planner:planner@localhost:5432/planner_test npm run build
```

```bash
DATABASE_URL=postgres://planner:planner@localhost:5432/planner_test npm run test:e2e
```

Các trường hợp đã được kiểm thử tự động: tích rồi bỏ tích (kể cả bấm liên tục), một công việc lặp lại nhiều ngày, lịch không đủ 7 ngày (ô "—"), tuần giao giữa hai tháng, chuyển năm (tuần 53), tải lại trình duyệt, sửa lịch lặp lại ("chỉ lần này" và "lần này và các lần sau"), tạm dừng/tiếp tục, xuất/nhập/khôi phục, nhiều tài khoản độc lập, chặn yêu cầu khác nguồn, giao diện điện thoại không bị tràn ngang. GitHub Actions (`.github/workflows/ci.yml`) chạy toàn bộ các bước này cho mỗi pull request.

## Bảo mật

- Mật khẩu băm bằng scrypt. Phiên đăng nhập là token ngẫu nhiên trong cookie `httpOnly` + `Secure` + `SameSite=Lax`; cơ sở dữ liệu chỉ lưu mã băm SHA-256 của token.
- Mọi API kiểm tra phiên và quyền sở hữu: người dùng này không đọc hay sửa được dữ liệu của người khác (có test tự động).
- Chống CSRF: mọi yêu cầu thay đổi dữ liệu phải cùng nguồn (kiểm tra `Origin` / `Sec-Fetch-Site`) và ở dạng JSON.
- Giới hạn tần suất đăng nhập, đăng ký, đổi mật khẩu, nhập dữ liệu (lưu trong Postgres nên hoạt động cả khi chạy nhiều instance).
- Kiểm tra mọi dữ liệu đầu vào bằng zod, giới hạn kích thước. Truy vấn tham số hóa qua Drizzle. Xuất CSV có chống công thức độc hại.
- Có các header bảo mật: CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy.
- Không có khóa bí mật nào trong mã nguồn hoặc phía trình duyệt. Các sự kiện quan trọng (đăng nhập thất bại, đổi mật khẩu, nhập/khôi phục, xóa tài khoản) được ghi log có cấu trúc.

Không hệ thống nào an toàn tuyệt đối. Hãy dùng mật khẩu mạnh và định kỳ tải bản sao lưu JSON.

## Giới hạn hiện tại và hướng phát triển

- Trình duyệt tải toàn bộ dữ liệu của tài khoản mỗi lần mở. Với dữ liệu cá nhân (vài nghìn lượt mỗi năm) việc này nhanh; nếu dữ liệu rất lớn có thể chuyển sang tải theo khoảng thời gian.
- Nhập nhanh dùng bộ quy tắc tiếng Việt (không tốn phí, không gửi dữ liệu ra ngoài). Có thể bổ sung AI (Claude/OpenAI) sau; việc này cần API key của bạn và phát sinh chi phí theo lượt dùng.
- Kéo thả dùng để sắp xếp thứ tự công việc. Kéo một việc sang ngày khác trên lịch chưa hỗ trợ; hiện dùng "Sửa → Chỉ lần này → đổi ngày".
- Chưa có đăng nhập Google, quên mật khẩu qua email và ứng dụng di động gốc (hiện là web app, có thể "Thêm vào Màn hình chính").
- Nhắc nhở khi ứng dụng đã đóng cần thêm bộ hẹn giờ bên ngoài (xem phần trên).

## Câu lệnh

| Lệnh | Việc làm |
|---|---|
| `npm run dev` | Chạy chế độ phát triển |
| `npm run build` | Migration DB rồi build production |
| `npm start` | Chạy bản production |
| `npm run db:generate` | Tạo migration mới sau khi sửa `src/server/db/schema.ts` |
| `npm run db:migrate` | Áp dụng migration |
| `npm test` / `npm run test:integration` / `npm run test:e2e` | Kiểm thử |
