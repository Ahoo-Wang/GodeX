import { onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import mediumZoom from 'medium-zoom'
import './custom.css'

export default {
  extends: DefaultTheme,
  setup() {
    const route = useRoute()

    const initZoom = () => {
      mediumZoom('.vp-doc img:not(.no-zoom)', {
        background: 'rgba(0, 0, 0, 0.92)',
      })

      const attachMermaidZoom = (retries = 0) => {
        const diagrams = document.querySelectorAll('.mermaid')
        if (diagrams.length === 0 && retries < 20) {
          setTimeout(() => attachMermaidZoom(retries + 1), 500)
          return
        }

        diagrams.forEach((container) => {
          if (container.getAttribute('data-zoom-attached')) return
          container.setAttribute('data-zoom-attached', 'true')
          container.style.cursor = 'pointer'

          container.addEventListener('click', () => {
            const svg = container.querySelector('svg')
            if (!svg) return
            openDiagramModal(svg)
          })
        })
      }
      attachMermaidZoom()
    }

    const openDiagramModal = (svg: SVGSVGElement) => {
      const overlay = document.createElement('div')
      overlay.className = 'diagram-zoom-overlay'

      const wrapper = document.createElement('div')
      wrapper.className = 'diagram-zoom-wrapper'

      const controls = document.createElement('div')
      controls.className = 'diagram-zoom-controls'
      controls.innerHTML = `
        <button class="zoom-btn" data-action="zoom-in" title="Zoom in (+)">+</button>
        <button class="zoom-btn" data-action="zoom-out" title="Zoom out (-)">−</button>
        <button class="zoom-btn" data-action="zoom-reset" title="Reset (0)">Reset</button>
        <button class="zoom-btn zoom-close" data-action="close" title="Close (Esc)">✕</button>
      `

      const content = document.createElement('div')
      content.className = 'diagram-zoom-content'
      const cloned = svg.cloneNode(true) as SVGSVGElement

      if (!cloned.getAttribute('viewBox')) {
        const bbox = svg.getBBox()
        cloned.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`)
      }
      cloned.style.width = '100%'
      cloned.style.height = 'auto'
      cloned.style.maxHeight = 'none'

      content.appendChild(cloned)
      wrapper.appendChild(controls)
      wrapper.appendChild(content)
      overlay.appendChild(wrapper)
      document.body.appendChild(overlay)
      document.body.style.overflow = 'hidden'

      let scale = 1
      let translateX = 0
      let translateY = 0
      const applyTransform = () => {
        content.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`
      }

      controls.addEventListener('click', (e) => {
        const action = (e.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action')
        if (action === 'zoom-in') { scale = Math.min(scale * 1.3, 5); applyTransform() }
        if (action === 'zoom-out') { scale = Math.max(scale / 1.3, 0.2); applyTransform() }
        if (action === 'zoom-reset') { scale = 1; translateX = 0; translateY = 0; applyTransform() }
        if (action === 'close') closeOverlay()
      })

      overlay.addEventListener('wheel', (e) => {
        e.preventDefault()
        const delta = e.deltaY > 0 ? 0.9 : 1.1
        scale = Math.min(Math.max(scale * delta, 0.2), 5)
        applyTransform()
      }, { passive: false })

      let isPanning = false
      let startX = 0, startY = 0
      content.addEventListener('mousedown', (e) => {
        isPanning = true; startX = e.clientX - translateX; startY = e.clientY - translateY
        content.style.cursor = 'grabbing'
      })
      document.addEventListener('mousemove', (e) => {
        if (!isPanning) return
        translateX = e.clientX - startX; translateY = e.clientY - startY
        applyTransform()
      })
      document.addEventListener('mouseup', () => {
        isPanning = false; content.style.cursor = 'grab'
      })

      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeOverlay()
        if (e.key === '+' || e.key === '=') { scale = Math.min(scale * 1.3, 5); applyTransform() }
        if (e.key === '-') { scale = Math.max(scale / 1.3, 0.2); applyTransform() }
        if (e.key === '0') { scale = 1; translateX = 0; translateY = 0; applyTransform() }
      }
      document.addEventListener('keydown', keyHandler)

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeOverlay()
      })

      const closeOverlay = () => {
        document.removeEventListener('keydown', keyHandler)
        document.body.style.overflow = ''
        overlay.remove()
      }
    }

    const initFocusMode = () => {
      if (document.getElementById('focus-mode-toggle')) return

      const btn = document.createElement('button')
      btn.id = 'focus-mode-toggle'
      btn.className = 'focus-mode-btn'
      btn.title = 'Toggle focus mode (F)'
      btn.textContent = '\u{1F441}'
      btn.addEventListener('click', toggleFocusMode)
      document.body.appendChild(btn)

      document.addEventListener('keydown', (e) => {
        if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey
          && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
          e.preventDefault()
          toggleFocusMode()
        }
      })
    }

    const toggleFocusMode = () => {
      document.body.classList.toggle('focus-mode')
      const btn = document.getElementById('focus-mode-toggle')
      if (btn) btn.textContent = document.body.classList.contains('focus-mode') ? '\u{1F441}\u{200D}\u{1F5E8}' : '\u{1F441}'
    }

    onMounted(() => { initZoom(); initFocusMode() })
    watch(() => route.path, () => nextTick(() => initZoom()))
  },
}
