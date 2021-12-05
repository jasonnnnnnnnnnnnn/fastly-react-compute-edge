// @ts-check
const fs = require('fs');
const path = require('path');
const express = require('express');
const matchPath = require('react-router-dom').matchPath;

async function createServer(root = process.cwd()) {
  const resolve = (p) => path.resolve(__dirname, '..', p);

  const app = express();

  /**
   * @type {import('vite').ViteDevServer}
   */
  const vite = await require('vite').createServer({
    root,
    logLevel: 'info',
    server: {
      middlewareMode: 'ssr',
      watch: {
        // During tests we edit the files too fast and sometimes chokidar
        // misses change events, so enforce polling for consistency
        usePolling: true,
        interval: 100,
      },
    },
  });
  // use vite's connect instance as middleware
  app.use(vite.middlewares);

  app.use('*', async (req, res) => {
    try {
      const url = req.originalUrl;

      let template, render;
      // always read fresh template in dev
      template = fs.readFileSync(resolve('fastly/template.html'), 'utf-8');
      template = await vite.transformIndexHtml(url, template);
      render = (await vite.ssrLoadModule('/vite/entry.server.jsx')).render;

      const context = {};
      const pageProps = fakedata();
      const appHtml = render(url, context, pageProps);

      if (context.url) {
        // Somewhere a `<Redirect>` was rendered
        return res.redirect(301, context.url);
      }

      const html = template
        .replace(/<div id="app"><\/div>/, `<div id="app">${appHtml}</div>`)
        .replace(
          '<script id="__SSR_PROPS__" type="application/json"></script>',
          `<script id="__SSR_PROPS__" type="application/json">${JSON.stringify(pageProps)}</script>`
        );

      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      console.log(e.stack);
      res.status(500).end(e.stack);
    }
  });

  return { app, vite };
}

function fakedata(pathname) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'fake', 'posts.json')).toString());
}

createServer().then(({ app }) =>
  app.listen(3000, () => {
    console.log('http://localhost:3000');
  })
);
