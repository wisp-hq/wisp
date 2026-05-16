import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'wisp',
  description: 'A multi-user launcher for Selkies containers',

  base: '/wisp/',

  ignoreDeadLinks: [/^https?:\/\/localhost/, /^https?:\/\/wisp\.local/],

  vite: {
    server: { port: 5000 },
  },

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'Contributing', link: '/contributing/development' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting set up',
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'First use', link: '/guide/first-use' },
          ],
        },
        {
          text: 'Running wisp',
          items: [
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Updating', link: '/guide/updating' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          ],
        },
        {
          text: 'Under the hood',
          items: [{ text: 'Architecture', link: '/guide/architecture' }],
        },
      ],
      '/contributing/': [
        {
          text: 'Contributing',
          items: [
            { text: 'Development setup', link: '/contributing/development' },
            { text: 'Project layout', link: '/contributing/project-layout' },
            { text: 'Launch flow', link: '/contributing/launch-flow' },
            { text: 'HTTP surface', link: '/contributing/http-surface' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/wisp-hq/wisp' }],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'wisp 🌬️',
    },

    search: {
      provider: 'local',
    },
  },
});
