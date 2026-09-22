/* ── 아이콘 ──────────────────────────────────────────────────────────────
   이모지 대신 lucide-react의 선 아이콘(ISC)을 쓴다. 뜻 ↔ 아이콘 대응을 여기
   한 곳에만 두고, 화면에서는 이 이름으로 가져다 쓴다.
   크기는 20~24px, 색은 글자색(currentColor)을 따른다.
   ───────────────────────────────────────────────────────────────────── */
export {
  Accessibility as IconAccessible,   // ♿ 배려 권장석 (색은 --brand-strong)
  AlarmClock as IconExpired,         // ⏰ 만료된 예약
  ArrowLeft as IconBack,             // ← 뒤로
  ArrowRight as IconGo,              // → 이어서 하기
  BedDouble as IconSeat,             // 🛏️ 좌석·침대
  CameraOff as IconCameraOff,        // 📷 카메라를 쓸 수 없음
  Check as IconCheck,                // ✓ 스캔 성공
  ChevronDown as IconExpand,         // ▼ 펼치기
  ChevronUp as IconCollapse,         // ▲ 접기
  CircleCheck as IconDone,           // ✅ 완료
  FileText as IconFile,              // 📄 PDF·첨부
  IdCard as IconVerify,              // 📋 학생 인증
  LayoutDashboard as IconDashboard,  // 🏠 대시보드
  LogOut as IconLogout,
  Mars as IconMale,                  // 🚹 남학우실
  PartyPopper as IconCelebrate,      // 🎉 체크인 완료
  Printer as IconPrint,              // 🖨️ 인쇄
  QrCode as IconQr,                  // QR 체크인
  Search as IconSearch,
  Siren as IconReport,               // 🚨 신고
  Trash2 as IconDelete,
  Users as IconUsers,
  Venus as IconFemale,               // 🚺 여학우실
} from 'lucide-react'
