# Kịch bản video demo, 2:00 (quay màn hình 3 cửa sổ: Bà · Con A · Con B)

Gợi ý: đặt `TRUSTKEY_DEMO_FAST=1` để thời gian chờ an toàn tính bằng giây. Thu âm lời thoại tiếng Anh, có phụ đề tiếng Việt (hoặc ngược lại). Xuất .mp4 dưới 100MB.

| Thời điểm | Hình ảnh | Lời thoại (EN) |
|---|---|---|
| 0:00–0:12 | Màn hình đen, chữ: *“Mẹ ơi, con là công an…”* + tiếng chuông điện thoại | “Vietnam’s police keep warning about it: an older parent gets a call from ‘the police’ and is told to move their savings into a ‘holding account’. One person, under pressure, alone. That is the whole attack.” |
| 0:12–0:25 | Landing page TrustKey → **Sign in with Tide** | “TrustKey keeps everyday payments instant, and makes risky ones need the family. No bank officer, admin or AI can override it alone, because TideCloak has no master key.” |
| 0:25–0:38 | Cửa sổ Bà: kịch bản **Pay the vegetable seller** (350,000 ₫) → xanh “Low risk”, chuyển ngay | “Paying the vegetable seller: green, done. Grandma keeps her independence.” |
| 0:38–1:00 | Bà bấm kịch bản **“Police” on the phone**: 45,000,000 ₫, tick “I am on a phone call right now” → khung đỏ “High risk” kèm lý do | “Now the scam call. She’s on the phone, it’s a new account, the note says ‘tạm giữ’. Red. It needs two of her children, plus a cool-off. She can’t approve it herself, because the scammer would just tell her to.” |
| 1:00–1:18 | Cửa sổ Con A và Con B: thông báo hiện ra; họ thấy pseudonym “R_3fa2c1”, các tín hiệu, không thấy tên. Con A bấm **Block transfer** | “Her children see the behaviour, not her contacts. Recipient names, accounts and notes are encrypted in grandma’s browser by Tide’s threshold network. One child calls her, hears the story, and blocks it.” |
| 1:18–1:35 | Trang **What the server sees**: trái là tên thật, phải là JSON chỉ có ciphertext + pseudonym + khung “The AI receives” | “Here’s everything our server stores, and everything the AI sees. Breach it and you get ciphertext and pseudonyms. The AI sees behaviour, never identity, and it has no vote.” |
| 1:35–1:50 | Trang **Receipts** → **Verify all**: toàn “Valid”. Bật “Simulate a hacked server” → “Not valid” | “Every vote is a Tide-signed token plus a proof from the child’s own device, bound to this exact transfer. Verified right here in the browser. If our server edits the amount, the receipts break.” |
| 1:50–2:00 | Trang **Family rules**: 1 người bấm **Freeze transfers**; mở lại cần đủ phiếu. Logo + repo | “Anyone can tighten. Only the family, together, can loosen. TrustKey, built on TideCloak.” |

Lưu ý khi quay
- Dùng 3 hồ sơ trình duyệt khác nhau (3 tài khoản Tide) cho Bà, Con A và Con B.
- Trước khi quay, chuẩn bị sẵn gia đình đã khoá danh sách và vài giao dịch xanh, để “người quen” hiện trong danh bạ.
- Không dùng dữ liệu thật. Mọi tên và số tài khoản trong app đều là giả lập.
