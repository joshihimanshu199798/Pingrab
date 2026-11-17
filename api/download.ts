const ALLOWED_PREFIXES = ['https://i.pinimg.com/', 'https://images.unsplash.com/'];

function sanitizeFilename(input: string | null): string {
  const raw = (input || 'pingrab-image.jpg').trim();
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
  return cleaned.length > 0 ? cleaned : 'pingrab-image.jpg';
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    const inline = searchParams.get('inline') === '1';
    const filename = sanitizeFilename(searchParams.get('filename'));

    if (!url || !ALLOWED_PREFIXES.some((prefix) => url.startsWith(prefix))) {
      return Response.json(
        { error: 'Invalid or disallowed image URL' },
        { status: 400 }
      );
    }

    const fetchUpstream = (targetUrl: string) =>
      fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Referer: 'https://www.pinterest.com/',
        },
      });

    let upstream = await fetchUpstream(url);

    // Automatic high-res fallback: if /originals/ 404s or 403s, fall back to /736x/
    if (!upstream.ok && url.startsWith('https://i.pinimg.com/originals/')) {
      const fallback736 = url.replace('/originals/', '/736x/');
      upstream = await fetchUpstream(fallback736);

      if (!upstream.ok && !fallback736.endsWith('.jpg')) {
        const jpgFallback = fallback736.replace(/\.(png|webp|gif)$/i, '.jpg');
        if (jpgFallback !== fallback736) {
          upstream = await fetchUpstream(jpgFallback);
        }
      }
    }

    if (!upstream.ok) {
      return Response.json(
        { error: `Failed to fetch image (${upstream.status})` },
        { status: 502 }
      );
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get('content-type') || 'image/jpeg';

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': inline
          ? `inline; filename="${filename}"`
          : `attachment; filename="${filename}"`,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Download failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
