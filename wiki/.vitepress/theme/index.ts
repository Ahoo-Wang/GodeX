import DefaultTheme from 'vitepress/theme'
import { onMounted, onBeforeUnmount, watch } from 'vue'
import { useData, useRoute } from 'vitepress'
import './custom.css'

const LIGHT_HERO = '/godex-logo-horizontal.svg'
const DARK_HERO = '/godex-logo-hero.svg'

let heroObserver: MutationObserver | null = null
let mermaidObserver: MutationObserver | null = null

function startHeroObserver(isDark: boolean) {
  stopHeroObserver()
  const apply = () => {
    const img = document.querySelector<HTMLImageElement>('.VPHero .VPImage')
    if (img) {
      const target = isDark ? DARK_HERO : LIGHT_HERO
      if (!img.src.endsWith(new URL(target, location.origin).pathname)) {
        img.src = target
      }
    }
  }
  apply()
  heroObserver = new MutationObserver(apply)
  heroObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
}

function stopHeroObserver() {
  if (heroObserver) {
    heroObserver.disconnect()
    heroObserver = null
  }
}

function bindMermaidZoom(el: HTMLElement) {
  if (el.dataset.zoomBound) return
  el.dataset.zoomBound = 'true'
  el.style.cursor = 'zoom-in'
  el.style.position = 'relative'

  const hint = document.createElement('div')
  hint.className = 'mermaid-zoom-hint'
  hint.innerHTML = '🔍 Click to zoom'
  el.appendChild(hint)
  el.addEventListener('mouseenter', () => hint.style.opacity = '1')
  el.addEventListener('mouseleave', () => hint.style.opacity = '0')

  el.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    openMermaidZoom(el)
  })
}

function openMermaidZoom(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement
  delete clone.dataset.zoomBound
  clone.style.cursor = ''
  clone.style.position = ''
  clone.classList.add('mermaid-zoom-content')

  const hint = clone.querySelector('.mermaid-zoom-hint')
  if (hint) hint.remove()

  const overlay = document.createElement('div')
  overlay.className = 'mermaid-zoom-overlay'

  const closeBtn = document.createElement('button')
  closeBtn.className = 'mermaid-zoom-close'
  closeBtn.innerHTML = '✕'
  closeBtn.title = 'Close (Esc)'

  const toolbar = document.createElement('div')
  toolbar.className = 'mermaid-zoom-toolbar'
  toolbar.innerHTML = 'Scroll to zoom · Drag to pan · Esc to close'

  overlay.appendChild(clone)
  overlay.appendChild(closeBtn)
  overlay.appendChild(toolbar)

  document.body.appendChild(overlay)

  // Auto-fit to viewport
  const svg = clone.querySelector('svg') as SVGSVGElement | null
  const naturalW = svg ? svg.getBoundingClientRect().width : clone.offsetWidth
  const naturalH = svg ? svg.getBoundingClientRect().height : clone.offsetHeight
  const vpW = window.innerWidth * 0.9
  const vpH = window.innerHeight * 0.85
  const fitScale = Math.min(vpW / (naturalW || 1), vpH / (naturalH || 1), 3)

  let scale = fitScale
  let x = 0
  let y = 0
  let dragging = false
  let startX = 0
  let startY = 0

  const updateTransform = () => {
    clone.style.transform = `scale(${scale}) translate(${x}px, ${y}px)`
  }
  updateTransform()

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.15 : 0.15
    scale = Math.min(5, Math.max(0.5, scale + delta))
    updateTransform()
  }

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || e.target === closeBtn) return
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
    if (e.target === overlay || e.target === closeBtn) close()
  })
  closeBtn.addEventListener('click', close)

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKeyDown)

  clone.style.cursor = 'grab'
}

function startMermaidObserver() {
  stopMermaidObserver()

  const bindNew = () => {
    document.querySelectorAll('.mermaid').forEach((el) => {
      bindMermaidZoom(el as HTMLElement)
    })
  }
  bindNew()

  mermaidObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) {
          if (node.classList?.contains('mermaid')) {
            bindMermaidZoom(node as HTMLElement)
          }
          node.querySelectorAll?.('.mermaid').forEach((el) => {
            bindMermaidZoom(el as HTMLElement)
          })
        }
      }
    }
  })
  mermaidObserver.observe(document.body, { childList: true, subtree: true })
}

function stopMermaidObserver() {
  if (mermaidObserver) {
    mermaidObserver.disconnect()
    mermaidObserver = null
  }
}

export default {
  extends: DefaultTheme,
  setup() {
    const route = useRoute()
    const { isDark } = useData()

    onMounted(() => {
      startHeroObserver(isDark.value)
      startMermaidObserver()
    })

    onBeforeUnmount(() => {
      stopHeroObserver()
      stopMermaidObserver()
    })

    watch(() => route.path, () => {
      startMermaidObserver()
    })

    watch(isDark, (v) => {
      startHeroObserver(v)
    })
  },
}
