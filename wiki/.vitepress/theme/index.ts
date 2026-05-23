import DefaultTheme from 'vitepress/theme'
import { onMounted, watch } from 'vue'
import { useRoute } from 'vitepress'
import './custom.css'

function initMermaidZoom() {
  document.querySelectorAll('.mermaid').forEach(el => {
    if ((el as HTMLElement).dataset.zoomBound) return
    ;(el as HTMLElement).dataset.zoomBound = 'true'
    ;(el as HTMLElement).style.cursor = 'zoom-in'

    el.addEventListener('click', () => openMermaidZoom(el as HTMLElement))
  })
}

function openMermaidZoom(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement
  delete clone.dataset.zoomBound
  clone.style.cursor = ''
  clone.classList.add('mermaid-zoom-content')

  const overlay = document.createElement('div')
  overlay.className = 'mermaid-zoom-overlay'
  overlay.appendChild(clone)

  let scale = 1.5
  let x = 0
  let y = 0
  let dragging = false
  let startX = 0
  let startY = 0

  clone.style.transform = `scale(${scale}) translate(${x}px, ${y}px)`

  const updateTransform = () => {
    clone.style.transform = `scale(${scale}) translate(${x}px, ${y}px)`
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.15 : 0.15
    scale = Math.min(5, Math.max(0.5, scale + delta))
    updateTransform()
  }

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    dragging = true
    startX = e.clientX - x
    startY = e.clientY - y
    clone.style.cursor = 'grabbing'
  }

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return
    x = e.clientX - startX
    y = e.clientY - startY
    updateTransform()
  }

  const onMouseUp = () => {
    dragging = false
    clone.style.cursor = 'grab'
  }

  const close = () => {
    overlay.removeEventListener('wheel', onWheel)
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    overlay.removeEventListener('mousedown', onMouseDown)
    document.removeEventListener('keydown', onKeyDown)
    overlay.remove()
  }

  overlay.addEventListener('wheel', onWheel, { passive: false })
  overlay.addEventListener('mousedown', onMouseDown)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKeyDown)

  clone.style.cursor = 'grab'
  document.body.appendChild(overlay)
}

let mermaidFixTimer: ReturnType<typeof setInterval> | null = null
function fixMermaidDarkMode() {
  if (mermaidFixTimer) clearInterval(mermaidFixTimer)
  let attempts = 0
  mermaidFixTimer = setInterval(() => {
    document.querySelectorAll('.mermaid svg [style]').forEach(el => {
      const s = (el as HTMLElement).style
      if (s.fill && !s.fill.includes('#2d333b') && !s.fill.includes('#1c2333') && !s.fill.includes('#161b22')) {
        s.fill = '#2d333b'
      }
      if (s.stroke && !s.stroke.includes('#6d5dfc') && !s.stroke.includes('#8b949e')) {
        s.stroke = '#6d5dfc'
      }
      if (s.color) s.color = '#e6edf3'
    })
    if (++attempts >= 30) { clearInterval(mermaidFixTimer!); mermaidFixTimer = null }
  }, 500)
}

export default {
  extends: DefaultTheme,
  setup() {
    const route = useRoute()

    onMounted(() => {
      fixMermaidDarkMode()
      setTimeout(initMermaidZoom, 3000)
    })

    watch(() => route.path, () => {
      fixMermaidDarkMode()
      setTimeout(initMermaidZoom, 3000)
    })
  },
}
