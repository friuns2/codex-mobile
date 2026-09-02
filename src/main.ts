import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import { t } from './composables/useUiLanguage'
import { installFeedbackDiagnostics } from './composables/useFeedbackDiagnostics'
import { appPath } from './basePath'

console.log('Welcome to codexui. github: https://github.com/friuns2/codexUI')

installFeedbackDiagnostics()

createApp(App).use(router).mount('#app')

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(appPath('/sw.js')).catch((error) => {
      console.error(t('Service worker registration failed.'), error)
    })
  })
}
