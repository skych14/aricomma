import React, { useState } from 'react'
import Logo from '../../components/Logo.jsx'
import {
  Button, Card, ConfirmDialog, EmptyState, MenuItem, Modal,
  Notice, PageTitle, SeatTile, Spinner, StatusBadge, Tabs, TextField,
} from '../../components/ui/index.js'
import * as Icons from '../../components/ui/icons.jsx'

/* 부품 전시 화면 (/ui, 관리자 전용).
   모든 부품의 변형·상태를 한 화면에 늘어놓아 디자인을 확인하고,
   이후 시안대로 고칠 때 전후를 비교하는 용도. 실제 기능은 없다. */

function Section({ title, note, children }) {
  return (
    <Card title={title} className="uikit-section">
      {note && <p className="uikit-note">{note}</p>}
      <div className="uikit-row">{children}</div>
    </Card>
  )
}

const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'danger']
const NOTICE_TONES = ['info', 'brand', 'neutral', 'success', 'warning', 'danger']
const SEAT_STATUSES = ['available', 'unavailable', 'selected', 'reserved-by-me']
const BADGES = [
  'pending', 'checked_in', 'completed', 'expired', 'cancelled',
  'approved', 'rejected', 'penalized', 'no_target', 'available', 'reserved', 'occupied',
]
const ICON_NAMES = Object.keys(Icons).filter(n => n.startsWith('Icon'))

export default function UiKitPage() {
  const [tab, setTab] = useState('a')
  const [seg, setSeg] = useState('m')
  const [text, setText] = useState('')
  const [dialog, setDialog] = useState('')   // '' | 'plain' | 'word'
  const [modal, setModal] = useState(false)

  return (
    <div className="uikit">
      <PageTitle>공용 UI 부품</PageTitle>
      <Notice tone="info">
        모든 화면이 쓰는 부품 모음입니다. 색·간격·글꼴은 <strong>tokens.css</strong>의 변수만 씁니다.
        여기서 부품을 고치면 전 화면에 그대로 반영됩니다.
      </Notice>

      <Section title="Logo" note="mark는 흰/크림 바탕 전용, comma는 주황(--brand) 바탕 전용">
        <Logo variant="mark" size={40} />
        <Logo variant="mark" size={32} wordmark />
        <span className="uikit-brand-bg"><Logo variant="comma" size={120} /></span>
      </Section>

      <Section title="Button — variant" note="size=md(44px). 상태 색 버튼은 만들지 않는다">
        {BUTTON_VARIANTS.map(v => <Button key={v} variant={v}>{v}</Button>)}
      </Section>
      <Section title="Button — size sm (36px)">
        {BUTTON_VARIANTS.map(v => <Button key={v} size="sm" variant={v}>{v}</Button>)}
      </Section>
      <Section title="Button — 상태">
        <Button loading>loading</Button>
        <Button disabled>disabled</Button>
        <Button size="sm" loading>loading sm</Button>
        <Button>
          <Icons.IconQr size={18} aria-hidden="true" /> 아이콘 + 글자
        </Button>
      </Section>
      <Section title="Button — block">
        <Button block>가로 꽉 채우기</Button>
      </Section>

      <Section title="TextField">
        <div className="uikit-col">
          <TextField label="이름" placeholder="홍길동" value={text} onChange={e => setText(e.target.value)} />
          <TextField label="학번" placeholder="20210001" hint="가입할 때 쓴 학번과 같아야 해요" />
          <TextField label="이메일" placeholder="example@anyang.ac.kr" error="이미 가입된 이메일입니다" />
          <TextField as="select" label="학우실" defaultValue="male">
            <option value="male">남학우실</option>
            <option value="female">여학우실</option>
          </TextField>
          <TextField as="textarea" label="메모" labelNote="(선택)" rows={3}
            placeholder="상황을 간단히 적어주세요" hint="0 / 300자" />
        </div>
      </Section>

      <Section title="Card" note="elevated는 한 화면의 주인공 카드에만">
        <div className="uikit-col">
          <Card title="기본 카드">그림자 없음 · --radius-card · 패딩 --space-5</Card>
          <Card elevated title="elevated 카드">--shadow-card</Card>
          <Card flat title="flat 카드">목록 안에 겹쳐 놓을 때 1px 테두리</Card>
        </div>
      </Section>

      <Section title="PageTitle">
        <div className="uikit-col">
          <PageTitle>기본 제목 (--ink)</PageTitle>
          <PageTitle tone="brand">주황 강조 제목 (--brand-text)</PageTitle>
          <PageTitle action={<Button size="sm" variant="secondary">동작</Button>}>
            오른쪽 버튼이 있는 제목
          </PageTitle>
        </div>
      </Section>

      <Section title="Notice — tone">
        <div className="uikit-col uikit-col--wide">
          {NOTICE_TONES.map(t => (
            <Notice key={t} tone={t} title={`tone="${t}"`}>안내 문장이 여기에 들어갑니다.</Notice>
          ))}
          <Notice tone="warning" lg title="lg — 화면의 주인공 안내"
            action={<Button block>버튼 자리</Button>}>
            제목이 --fs-title로 커지고 아래에 버튼을 둘 수 있습니다.
          </Notice>
        </div>
      </Section>

      <Section title="StatusBadge" note="예약·인증·신고·좌석 상태를 한 곳에서 매핑">
        {BADGES.map(s => <StatusBadge key={s} status={s} />)}
        <StatusBadge tone="brand" label="관리자" />
        <StatusBadge tone="neutral" label="직전 이용" />
      </Section>

      <Section title="Tabs" note="활성 --brand-text + 2px --brand-strong 밑줄">
        <div className="uikit-col uikit-col--wide">
          <Tabs
            value={tab}
            onChange={setTab}
            label="예시 탭"
            items={[
              { key: 'a', label: '인증', badge: 3 },
              { key: 'b', label: '신고', badge: 12 },
              { key: 'c', label: '사용자' },
              { key: 'd', label: '좌석 관리' },
            ]}
          />
          <Tabs
            value={seg}
            onChange={setSeg}
            fill
            label="학우실 선택"
            items={[
              { key: 'm', label: '남학우실', icon: <Icons.IconMale size={18} aria-hidden="true" />, count: '(4/8)' },
              { key: 'f', label: '여학우실', icon: <Icons.IconFemale size={18} aria-hidden="true" />, count: '(9/12)' },
            ]}
          />
        </div>
      </Section>

      <Section title="SeatTile" note="95×66 (--seat-width × --seat-height)">
        {SEAT_STATUSES.map(s => (
          <SeatTile key={s} seatNumber="A1-1" floor={1} status={s} />
        ))}
        <SeatTile seatNumber="A5-1" floor={1} status="available" accessible />
      </Section>

      <Section title="MenuItem" note="피그마 '더보기' 화면용 — 아직 쓰는 화면 없음">
        <div className="uikit-col uikit-col--wide">
          <MenuItem icon={<Icons.IconSeat size={20} />}>내 예약 보기</MenuItem>
          <MenuItem icon={<Icons.IconVerify size={20} />}>학생 인증</MenuItem>
          <MenuItem icon={<Icons.IconReport size={20} />}>신고하기</MenuItem>
        </div>
      </Section>

      <Section title="EmptyState">
        <div className="uikit-col uikit-col--wide">
          <EmptyState icon={<Icons.IconSeat size={28} />} title="예약 내역이 없습니다." />
          <EmptyState title="내역 없음" compact />
          <EmptyState title="현재 활성 예약이 없습니다."
            action={<Button>좌석 예약하기</Button>} />
        </div>
      </Section>

      <Section title="Spinner">
        <Spinner />
        <Spinner size="sm" />
      </Section>

      <Section title="ConfirmDialog / Modal" note="window.confirm을 대신한다">
        <Button onClick={() => setDialog('plain')}>확인창 열기</Button>
        <Button variant="danger" onClick={() => setDialog('word')}>학번 입력형 확인창</Button>
        <Button variant="secondary" onClick={() => setModal(true)}>Modal 열기</Button>
      </Section>

      <Section title="아이콘" note="lucide-react · 20px · 색은 글자색을 따른다">
        {ICON_NAMES.map(name => {
          const Ico = Icons[name]
          return (
            <span key={name} className="uikit-icon">
              <Ico size={20} aria-hidden="true" />
              <small>{name.replace('Icon', '')}</small>
            </span>
          )
        })}
      </Section>

      {dialog === 'plain' && (
        <ConfirmDialog
          title="예약을 취소할까요?"
          description="A1-1 좌석 예약이 취소됩니다. 다시 예약하려면 좌석 화면에서 새로 골라야 해요."
          confirmLabel="예약 취소"
          tone="danger"
          onConfirm={() => setDialog('')}
          onCancel={() => setDialog('')}
        />
      )}
      {dialog === 'word' && (
        <ConfirmDialog
          title="계정 삭제"
          description="이 계정과 관련 기록이 모두 삭제됩니다. 계속하려면 학번을 입력하세요."
          confirmWord="20210001"
          confirmWordLabel="학번 20210001 입력"
          confirmLabel="삭제"
          tone="danger"
          onConfirm={() => setDialog('')}
          onCancel={() => setDialog('')}
        />
      )}
      {modal && (
        <Modal title="Modal" onClose={() => setModal(false)}>
          <p className="ui-modal-desc">
            ConfirmDialog와 관리자 검토창이 함께 쓰는 바탕입니다. Esc나 바깥을 눌러 닫을 수 있어요.
          </p>
          <div className="ui-modal-actions">
            <Button variant="secondary" onClick={() => setModal(false)}>닫기</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
