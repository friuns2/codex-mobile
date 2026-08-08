import { createRouter, createWebHashHistory } from 'vue-router'

const EmptyRouteView = {
  render: () => null,
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: EmptyRouteView,
    },
    {
      path: '/thread/:threadId',
      name: 'thread',
      component: EmptyRouteView,
    },
    {
      path: '/skills',
      name: 'skills',
      component: EmptyRouteView,
    },
    {
      path: '/automations',
      name: 'automations',
      component: EmptyRouteView,
    },
    {
      path: '/sentinels',
      name: 'sentinels',
      component: EmptyRouteView,
    },
    {
      path: '/sentineal',
      name: 'sentineal',
      component: EmptyRouteView,
    },
    {
      path: '/database',
      name: 'database',
      component: EmptyRouteView,
    },
    {
      path: '/ai-models',
      name: 'ai-models',
      component: EmptyRouteView,
    },
    {
      path: '/new-thread',
      redirect: { name: 'home' },
    },
    { path: '/:pathMatch(.*)*', redirect: { name: 'home' } },
  ],
})

export default router
