const DISALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function isSafeHttpsImageUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (DISALLOWED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
      return false;
    }
    // Block private IP ranges
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.)/.test(host)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

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
    const probeOnly = searchParams.get('probe') === '1';
    const filename = sanitizeFilename(searchParams.get('filename'));

    if (!url || !isSafeHttpsImageUrl(url)) {
      return Response.json(
        { error: 'Invalid or disallowed image URL' },
        { status: 400 }
      );
    }

    const isPinterest = url.includes('pinimg.com');
    const fetchUpstream = (targetUrl: string, method: 'HEAD' | 'GET' = 'GET') =>
      fetch(targetUrl, {
        method,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Referer: isPinterest ? 'https://www.pinterest.com/' : 'https://www.bing.com/',
        },
      });

    let resolvedUrl = url;
    let upstream = await fetchUpstream(url, probeOnly ? 'HEAD' : 'GET');

    if (probeOnly && upstream.status === 405) {
      upstream = await fetchUpstream(url, 'GET');
    }

    // Automatic high-res fallback: if /originals/ 404s or 403s, fall back to /736x/
    if (!upstream.ok && url.startsWith('https://i.pinimg.com/originals/')) {
      const fallback736 = url.replace('/originals/', '/736x/');
      resolvedUrl = fallback736;
      upstream = await fetchUpstream(fallback736, probeOnly ? 'HEAD' : 'GET');

      if (probeOnly && upstream.status === 405) {
        upstream = await fetchUpstream(fallback736, 'GET');
      }

      if (!upstream.ok && !fallback736.endsWith('.jpg')) {
        const jpgFallback = fallback736.replace(/\.(png|webp|gif)$/i, '.jpg');
        if (jpgFallback !== fallback736) {
          resolvedUrl = jpgFallback;
          upstream = await fetchUpstream(jpgFallback, probeOnly ? 'HEAD' : 'GET');
          if (probeOnly && upstream.status === 405) {
            upstream = await fetchUpstream(jpgFallback, 'GET');
          }
        }
      }
    }

    if (!upstream.ok) {
      return Response.json(
        { error: `Failed to fetch image (${upstream.status})` },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';

    if (probeOnly) {
      if (!contentType.toLowerCase().startsWith('image/')) {
        return Response.json(
          { error: `URL did not return an image (${contentType})` },
          { status: 422 }
        );
      }
      const contentLengthHeader = upstream.headers.get('content-length');
      const contentLength = contentLengthHeader ? Number(contentLengthHeader) : 0;
      return Response.json({
        ok: true,
        resolvedUrl,
        contentType,
        contentLength: Number.isFinite(contentLength) ? contentLength : 0,
      });
    }

    const arrayBuffer = await upstream.arrayBuffer();

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
