import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import { t } from './composables/useUiLanguage'
import { installFeedbackDiagnostics } from './composables/useFeedbackDiagnostics'
import { appHttpUrl } from './api/appUrl'

console.log('Welcome to codexui. github: https://github.com/friuns2/codexUI')

installFeedbackDiagnostics()

createApp(App).use(router).mount('#app')

if (
  'serviceWorker' in navigator &&
  import.meta.env.PROD &&
  import.meta.env.VITE_ENABLE_SERVICE_WORKER === '1'
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(appHttpUrl('sw.js')).catch((error) => {
      console.error(t('Service worker registration failed.'), error)
    })
  })
}
