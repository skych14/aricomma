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
  BedDouble as IconSeat,             // 🛏️ 자리·침대
  BedDouble as IconRoom,             // 🛏️ 일반방
  CameraOff as IconCameraOff,        // 📷 카메라를 쓸 수 없음
  Check as IconCheck,                // ✓ 스캔 성공
  Circle as IconUnmet,               // ○ 조건 미충족 (체크리스트)
  ChevronDown as IconExpand,         // ▼ 펼치기
  ChevronUp as IconCollapse,         // ▲ 접기
  CircleCheck as IconDone,           // ✅ 완료
  CircleCheck as IconMet,            // ✅ 조건 충족 (체크리스트)
  Copy as IconCopy,                  // 📋 복사하기
  DoorOpen as IconExit,              // 🚪 퇴실·예약 취소
  Eye as IconShow,                   // 👁 비밀번호 보기
  EyeOff as IconHide,                // 👁 비밀번호 숨기기
  FileText as IconFile,              // 📄 PDF·첨부
  History as IconHistory,            // 🕘 로그인 기록
  IdCard as IconVerify,              // 📋 학생 인증
  KeyRound as IconPassword,          // 🔑 비밀번호 변경
  LayoutDashboard as IconDashboard,  // 🏠 대시보드
  LayoutGrid as IconSeatMap,         // ▦ 자리 배치도·자리 현황
  LogOut as IconLogout,
  Mail as IconMail,                  // ✉️ 민원 신고
  Mars as IconMale,                  // 🚹 남학우실
  PartyPopper as IconCelebrate,      // 🎉 체크인 완료
  Printer as IconPrint,              // 🖨️ 인쇄
  QrCode as IconQr,                  // QR 체크인
  Search as IconSearch,
  Siren as IconReport,               // 🚨 신고
  Tent as IconRoomCave,              // ⛺ 굴방
  Trash2 as IconDelete,
  UserRound as IconUser,             // 👤 프로필 아바타
  UserX as IconWithdraw,             // 👤 회원 탈퇴 (글자는 --danger)
  Users as IconUsers,
  Venus as IconFemale,               // 🚺 여학우실
} from 'lucide-react'
