import { useEffect, useState } from 'react'

// 휴대폰 배치로 바뀌는 폭 — index.css의 @media (max-width: 640px)와 같은 값
export const MOBILE_QUERY = '(max-width: 640px)'

/** 지금 화면이 휴대폰 폭인지. 화면을 돌리거나 창 크기를 바꾸면 따라 바뀐다. */
export default function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}
