import React from 'react'

/** 로딩 표시. 버튼 안이나 목록 자리표시자에 쓴다. */
export default function Spinner({ size = 'md', className = '' }) {
  return <span className={`ui-spinner${size === 'sm' ? ' ui-spinner--sm' : ''} ${className}`} aria-hidden="true" />
}

/** 목록·화면이 불러오는 중일 때 자리를 채우는 박스. */
export function LoadingBox({ children }) {
  return (
    <div className="ui-loading" role="status">
      <Spinner />
      {children}
    </div>
  )
}
