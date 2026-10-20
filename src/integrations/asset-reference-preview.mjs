import {
  createReferenceReport,
  findAssetRecord,
  formatReferenceReport,
} from '../../scripts/lib/asset-reference-report.mjs';

const endpoint = '/__keystatic/asset-reference-preview';

export default function assetReferencePreview() {
  return {
    name: 'asset-reference-preview',
    hooks: {
      'astro:server:setup': ({ server }) => {
        server.middlewares.use(async (request, response, next) => {
          const url = new URL(request.url ?? '/', 'http://localhost');
          if (url.pathname !== endpoint) return next();

          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          const kind = url.searchParams.get('kind');
          const slug = url.searchParams.get('slug');
          if (!['image', 'document'].includes(kind) || !slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
            response.statusCode = 400;
            response.end(JSON.stringify({ error: 'Invalid resource request.' }));
            return;
          }

          try {
            const record = await findAssetRecord(kind, slug);
            if (!record) {
              response.statusCode = 404;
              response.end(JSON.stringify({ error: 'Resource not found.' }));
              return;
            }
            const report = await createReferenceReport(record);
            response.statusCode = 200;
            response.end(JSON.stringify({ report, formatted: formatReferenceReport(report) }));
          } catch (error) {
            response.statusCode = 500;
            response.end(
              JSON.stringify({ error: error instanceof Error ? error.message : 'Reference scan failed.' })
            );
          }
        });
      },
    },
  };
}
