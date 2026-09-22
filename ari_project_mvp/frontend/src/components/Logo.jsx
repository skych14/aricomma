import React from 'react'
import markUrl from '../assets/logo/ari-mark.svg'
import commaUrl from '../assets/logo/ari-comma.svg'

/* ── 바탕 규칙 ───────────────────────────────────────────────────────────
   comma는 주황(--brand) 바탕 전용, mark는 흰/크림 바탕 전용.
   (comma는 크림색 한 가지로만 그려져 있어 밝은 바탕에서는 보이지 않고,
    mark는 주황 계열이라 주황 면 위에서 뭉개진다.)
   ───────────────────────────────────────────────────────────────────── */

// 원본 SVG 비율. size는 mark면 너비, comma면 높이를 뜻한다.
const VARIANTS = {
  mark:  { url: markUrl,  w: 347, h: 282, minWidth: 32 },
  comma: { url: commaUrl, w: 223, h: 416, minHeight: 120 },
}

/**
 * 아리쉼표 로고.
 *
 * @param {'mark'|'comma'} variant  기본 'mark'
 * @param {number} size             px. mark는 너비, comma는 높이 기준.
 *                                  mark 32px·comma 120px보다 작으면 최소값으로 올린다.
 * @param {boolean} wordmark        true면 로고 옆에 "아리쉼표" 글자를 함께 둔다.
 * @param {string} className
 */
export default function Logo({ variant = 'mark', size, wordmark = false, className }) {
  const spec = VARIANTS[variant] ?? VARIANTS.mark
  const isMark = spec === VARIANTS.mark

  // 최소값 미만은 경고 없이 그냥 올려 맞춘다.
  const base = isMark ? spec.minWidth : spec.minHeight
  const px = Math.max(Number(size) || base, base)

  // 비율 유지: mark는 너비 기준, comma는 높이 기준으로 나머지 한 변을 계산.
  const width = isMark ? px : (px * spec.w) / spec.h
  const height = isMark ? (px * spec.h) / spec.w : px

  // 글자가 이름 역할을 하면 이미지는 장식이 된다.
  const img = (
    <img
      src={spec.url}
      alt={wordmark ? '' : '아리쉼표'}
      width={width}
      height={height}
      style={{ display: 'block', width, height }}
    />
  )

  if (!wordmark) {
    return className ? <span className={className}>{img}</span> : img
  }

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
    >
      {img}
      <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, color: 'var(--ink)' }}>
        아리쉼표
      </span>
    </span>
  )
}
