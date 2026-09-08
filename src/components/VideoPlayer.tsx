'use client'

/**
 * پخش‌کنندهٔ ویدیوی سؤال:
 *  - لینک YouTube → iframe (پخش/مکث/تمام‌صفحه/سرعت … توسط خود یوتیوب)
 *  - آدرس مستقیم mp4/webm → تگ ویدیوی HTML5 با کنترل‌های کامل
 */
export function VideoPlayer({ url, title }: { url: string; title?: string }) {
  const ytId = parseYouTube(url)
  if (ytId) {
    return (
      <div className="video-frame">
        <iframe
          src={`https://www.youtube.com/embed/${ytId}`}
          title={title ?? 'ویدیوی سؤال'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    )
  }
  return (
    <div className="video-frame">
      {/* controls کامل: پخش/مکث، جلو و عقب، صدا، تمام‌صفحه، سرعت و … */}
      <video controls preload="metadata" playsInline src={url} />
    </div>
  )
}

/** استخراج شناسهٔ ویدیو از لینک‌های متداول YouTube */
function parseYouTube(url: string): string | null {
  const m =
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(url)
  return m ? m[1] : null
}
