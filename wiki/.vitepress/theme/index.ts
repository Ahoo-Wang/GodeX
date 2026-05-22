import DefaultTheme from 'vitepress/theme'
import { onMounted } from 'vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  setup() {
    onMounted(() => {
      // Fix Mermaid inline style overrides for dark mode
      let attempts = 0
      const fix = setInterval(() => {
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
        if (++attempts >= 30) clearInterval(fix)
      }, 500)

      // Click-to-zoom for Mermaid diagrams
      setTimeout(() => {
        document.querySelectorAll('.mermaid').forEach(el => {
          ;(el as HTMLElement).style.cursor = 'zoom-in'
          el.addEventListener('click', () => {
            const modal = document.createElement('div')
            modal.className = 'mermaid-zoom-modal'
            modal.innerHTML = el.outerHTML
            modal.addEventListener('click', () => modal.remove())
            document.body.appendChild(modal)
          })
        })
      }, 3000)
    })
  },
}
