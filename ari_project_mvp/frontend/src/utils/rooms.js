/* ── 학우실·방 설정 ──────────────────────────────────────────────────────
   자리 배치도(SeatsPage)와, 내 자리의 배치도로 바로 보내야 하는 화면
   (더보기·내 자리)이 같은 표를 본다.
   ───────────────────────────────────────────────────────────────────── */
import {
  IconFemale, IconMale, IconRoom, IconRoomCave,
} from '../components/ui/icons.jsx'

// 장애인 배려 권장석 — 표시만 하고 예약 제한·우선권은 없음.
// 좌석번호가 방마다 겹치므로(남/여 일반방 모두 A5-1 존재) 방(location) 단위로 관리
export const ACCESSIBLE_SEATS = {
  '남학우실 일반방': ['A5-1'],
  '여학우실 일반방': ['A6-1'],
}

// 학우실 → 방 → 배치도. 주소의 gender(male|female)·room(general|gul)이 이 표의 키다.
// grid 방의 rows는 [왼쪽 열, 오른쪽 열]의 bunk_group (null = 빈 칸)
// ⚠️ 좌석 위치는 여기에 하드코딩되어 있음. 좌석·방·침대조를 추가/변경하면
//    DB(backend/seed.py, 관리자 화면)와 함께 이 설정도 수정해야 배치도에 표시된다.
//    시안: docs/design/*.png
export const HOUSES = {
  male: {
    label: '남학우실', icon: IconMale,
    rooms: [
      {
        key: 'general', label: '일반방', icon: IconRoom,
        location: '남학우실 일반방', type: 'grid', entrance: 'bottom',
        rows: [['A1', 'A3'], ['A2', 'A4'], [null, 'A5']],
      },
    ],
  },
  female: {
    label: '여학우실', icon: IconFemale,
    rooms: [
      {
        key: 'general', label: '일반방', icon: IconRoom,
        location: '여학우실 일반방', type: 'grid', entrance: 'right',
        rows: [['A1', 'A4'], ['A2', 'A5'], ['A3', 'A6']],
      },
      {
        key: 'gul', label: '굴방', icon: IconRoomCave,
        location: '여학우실 굴방', type: 'plan', groups: ['B1', 'B2', 'B3'],
      },
    ],
  },
}

export const GENDERS = Object.keys(HOUSES)

/**
 * 방 이름(location)으로 그 방 배치도 주소를 찾는다.
 *
 * /api/reservations/me는 room_gender를 내려주지 않고 location만 주므로,
 * 방 이름을 이 표에서 그대로 찾아 학우실·방 키를 얻는다. 표에 없는 방이면
 * (관리자가 새 방을 만든 경우 등) 1단계부터 고르게 한다.
 */
export function seatMapPath(location) {
  for (const [gender, house] of Object.entries(HOUSES)) {
    const room = house.rooms.find(r => r.location === location)
    if (room) return `/seats/${gender}/${room.key}`
  }
  return '/seats'
}
