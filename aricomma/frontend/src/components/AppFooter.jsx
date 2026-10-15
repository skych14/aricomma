import React from 'react'

// 총학생회 복지국 오픈채팅방 — 주소는 여기 한 곳에만 둔다
export const FOOTER_LINK = 'https://open.kakao.com/o/sKmqUEbi'

/** 학생 화면 맨 아래 문구 (홈·더보기 공용) */
export default function AppFooter() {
  return (
    <footer className="home-footer">
      <p>안양대학교 총학생회 ‘온결' 복지국 오픈채팅방 링크</p>
      <a
        className="home-footer-link"
        href={FOOTER_LINK}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="안양대학교 총학생회 온결 복지국 오픈채팅방 열기 (새 창)"
      >
        {FOOTER_LINK}
      </a>
    </footer>
  )
}
