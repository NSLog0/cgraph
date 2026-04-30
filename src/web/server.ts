import express from 'express';
import path from 'path';

export async function startWebServer(mcpPort: number, webPort: number): Promise<void> {
  const app = express();
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/config.js', (_req, res) => {
    res.type('js').send(`window.CODENEXUS_API = "http://localhost:${mcpPort}";`);
  });

  await new Promise<void>((resolve) => {
    app.listen(webPort, () => {
      console.log(`  Web UI   → http://localhost:${webPort}`);
      resolve();
    });
  });
}
